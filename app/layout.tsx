import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { SessionProvider } from '@/components/session-provider'
import './globals.css'

export const metadata: Metadata = {
  title: 'Forge — AI React Builder',
  description: 'Build React websites with AI. Describe what you want, watch it come to life.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-forge-bg text-forge-text antialiased">
        <SessionProvider>
          {children}
        </SessionProvider>
        <Toaster
          theme="light"
          position="bottom-right"
          toastOptions={{
            style: { background: '#ffffff', border: '1px solid #e0e3eb', color: '#1a1a2e' },
          }}
        />
      </body>
    </html>
  )
}
