'use client'

import { useRef, useEffect, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import { ArrowRight, Brain, Cpu, Wifi, Thermometer, HardDrive, Activity } from 'lucide-react'

interface LandingHeroProps {
  onSignIn: () => void
  loading: boolean
}

const ACTIVITY_LINES = [
  { time: '07:00', text: 'Woke up. Checking system health...', type: 'system' },
  { time: '07:01', text: 'CPU: 42°C | RAM: 1.2GB free | GPIO: 26 pins ready', type: 'status' },
  { time: '07:02', text: 'Goal set: Monitor garden sensors today', type: 'goal' },
  { time: '07:05', text: 'Reading soil moisture on GPIO17... 68%', type: 'action' },
  { time: '07:06', text: 'Temperature sensor (GPIO4): 19.3°C', type: 'action' },
  { time: '07:07', text: 'Decision: Too dry. Activating pump on GPIO27', type: 'goal' },
  { time: '07:08', text: 'Pump ON for 45 seconds. Soil target: 75%', type: 'action' },
  { time: '07:09', text: 'Pump OFF. Re-reading moisture... 74%. Task complete.', type: 'success' },
]

const ease = [0.16, 1, 0.3, 1] as const

export function LandingHero({ onSignIn, loading }: LandingHeroProps) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const [displayedLines, setDisplayedLines] = useState(0)

  useEffect(() => {
    if (!isInView) return
    const timer = setInterval(() => {
      setDisplayedLines(prev => {
        if (prev >= ACTIVITY_LINES.length) {
          clearInterval(timer)
          return prev
        }
        return prev + 1
      })
    }, 400)
    return () => clearInterval(timer)
  }, [isInView])

  const scrollToDemo = () => {
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })
  }

  const getLineColor = (type: string) => {
    switch (type) {
      case 'system': return 'text-pi-text-dim'
      case 'status': return 'text-cyan-500'
      case 'goal': return 'text-pi-accent'
      case 'action': return 'text-pi-success'
      case 'success': return 'text-emerald-400'
      default: return 'text-pi-text'
    }
  }

  return (
    <section ref={ref} className="relative pt-28 pb-20 lg:pt-36 lg:pb-32">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Left — text */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease }}
          >
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pi-accent/10 text-pi-accent text-xs font-medium mb-6">
              <Brain className="w-3.5 h-3.5" />
              Autonomous AI Agent
            </span>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
              <motion.span
                className="block"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.1, ease }}
              >
                Think.
              </motion.span>
              <motion.span
                className="block"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.25, ease }}
              >
                Decide.
              </motion.span>
              <motion.span
                className="block text-shimmer"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.4, ease }}
              >
                Act.
              </motion.span>
            </h1>

            <motion.p
              className="text-lg text-pi-text-dim max-w-md mb-8"
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.55, ease }}
            >
              An autonomous AI brain for your Raspberry Pi. Full system control, GPIO access, self-directed goals. It decides what to do and when.
            </motion.p>

            <motion.div
              className="flex flex-wrap gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.65, ease }}
            >
              <button
                onClick={onSignIn}
                disabled={loading}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-pi-accent text-white font-medium hover:bg-pi-accent-hover transition-colors disabled:opacity-50"
              >
                {loading ? 'Connecting...' : 'Enter Mission Control'}
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={scrollToDemo}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-pi-border text-pi-text-dim font-medium hover:text-pi-text hover:border-pi-border-bright transition-colors"
              >
                See How It Works
              </button>
            </motion.div>

            {/* Feature pills */}
            <motion.div
              className="flex flex-wrap gap-2 mt-8"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ duration: 0.5, delay: 0.8, ease }}
            >
              {[
                { icon: Cpu, label: 'Full System Control' },
                { icon: Activity, label: 'GPIO Access' },
                { icon: Brain, label: 'Self-Directed Goals' },
                { icon: Wifi, label: 'Network Aware' },
              ].map(({ icon: Icon, label }) => (
                <span key={label} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-pi-surface border border-pi-border text-[11px] text-pi-text-dim">
                  <Icon className="w-3 h-3" />
                  {label}
                </span>
              ))}
            </motion.div>
          </motion.div>

          {/* Right — mission control mockup */}
          <motion.div
            className="relative hidden lg:block"
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.3, ease }}
          >
            <div className="rounded-2xl border border-pi-border bg-pi-surface overflow-hidden shadow-2xl shadow-pi-accent/5"
              style={{ transform: 'perspective(1200px) rotateY(-4deg)' }}
            >
              {/* Terminal chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-pi-border bg-pi-panel">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                </div>
                <div className="flex-1 mx-3">
                  <div className="bg-pi-bg rounded-md px-3 py-1 text-[11px] text-pi-text-dim font-mono text-center flex items-center justify-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    pi-chi @ raspberrypi
                  </div>
                </div>
              </div>

              {/* System vitals bar */}
              <div className="flex items-center gap-4 px-4 py-2 border-b border-pi-border bg-pi-bg text-[10px] font-mono text-pi-text-dim">
                <span className="flex items-center gap-1"><Cpu className="w-3 h-3 text-cyan-500" /> 12% CPU</span>
                <span className="flex items-center gap-1"><HardDrive className="w-3 h-3 text-purple-500" /> 1.2GB free</span>
                <span className="flex items-center gap-1"><Thermometer className="w-3 h-3 text-orange-500" /> 42°C</span>
                <span className="flex items-center gap-1"><Wifi className="w-3 h-3 text-emerald-500" /> Connected</span>
              </div>

              {/* Activity log */}
              <div className="p-4 bg-pi-bg min-h-[260px]">
                <div className="text-[10px] text-pi-text-dim font-mono mb-3 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-3 h-3 text-pi-accent" />
                  Activity Log
                </div>
                <div className="space-y-1.5">
                  {ACTIVITY_LINES.slice(0, displayedLines).map((line, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: 8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                      className="text-[11px] leading-relaxed font-mono flex gap-2"
                    >
                      <span className="text-pi-text-dim/40 shrink-0">{line.time}</span>
                      <span className={getLineColor(line.type)}>{line.text}</span>
                    </motion.div>
                  ))}
                  {displayedLines < ACTIVITY_LINES.length && (
                    <span className="typewriter-cursor">&nbsp;</span>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
