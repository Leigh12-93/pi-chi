import type { Metadata, Viewport } from 'next'
import { Toaster } from 'sonner'
import { SessionProvider } from '@/components/session-provider'
import { ThemeProvider } from '@/components/theme-provider'
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem('forge-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}` }} />
      </head>
      <body className="bg-forge-bg text-forge-text antialiased">
        <ThemeProvider>
          <SessionProvider>
            {children}
          </SessionProvider>
        </ThemeProvider>
        <Toaster
          position="top-center"
          richColors
          toastOptions={{
            style: {
              borderRadius: '12px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              fontSize: '13px',
            },
          }}
        />
      </body>
    </html>
  )
}
