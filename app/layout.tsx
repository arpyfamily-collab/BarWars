import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PushNotificationInit } from '@/components/PushNotificationInit'

export const metadata: Metadata = {
  title: 'BarWars',
  description: 'Skip the line. Own the night.',
}

export const viewport: Viewport = {
  themeColor: '#0D0D0D',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PushNotificationInit />
        {children}
      </body>
    </html>
  )
}
