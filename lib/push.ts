/**
 * Push notifications (item 17): iPhones straight through Apple (APNs, token auth with the .p8 key),
 * Androids through Firebase Cloud Messaging HTTP v1 (service account). Replaces the legacy FCM API
 * (shut down by Google in 2024) that every sender used before, so no push was ever delivered.
 * Server-only. Node crypto + http2, no packages.
 */
import { createSign, createPrivateKey } from 'crypto'
import http2 from 'http2'
import { createServiceClient } from '@/lib/supabase'

export type PushMessage = { title: string; body: string; data?: Record<string, string> }
const BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.arpyfamily.barwars'
const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

// ── Apple ────────────────────────────────────────────────────────────────────────────────────────
let apnsJwt: { token: string; at: number } | null = null
function apnsToken(): string | null {
  const kid = process.env.APNS_KEY_ID, iss = process.env.APNS_TEAM_ID, pem = process.env.APNS_PRIVATE_KEY
  if (!kid || !iss || !pem) return null
  if (apnsJwt && Date.now() - apnsJwt.at < 45 * 60_000) return apnsJwt.token   // Apple: refresh within 20-60 min
  const head = b64url(JSON.stringify({ alg: 'ES256', kid })), claims = b64url(JSON.stringify({ iss, iat: Math.floor(Date.now() / 1000) }))
  const key = createPrivateKey(pem.replace(/\\n/g, '\n'))
  const sig = createSign('SHA256').update(`${head}.${claims}`).sign({ key, dsaEncoding: 'ieee-p1363' })
  apnsJwt = { token: `${head}.${claims}.${b64url(sig)}`, at: Date.now() }
  return apnsJwt.token
}

function apnsSend(host: string, device: string, jwt: string, payload: string): Promise<{ status: number; reason?: string }> {
  return new Promise((resolve) => {
    const client = http2.connect(`https://${host}`)
    client.on('error', () => resolve({ status: 0, reason: 'connect' }))
    const req = client.request({
      ':method': 'POST', ':path': `/3/device/${device}`, authorization: `bearer ${jwt}`,
      'apns-topic': BUNDLE_ID, 'apns-push-type': 'alert', 'apns-priority': '10', 'content-type': 'application/json',
    })
    let status = 0, body = ''
    req.on('response', (h) => { status = Number(h[':status']) })
    req.on('data', (c) => { body += c })
    req.on('end', () => { client.close(); let reason; try { reason = JSON.parse(body).reason } catch {} ; resolve({ status, reason }) })
    req.on('error', () => { client.close(); resolve({ status: 0, reason: 'request' }) })
    req.setTimeout(10_000, () => { req.close(); client.close(); resolve({ status: 0, reason: 'timeout' }) })
    req.end(payload)
  })
}

async function sendApple(device: string, m: PushMessage): Promise<'ok' | 'dead' | 'fail'> {
  const jwt = apnsToken()
  if (!jwt) return 'fail'
  const payload = JSON.stringify({ aps: { alert: { title: m.title, body: m.body }, sound: 'default' }, ...(m.data ?? {}) })
  // TestFlight and App Store builds use production; builds run from Xcode use the sandbox
  let r = await apnsSend('api.push.apple.com', device, jwt, payload)
  if (r.status === 400 && r.reason === 'BadDeviceToken') r = await apnsSend('api.sandbox.push.apple.com', device, jwt, payload)
  if (r.status === 200) return 'ok'
  if (r.status === 410 || r.reason === 'BadDeviceToken' || r.reason === 'Unregistered') return 'dead'
  console.error('apns_send_failed', { status: r.status, reason: r.reason })
  return 'fail'
}

// ── Android (Firebase) ───────────────────────────────────────────────────────────────────────────
let fcmAccess: { token: string; exp: number; project: string } | null = null
async function fcmAuth(): Promise<{ token: string; project: string } | null> {
  const raw = process.env.FCM_SERVICE_ACCOUNT
  if (!raw) return null
  if (fcmAccess && Date.now() < fcmAccess.exp - 60_000) return fcmAccess
  let sa: any
  try { sa = JSON.parse(raw) } catch { console.error('fcm_service_account_bad_json'); return null }
  const now = Math.floor(Date.now() / 1000)
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }))
  const sig = createSign('RSA-SHA256').update(`${head}.${claims}`).sign(sa.private_key)
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claims}.${b64url(sig)}` }),
  })
  const j: any = await res.json().catch(() => ({}))
  if (!res.ok || !j.access_token) { console.error('fcm_auth_failed', { status: res.status, error: j.error }); return null }
  fcmAccess = { token: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000, project: sa.project_id }
  return fcmAccess
}

async function sendAndroid(device: string, m: PushMessage): Promise<'ok' | 'dead' | 'fail'> {
  const auth = await fcmAuth()
  if (!auth) return 'fail'
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${auth.project}/messages:send`, {
    method: 'POST', headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: { token: device, notification: { title: m.title, body: m.body }, data: m.data ?? {}, android: { priority: 'HIGH' } } }),
  })
  if (res.ok) return 'ok'
  const j: any = await res.json().catch(() => ({}))
  const code = j?.error?.details?.find((d: any) => d.errorCode)?.errorCode ?? j?.error?.status
  if (res.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') return 'dead'
  console.error('fcm_send_failed', { status: res.status, code })
  return 'fail'
}

/** Send to every registered device of these users. Tokens for uninstalled apps are removed. */
export async function sendPush(userIds: string[], m: PushMessage): Promise<{ sent: number; failed: number; removed: number; devices: number }> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (!ids.length) return { sent: 0, failed: 0, removed: 0, devices: 0 }
  const s = createServiceClient()
  const { data } = await s.from('user_push_tokens').select('id, fcm_token, platform').in('user_id', ids)
  const rows = ((data as any[]) ?? []).filter(r => r.platform === 'ios' || r.platform === 'android')
  let sent = 0, failed = 0; const dead: string[] = []
  await Promise.all(rows.map(async r => {
    const out = r.platform === 'ios' ? await sendApple(r.fcm_token, m) : await sendAndroid(r.fcm_token, m)
    if (out === 'ok') sent++; else if (out === 'dead') dead.push(r.id); else failed++
  }))
  if (dead.length) await s.from('user_push_tokens').delete().in('id', dead)
  return { sent, failed, removed: dead.length, devices: rows.length }
}

/** Staff health check: are the Apple and Firebase credentials accepted? (No real device needed.) */
export async function checkPushCredentials() {
  const out: any = { apple: null, android: null }
  try {
    const jwt = apnsToken()
    if (!jwt) out.apple = { ok: false, detail: 'APNS_KEY_ID / APNS_TEAM_ID / APNS_PRIVATE_KEY not all set' }
    else {
      const fake = '0'.repeat(64)
      const r = await apnsSend('api.push.apple.com', fake, jwt, JSON.stringify({ aps: { alert: 'check' } }))
      // BadDeviceToken = Apple accepted our key and only rejected the fake device
      out.apple = { ok: r.status === 400 && r.reason === 'BadDeviceToken', status: r.status, reason: r.reason }
    }
  } catch (e: any) { out.apple = { ok: false, detail: 'key could not be read: ' + (e?.message ?? 'error') } }
  try {
    const a = await fcmAuth()
    out.android = a ? { ok: true, project: a.project } : { ok: false, detail: 'FCM_SERVICE_ACCOUNT missing or rejected' }
  } catch (e: any) { out.android = { ok: false, detail: e?.message ?? 'error' } }
  return out
}
