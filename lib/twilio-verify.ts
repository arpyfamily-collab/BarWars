/**
 * Twilio Verify (item 16): Twilio texts the code and checks it; we never see or store it.
 * Credentials come from Vercel env vars set on the BarWars subaccount.
 */
const cfg = () => ({
  sid: process.env.TWILIO_API_KEY_SID ?? '',
  secret: process.env.TWILIO_API_KEY_SECRET ?? '',
  service: process.env.TWILIO_VERIFY_SERVICE_SID ?? '',
})

export function twilioConfigured() {
  const c = cfg()
  return !!(c.sid && c.secret && c.service && process.env.TWILIO_ACCOUNT_SID)
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
  if (!r.ok) throw Object.assign(new Error(r.json?.message || 'Twilio error'), { code: r.json?.code, status: r.status })
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
