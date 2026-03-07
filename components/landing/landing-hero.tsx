'use client'

import { useRef, useEffect, useState } from 'react'
import { motion, useInView } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'

interface LandingHeroProps {
  onSignIn: () => void
  loading: boolean
}

const CODE_LINES = [
  'export default function PricingCard() {',
  '  const [annual, setAnnual] = useState(false)',
  '  const price = annual ? 99 : 12',
  '',
  '  return (',
  '    <div className="rounded-2xl border p-8">',
  '      <h3 className="text-2xl font-bold">Pro</h3>',
  '      <p className="text-4xl mt-4">${price}</p>',
  '      <Toggle checked={annual} onChange={setAnnual} />',
  '      <Button>Get Started</Button>',
  '    </div>',
  '  )',
  '}',
]

const ease = [0.16, 1, 0.3, 1] as const

export function LandingHero({ onSignIn, loading }: LandingHeroProps) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })
  const [displayedLines, setDisplayedLines] = useState(0)
  const [showPreview, setShowPreview] = useState(false)

  useEffect(() => {
    if (!isInView) return
    const timer = setInterval(() => {
      setDisplayedLines(prev => {
        if (prev >= CODE_LINES.length) {
          clearInterval(timer)
          setTimeout(() => setShowPreview(true), 300)
          return prev
        }
        return prev + 1
      })
    }, 150)
    return () => clearInterval(timer)
  }, [isInView])

  const scrollToDemo = () => {
    document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth' })
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
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-forge-accent/10 text-forge-accent text-xs font-medium mb-6">
              <Sparkles className="w-3.5 h-3.5" />
              AI-Powered Development
            </span>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
              <motion.span
                className="block"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.1, ease }}
              >
                Describe it.
              </motion.span>
              <motion.span
                className="block"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.25, ease }}
              >
                Watch it build.
              </motion.span>
              <motion.span
                className="block text-shimmer"
                initial={{ opacity: 0, y: 20 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.5, delay: 0.4, ease }}
              >
                Ship it.
              </motion.span>
            </h1>

            <motion.p
              className="text-lg text-forge-text-dim max-w-md mb-8"
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: 0.55, ease }}
            >
              Tell Claude what you want to build. Watch real code appear in a live editor. Deploy to Vercel in one click.
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
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-forge-accent text-white font-medium hover:bg-forge-accent-hover transition-colors disabled:opacity-50"
              >
                {loading ? 'Connecting...' : 'Start Building — Free'}
                <ArrowRight className="w-4 h-4" />
              </button>
              <button
                onClick={scrollToDemo}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-forge-border text-forge-text-dim font-medium hover:text-forge-text hover:border-forge-border-bright transition-colors"
              >
                See How It Works
              </button>
            </motion.div>
          </motion.div>

          {/* Right — browser mockup */}
          <motion.div
            className="relative hidden lg:block"
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, delay: 0.3, ease }}
          >
            <div className="rounded-2xl border border-forge-border bg-forge-surface overflow-hidden shadow-2xl shadow-forge-accent/5"
              style={{ transform: 'perspective(1200px) rotateY(-4deg)' }}
            >
              {/* Browser chrome */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-forge-border bg-forge-panel">
                <div className="flex gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
                </div>
                <div className="flex-1 mx-3">
                  <div className="bg-forge-bg rounded-md px-3 py-1 text-[11px] text-forge-text-dim font-mono text-center">
                    forge-six-chi.vercel.app
                  </div>
                </div>
              </div>

              {/* Split pane */}
              <div className="grid grid-cols-2 min-h-[300px]">
                {/* Code side */}
                <div className="border-r border-forge-border p-4 bg-forge-bg">
                  <div className="text-[10px] text-forge-text-dim font-mono mb-2 uppercase tracking-wider">pricing-card.tsx</div>
                  <pre className="text-[11px] leading-relaxed font-mono">
                    {CODE_LINES.slice(0, displayedLines).map((line, i) => (
                      <div key={i}>
                        <span className="text-forge-text-dim/40 select-none mr-3">{String(i + 1).padStart(2, ' ')}</span>
                        <span className={line.includes('export') || line.includes('return') || line.includes('const')
                          ? 'text-forge-accent'
                          : line.includes('className') || line.includes('checked') || line.includes('onChange')
                            ? 'text-forge-success'
                            : 'text-forge-text'
                        }>{line}</span>
                      </div>
                    ))}
                    {displayedLines < CODE_LINES.length && (
                      <span className="typewriter-cursor">&nbsp;</span>
                    )}
                  </pre>
                </div>

                {/* Preview side */}
                <div className="p-4 bg-forge-bg flex items-center justify-center">
                  {showPreview ? (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.4, ease }}
                      className="w-full max-w-[180px] rounded-xl border border-forge-border p-4 bg-forge-surface text-center"
                    >
                      <p className="text-xs font-semibold text-forge-text mb-1">Pro</p>
                      <p className="text-2xl font-bold text-forge-text">$12</p>
                      <p className="text-[10px] text-forge-text-dim mb-3">/month</p>
                      <div className="w-full h-6 rounded-md bg-forge-accent/20 flex items-center justify-center">
                        <span className="text-[10px] font-medium text-forge-accent">Get Started</span>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="text-xs text-forge-text-dim/40 font-mono">Preview</div>
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
