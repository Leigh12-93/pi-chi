'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Code2, Wrench, Eye, Rocket, GitBranch, Sparkles } from 'lucide-react'

const ease = [0.16, 1, 0.3, 1] as const

const FEATURES = [
  {
    icon: Code2,
    title: 'Live Code Editor',
    desc: 'Monaco editor with syntax highlighting, autocomplete, and real-time AI diffs.',
  },
  {
    icon: Wrench,
    title: '60+ AI Tools',
    desc: 'File ops, GitHub integration, database access, deployment, testing, and more.',
  },
  {
    icon: Eye,
    title: 'Instant Preview',
    desc: 'See your app render live as the AI writes code. No manual refresh needed.',
  },
  {
    icon: Rocket,
    title: 'One-Click Deploy',
    desc: 'Push to Vercel production in seconds with custom domains.',
  },
  {
    icon: GitBranch,
    title: 'GitHub-Native',
    desc: 'Your code lives in your repos. Branch, PR, and collaborate normally.',
  },
  {
    icon: Sparkles,
    title: 'Self-Evolving',
    desc: 'The AI can read and improve its own source code. It gets better as you use it.',
  },
]

export function LandingFeatures() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="py-20 lg:py-32 border-t border-forge-border/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Everything You Need</h2>
          <p className="text-forge-text-dim text-lg max-w-lg mx-auto">
            A complete development environment powered by Claude.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((feature, i) => (
            <motion.div
              key={feature.title}
              className="group p-6 rounded-2xl border border-forge-border bg-forge-surface/50 hover:border-forge-border-bright hover:bg-forge-surface transition-all duration-200"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.08, ease }}
              style={{ willChange: 'transform' }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div className="w-10 h-10 rounded-xl bg-forge-accent/10 flex items-center justify-center mb-4 group-hover:bg-forge-accent/15 transition-colors">
                <feature.icon className="w-5 h-5 text-forge-accent" />
              </div>
              <h3 className="text-base font-semibold text-forge-text mb-1.5">{feature.title}</h3>
              <p className="text-sm text-forge-text-dim leading-relaxed">{feature.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
