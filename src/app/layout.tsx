import type { Metadata, Viewport } from 'next'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import { ServiceWorkerRegistrar } from '@/components/service-worker-registrar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Pulse',
  description: 'Personal AI life-OS — voice-first PWA',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Pulse', statusBarStyle: 'black-translucent' },
}

export const viewport: Viewport = {
  themeColor: '#0a0b16',
  width: 'device-width', initialScale: 1, maximumScale: 1, userScalable: false, viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  )
}
