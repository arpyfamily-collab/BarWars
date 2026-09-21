import QRCode from 'qrcode'
import { v4 as uuidv4 } from 'uuid'

export function generatePassToken(): string {
  return uuidv4()
}

export async function generateQRDataURL(token: string): Promise<string> {
  const payload = JSON.stringify({ t: token, v: 1 })
  return QRCode.toDataURL(payload, {
    width: 300,
    margin: 2,
    color: { dark: '#0D0D0D', light: '#FFFFFF' },
    errorCorrectionLevel: 'H',
  })
}

export function parseQRPayload(raw: string): { token: string } | null {
  try {
    const parsed = JSON.parse(raw)
    if (parsed.t && typeof parsed.t === 'string') {
      return { token: parsed.t }
    }
    return null
  } catch {
    return null
  }
}
