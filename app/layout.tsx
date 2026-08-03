import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'BarWars',
  description: 'Skip the line. Own the night.',
  themeColor: '#0D0D0D',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
