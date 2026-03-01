import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'
import { Geist, Geist_Mono } from 'next/font/google'
import { Toaster } from 'sonner'
import { SessionProvider } from '@/components/session-provider'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'Forge — AI React Builder',
  description: 'Build React websites with AI. Describe what you want, watch it come to life.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#09090b' },
  ],
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const headersList = await headers()
  const nonce = headersList.get('x-nonce') || ''

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('forge-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches))document.documentElement.classList.add('dark')}catch(e){}` }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} font-sans bg-forge-bg text-forge-text antialiased`}>
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
              fontFamily: 'var(--font-sans)',
              borderRadius: '14px',
              boxShadow: '0 4px 16px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.04)',
              fontSize: '13px',
              backdropFilter: 'blur(8px)',
            },
          }}
        />
      </body>
    </html>
  )
}
