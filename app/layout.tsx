import type { Metadata } from 'next'
import { Toaster } from 'sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'Forge — AI React Builder',
  description: 'Build React websites with AI. Describe what you want, watch it come to life.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0a0a] text-gray-100 antialiased">
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: { background: '#1a1a2e', border: '1px solid #2a2a4a', color: '#e0e0e0' },
          }}
        />
      </body>
    </html>
  )
}
