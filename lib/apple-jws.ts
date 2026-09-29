/**
 * Verify Apple-signed JWS (StoreKit 2 transactions and App Store Server Notifications V2).
 * Checks: the certificate chain in the header ends at Apple Root CA - G3 (pinned below), each
 * certificate is signed by the next and currently valid, the leaf is Apple's App Store receipt
 * signing certificate, and the ES256 signature over the payload. Node crypto only, no packages.
 */
import { X509Certificate, createVerify, createHash } from 'crypto'

// Apple Root CA - G3 (DER, base64), from https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
// SHA-256 fingerprint 63:34:3A:BF:B8:9A:6A:03:EB:B5:7E:9B:3F:5F:A7:BE:7C:4F:5C:75:6F:30:17:B3:A8:C4:88:C3:65:3E:91:79
const APPLE_ROOT_G3 = 'MIICQzCCAcmgAwIBAgIILcX8iNLFS5UwCgYIKoZIzj0EAwMwZzEbMBkGA1UEAwwSQXBwbGUgUm9vdCBDQSAtIEczMSYwJAYDVQQLDB1BcHBsZSBDZXJ0aWZpY2F0aW9uIEF1dGhvcml0eTETMBEGA1UECgwKQXBwbGUgSW5jLjELMAkGA1UEBhMCVVMwHhcNMTQwNDMwMTgxOTA2WhcNMzkwNDMwMTgxOTA2WjBnMRswGQYDVQQDDBJBcHBsZSBSb290IENBIC0gRzMxJjAkBgNVBAsMHUFwcGxlIENlcnRpZmljYXRpb24gQXV0aG9yaXR5MRMwEQYDVQQKDApBcHBsZSBJbmMuMQswCQYDVQQGEwJVUzB2MBAGByqGSM49AgEGBSuBBAAiA2IABJjpLz1AcqTtkyJygRMc3RCV8cWjTnHcFBbZDuWmBSp3ZHtfTjjTuxxEtX/1H7YyYl3J6YRbTzBPEVoA/VhYDKX1DyxNB0cTddqXl5dvMVztK517IDvYuVTZXpmkOlEKMaNCMEAwHQYDVR0OBBYEFLuw3qFYM4iapIqZ3r6966/ayySrMA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMDA2gAMGUCMQCD6cHEFl4aXTQY2e3v9GwOAEZLuN+yRhHFD/3meoyhpmvOwgPUnPWTxnS4at+qIxUCMG1mihDK1A3UT82NQz60imOlM27jbdoXt2QfyFMm+YhidDkLF1vLUagM6BgD56KyKA=='
const ROOT_SHA256 = '63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179'

const b64url = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

export function verifyAppleJWS<T = any>(jws: string): T {
  const parts = String(jws ?? '').split('.')
  if (parts.length !== 3) throw new Error('JWS_FORMAT')
  const header = JSON.parse(b64url(parts[0]).toString('utf8'))
  if (header.alg !== 'ES256' || !Array.isArray(header.x5c) || header.x5c.length < 3) throw new Error('JWS_HEADER')

  const certs = header.x5c.map((c: string) => new X509Certificate(Buffer.from(c, 'base64')))
  const pinned = new X509Certificate(Buffer.from(APPLE_ROOT_G3, 'base64'))
  const root = certs[certs.length - 1]
  const fp = createHash('sha256').update(root.raw).digest('hex').toUpperCase()
  if (fp !== ROOT_SHA256 || !root.raw.equals(pinned.raw)) throw new Error('JWS_ROOT')

  const now = Date.now()
  for (let i = 0; i < certs.length; i++) {
    const c = certs[i]
    if (now < Date.parse(c.validFrom) || now > Date.parse(c.validTo)) throw new Error('JWS_CERT_DATES')
    const issuer = certs[Math.min(i + 1, certs.length - 1)]
    if (!c.verify(issuer.publicKey)) throw new Error('JWS_CHAIN')
  }
  if (!/Prod ECC Mac App Store and iTunes Store Receipt Signing/i.test(certs[0].subject)) throw new Error('JWS_LEAF')

  const ok = createVerify('SHA256').update(parts[0] + '.' + parts[1])
    .verify({ key: certs[0].publicKey, dsaEncoding: 'ieee-p1363' }, b64url(parts[2]))
  if (!ok) throw new Error('JWS_SIGNATURE')
  return JSON.parse(b64url(parts[1]).toString('utf8')) as T
}

export const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || 'com.arpyfamily.barwars'
