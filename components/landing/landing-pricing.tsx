'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Check, Key } from 'lucide-react'

const ease = [0.16, 1, 0.3, 1] as const

const FEATURES = [
  'Unlimited projects',
  '60+ AI tools',
  'GitHub integration',
  'Vercel deployment',
  'Full code ownership',
  'Bring your own Claude API key',
]

export function LandingPricing() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="py-20 lg:py-32 border-t border-pi-border/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Free to Build</h2>
          <p className="text-pi-text-dim text-lg max-w-lg mx-auto">
            No subscriptions. No usage limits. Just bring your own API key.
          </p>
        </motion.div>

        <motion.div
          className="max-w-sm mx-auto rounded-2xl border-2 border-pi-accent/30 bg-pi-surface p-8 relative overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, delay: 0.15, ease }}
        >
          {/* Subtle glow */}
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-pi-accent/5 rounded-full blur-3xl" />

          <div className="relative">
            <p className="text-sm font-semibold text-pi-accent uppercase tracking-wider mb-2">Free</p>
            <div className="flex items-end gap-1 mb-1">
              <span className="text-5xl font-bold text-pi-text">$0</span>
            </div>
            <p className="text-sm text-pi-text-dim mb-8">Forever. No credit card required.</p>

            <ul className="space-y-3 mb-8">
              {FEATURES.map(feature => (
                <li key={feature} className="flex items-center gap-3 text-sm text-pi-text">
                  <Check className="w-4 h-4 text-pi-success flex-shrink-0" />
                  {feature}
                </li>
              ))}
            </ul>

            <div className="flex items-center gap-2 p-3 rounded-xl bg-pi-bg border border-pi-border">
              <Key className="w-4 h-4 text-pi-text-dim flex-shrink-0" />
              <p className="text-xs text-pi-text-dim leading-relaxed">
                You provide your own Anthropic API key. No markup, no limits.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
