/**
 * Twilio Verify (item 16): Twilio texts the code and checks it; we never see or store it.
 * Credentials come from Vercel env vars set on the BarWars subaccount.
 */
const cfg = () => ({
  sid: process.env.TWILIO_API_KEY_SID ?? '',
  secret: process.env.TWILIO_API_KEY_SECRET ?? '',
  service: process.env.TWILIO_VERIFY_SERVICE_SID ?? '',
})

/** All four settings present and the right kind: service VA…, key SK…, account AC… (catches mix-ups) */
export function twilioConfigured() {
  const c = cfg(), acct = process.env.TWILIO_ACCOUNT_SID ?? ''
  const ok = /^VA[0-9a-f]{32}$/i.test(c.service) && /^SK[0-9a-f]{32}$/i.test(c.sid) && c.secret.length >= 16 && /^AC[0-9a-f]{32}$/i.test(acct)
  if (!ok) console.error('twilio_verify_misconfigured', {
    service: c.service.slice(0, 2) || 'missing', key: c.sid.slice(0, 2) || 'missing', secret: c.secret ? 'set' : 'missing', account: acct.slice(0, 2) || 'missing',
  })
  return ok
}

async function call(path: string, form: Record<string, string>) {
  const c = cfg()
  const res = await fetch(`https://verify.twilio.com/v2/Services/${c.service}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${c.sid}:${c.secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form).toString(),
    cache: 'no-store',
  })
  const json: any = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

/** Text a code. Returns Twilio's status ('pending') or throws with Twilio's error code. */
export async function sendCode(phoneE164: string) {
  const r = await call('Verifications', { To: phoneE164, Channel: 'sms' })
  if (!r.ok) {
    // Diagnostics without secrets: Twilio's full error, the shape of each setting, the number masked
    const shape = (v?: string) => v ? `${v.slice(0, 2)}…(${v.length})${/\s/.test(v) ? ' has-whitespace' : ''}` : 'missing'
    console.error('twilio_verify_detail', {
      twilio: r.json, to: phoneE164.replace(/\d(?=\d{4})/g, '•'),
      service: shape(process.env.TWILIO_VERIFY_SERVICE_SID), key: shape(process.env.TWILIO_API_KEY_SID),
      secretLen: (process.env.TWILIO_API_KEY_SECRET ?? '').length, account: shape(process.env.TWILIO_ACCOUNT_SID),
    })
    throw Object.assign(new Error(r.json?.message || 'Twilio error'), { code: r.json?.code, status: r.status })
  }
  return r.json?.status as string
}

/** Check a code. true only when Twilio says 'approved'. */
export async function checkCode(phoneE164: string, code: string) {
  const r = await call('VerificationCheck', { To: phoneE164, Code: code })
  if (r.status === 404) return false          // expired, already approved, or too many tries
  if (!r.ok) throw Object.assign(new Error(r.json?.message || 'Twilio error'), { code: r.json?.code, status: r.status })
  return r.json?.status === 'approved'
}

/** US numbers only for the Oxford pilot: 10 digits, or 11 starting with 1 → +1XXXXXXXXXX */
export function toUSE164(raw: string): string | null {
  const d = String(raw ?? '').replace(/\D/g, '')
  const ten = d.length === 11 && d.startsWith('1') ? d.slice(1) : d
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(ten) ? `+1${ten}` : null
}
