'use client'

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { MessageSquare, Code2, Rocket } from 'lucide-react'

const ease = [0.16, 1, 0.3, 1] as const

const STEPS = [
  {
    num: '01',
    icon: MessageSquare,
    title: 'Describe',
    desc: 'Tell the AI what you want to build in plain English.',
  },
  {
    num: '02',
    icon: Code2,
    title: 'Watch',
    desc: 'Watch files appear in real-time as Claude writes your code.',
  },
  {
    num: '03',
    icon: Rocket,
    title: 'Ship',
    desc: 'Deploy to Vercel with one click. Your repo, your domain.',
  },
]

export function LandingHowItWorks() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section ref={ref} className="py-20 lg:py-32">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">How It Works</h2>
          <p className="text-pi-text-dim text-lg max-w-lg mx-auto">
            Three steps from idea to production. No boilerplate, no config files.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line — desktop only */}
          <div className="hidden md:block absolute top-16 left-[20%] right-[20%] h-px border-t-2 border-dashed border-pi-border/40" />

          {STEPS.map((step, i) => (
            <motion.div
              key={step.num}
              className="relative text-center"
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.15, ease }}
            >
              {/* Number badge */}
              <div className="w-12 h-12 mx-auto mb-5 rounded-full bg-pi-accent/10 border border-pi-accent/20 flex items-center justify-center relative z-10">
                <span className="text-sm font-bold text-pi-accent font-mono">{step.num}</span>
              </div>

              {/* Icon */}
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-pi-surface border border-pi-border flex items-center justify-center">
                <step.icon className="w-6 h-6 text-pi-accent" />
              </div>

              <h3 className="text-lg font-semibold text-pi-text mb-2">{step.title}</h3>
              <p className="text-sm text-pi-text-dim max-w-xs mx-auto">{step.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
