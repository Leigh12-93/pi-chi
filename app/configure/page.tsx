'use client'

import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'

/** Vercel Integration configuration page — redirects to main app settings */
export default function ConfigurePage() {
  const searchParams = useSearchParams()
  const configurationId = searchParams.get('configurationId')

  useEffect(() => {
    // Redirect to main app — the integration is already installed
    window.location.href = '/'
  }, [])

  return (
    <div className="min-h-screen bg-forge-bg flex items-center justify-center">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-xl bg-forge-accent/20 flex items-center justify-center animate-pulse">
          <svg className="w-6 h-6 text-forge-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <p className="text-sm text-forge-text">Vercel integration configured</p>
        <p className="text-xs text-forge-text-dim">Redirecting to Forge...</p>
      </div>
    </div>
  )
}
