'use client'

import { useState } from 'react'
import { LandingNav } from './landing-nav'
import './landing.css'
import { LandingHero } from './landing-hero'
import { LandingSocialProof } from './landing-social-proof'
import { LandingHowItWorks } from './landing-how-it-works'
import { LandingFeatures } from './landing-features'
import { LandingDemo } from './landing-demo'
import { LandingCapabilities } from './landing-capabilities'
import { LandingPricing } from './landing-pricing'
import { LandingCta } from './landing-cta'
import { LandingFooter } from './landing-footer'

export function LandingPage() {
  const [loading, setLoading] = useState(false)

  const handleSignIn = () => {
    setLoading(true)
    window.location.href = '/api/auth/login'
  }

  return (
    <div className="min-h-screen bg-pi-bg text-pi-text overflow-x-hidden scroll-smooth">
      <LandingNav onSignIn={handleSignIn} loading={loading} />
      <LandingHero onSignIn={handleSignIn} loading={loading} />
      <LandingSocialProof />
      <LandingHowItWorks />
      <LandingFeatures />
      <LandingDemo />
      <LandingCapabilities />
      <LandingPricing />
      <LandingCta onSignIn={handleSignIn} loading={loading} />
      <LandingFooter />
    </div>
  )
}
