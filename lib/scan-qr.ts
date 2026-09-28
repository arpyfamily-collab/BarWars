'use client'

/**
 * Read a QR code with the camera: the native camera in the iOS app, a photo picker on the web.
 * Same approach as the Bracelet Hunt (photo + jsQR), so it works on Build 3 with no new permission.
 */
import jsQR from 'jsqr'
import { Capacitor } from '@capacitor/core'
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from '@capacitor/camera'

async function decode(dataUrl: string): Promise<string | null> {
  const img = new Image()
  img.src = dataUrl
  await new Promise<void>((resolve, reject) => { img.onload = () => resolve(); img.onerror = () => reject(new Error('Image load failed')) })
  // Scale big photos down: faster and just as readable
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height)
  return jsQR(data.data, data.width, data.height)?.data ?? null
}

export async function scanQrCode(): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const photo = await CapacitorCamera.getPhoto({ resultType: CameraResultType.DataUrl, source: CameraSource.Camera, quality: 85 })
    return photo.dataUrl ? decode(photo.dataUrl) : null
  }
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/*'; input.setAttribute('capture', 'environment')
    input.onchange = () => {
      const f = input.files?.[0]
      if (!f) return resolve(null)
      const r = new FileReader()
      r.onload = () => decode(String(r.result)).then(resolve).catch(() => resolve(null))
      r.readAsDataURL(f)
    }
    input.click()
  })
}

/** A bar's door code from a scanned QR (".../scan/ABCD2345") or typed by hand. */
export function extractDoorCode(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = raw.toUpperCase().match(/\/SCAN\/([A-Z0-9]{8})\b/) ?? raw.toUpperCase().replace(/[\s-]/g, '').match(/^([A-Z0-9]{8})$/)
  return m ? m[1] : null
}
