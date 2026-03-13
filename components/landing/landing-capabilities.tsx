'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { Layout, Briefcase, ShoppingCart, Server, FileText, Settings } from 'lucide-react'

const ease = [0.16, 1, 0.3, 1] as const

const CAPABILITIES = [
  { name: 'SaaS Dashboard', icon: Layout, span: 'md:col-span-2' },
  { name: 'Portfolio Site', icon: Briefcase, span: '' },
  { name: 'E-commerce Store', icon: ShoppingCart, span: '' },
  { name: 'API Backend', icon: Server, span: '' },
  { name: 'Landing Page', icon: FileText, span: '' },
  { name: 'Admin Panel', icon: Settings, span: 'md:col-span-2' },
]

export function LandingCapabilities() {
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
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">Build Anything</h2>
          <p className="text-pi-text-dim text-lg max-w-lg mx-auto">
            From simple landing pages to full-stack applications.
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl mx-auto">
          {CAPABILITIES.map((cap, i) => (
            <motion.div
              key={cap.name}
              className={`group relative aspect-[4/3] rounded-2xl border border-pi-border bg-pi-surface/50 flex flex-col items-center justify-center gap-3 hover:bg-pi-surface hover:border-pi-border-bright transition-all duration-200 cursor-default ${cap.span}`}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.06, ease }}
            >
              <cap.icon className="w-6 h-6 text-pi-text-dim group-hover:text-pi-accent transition-colors" />
              <span className="text-sm font-medium text-pi-text">{cap.name}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
