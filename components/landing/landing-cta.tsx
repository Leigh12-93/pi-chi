'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { ArrowRight } from 'lucide-react'

interface LandingCtaProps {
  onSignIn: () => void
  loading: boolean
}

const ease = [0.16, 1, 0.3, 1] as const

export function LandingCta({ onSignIn, loading }: LandingCtaProps) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="py-20 lg:py-32 border-t border-pi-border/20 relative overflow-hidden">
      {/* Grid background */}
      <div className="absolute inset-0 landing-grid-bg opacity-30" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease }}
        >
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4">
            Ready to build?
          </h2>
          <p className="text-pi-text-dim text-lg mb-8 max-w-md mx-auto">
            From idea to production in minutes, not days.
          </p>
          <button
            onClick={onSignIn}
            disabled={loading}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-pi-accent text-white font-medium text-lg hover:bg-pi-accent-hover transition-colors disabled:opacity-50"
          >
            {loading ? 'Connecting...' : 'Start Building — Free'}
            <ArrowRight className="w-5 h-5" />
          </button>
          <p className="text-xs text-pi-text-dim/50 mt-4">
            No credit card required. Bring your own API key.
          </p>
        </motion.div>
      </div>
    </section>
  )
}
