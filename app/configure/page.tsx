'use client'

import { useEffect } from 'react'

/** Vercel Integration configuration page — redirects to main app settings */
export default function ConfigurePage() {
  useEffect(() => {
    // Redirect to main app — the integration is already installed
    window.location.href = '/'
  }, [])

  return (
    <div className="min-h-screen bg-pi-bg flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-xl bg-pi-accent/20 flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-pi-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm text-pi-text">Vercel integration configured</p>
        <p className="text-xs text-pi-text-dim">Redirecting to Pi-Chi...</p>
      </div>
    </div>
  )
}
