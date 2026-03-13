'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import { motion, useInView } from 'framer-motion'
import { MessageSquare, FileCode, Folder, ChevronRight } from 'lucide-react'

const ease = [0.16, 1, 0.3, 1] as const

const CHAT_MESSAGE = 'Create a pricing card with a toggle for monthly/annual billing'

const FILE_TREE = [
  { name: 'src', type: 'folder' as const, indent: 0 },
  { name: 'components', type: 'folder' as const, indent: 1 },
  { name: 'pricing-card.tsx', type: 'file' as const, indent: 2, highlight: true },
  { name: 'button.tsx', type: 'file' as const, indent: 2 },
  { name: 'toggle.tsx', type: 'file' as const, indent: 2 },
  { name: 'app.tsx', type: 'file' as const, indent: 1 },
  { name: 'index.css', type: 'file' as const, indent: 1 },
]

const CODE_SNIPPET = `import { useState } from 'react'

export function PricingCard() {
  const [annual, setAnnual] = useState(false)
  const price = annual ? 99 : 12

  return (
    <div className="rounded-2xl border p-8">
      <h3 className="text-2xl font-bold">
        Pro Plan
      </h3>
      <div className="mt-4 flex items-end gap-1">
        <span className="text-5xl font-bold">
          \${price}
        </span>
        <span className="text-sm text-gray-500 mb-1">
          /{annual ? 'year' : 'month'}
        </span>
      </div>
    </div>
  )
}`

export function LandingDemo() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  const [phase, setPhase] = useState(0) // 0=idle, 1=chat, 2=code, 3=preview
  const [chatChars, setChatChars] = useState(0)
  const [codeLines, setCodeLines] = useState(0)
  const codeLineArray = CODE_SNIPPET.split('\n')

  const resetCycle = useCallback(() => {
    setPhase(0)
    setChatChars(0)
    setCodeLines(0)
  }, [])

  useEffect(() => {
    if (!isInView) return
    // Start sequence
    const t1 = setTimeout(() => setPhase(1), 400)
    return () => clearTimeout(t1)
  }, [isInView])

  // Chat typing
  useEffect(() => {
    if (phase !== 1) return
    const timer = setInterval(() => {
      setChatChars(prev => {
        if (prev >= CHAT_MESSAGE.length) {
          clearInterval(timer)
          setTimeout(() => setPhase(2), 600)
          return prev
        }
        return prev + 1
      })
    }, 30)
    return () => clearInterval(timer)
  }, [phase])

  // Code reveal
  useEffect(() => {
    if (phase !== 2) return
    const timer = setInterval(() => {
      setCodeLines(prev => {
        if (prev >= codeLineArray.length) {
          clearInterval(timer)
          setTimeout(() => setPhase(3), 400)
          return prev
        }
        return prev + 1
      })
    }, 100)
    return () => clearInterval(timer)
  }, [phase, codeLineArray.length])

  // Loop after preview
  useEffect(() => {
    if (phase !== 3) return
    const timer = setTimeout(() => resetCycle(), 4000)
    const t2 = setTimeout(() => setPhase(1), 4500)
    return () => { clearTimeout(timer); clearTimeout(t2) }
  }, [phase, resetCycle])

  return (
    <section id="demo" ref={ref} className="py-20 lg:py-32 border-t border-pi-border/20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease }}
        >
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">See It In Action</h2>
          <p className="text-pi-text-dim text-lg max-w-lg mx-auto">
            Describe a component in chat. Watch real code stream into the editor. See the result instantly.
          </p>
        </motion.div>

        <motion.div
          className="rounded-2xl border border-pi-border bg-pi-surface overflow-hidden shadow-2xl shadow-black/10 max-w-5xl mx-auto"
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, delay: 0.2, ease }}
        >
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-pi-border bg-pi-panel">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
            </div>
            <span className="text-[11px] text-pi-text-dim font-mono ml-3">Pi-Chi Workspace</span>
          </div>

          {/* 3-pane layout — stacks on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_200px] min-h-[360px]">
            {/* File tree */}
            <div className="hidden md:block border-r border-pi-border p-3 bg-pi-bg">
              <p className="text-[10px] text-pi-text-dim uppercase tracking-wider font-semibold mb-2">Explorer</p>
              {FILE_TREE.map((item, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-1.5 py-0.5 text-[11px] font-mono ${
                    item.highlight && phase >= 2 ? 'text-pi-accent font-semibold' : 'text-pi-text-dim'
                  }`}
                  style={{ paddingLeft: `${item.indent * 12 + 4}px` }}
                >
                  {item.type === 'folder' ? (
                    <>
                      <ChevronRight className="w-3 h-3 rotate-90" />
                      <Folder className="w-3 h-3" />
                    </>
                  ) : (
                    <FileCode className="w-3 h-3 ml-[15px]" />
                  )}
                  <span>{item.name}</span>
                </div>
              ))}
            </div>

            {/* Code editor */}
            <div className="border-r border-pi-border p-4 bg-pi-bg min-h-[200px]">
              <div className="text-[10px] text-pi-text-dim font-mono mb-3 uppercase tracking-wider">
                {phase >= 2 ? 'pricing-card.tsx' : 'editor'}
              </div>
              {phase >= 2 ? (
                <pre className="text-[11px] leading-[1.6] font-mono overflow-hidden">
                  {codeLineArray.slice(0, codeLines).map((line, i) => (
                    <div key={i}>
                      <span className="text-pi-text-dim/30 select-none mr-3 inline-block w-4 text-right">{i + 1}</span>
                      <span className={
                        line.includes('import') || line.includes('export') || line.includes('function') || line.includes('return') || line.includes('const')
                          ? 'text-pi-accent'
                          : line.includes('className')
                            ? 'text-pi-success'
                            : 'text-pi-text'
                      }>{line}</span>
                    </div>
                  ))}
                  {phase === 2 && codeLines < codeLineArray.length && (
                    <span className="typewriter-cursor">&nbsp;</span>
                  )}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-32 text-pi-text-dim/30 text-xs font-mono">
                  Waiting for prompt...
                </div>
              )}
            </div>

            {/* Preview / Chat */}
            <div className="p-4 bg-pi-bg">
              {/* Chat message */}
              <div className="mb-4">
                <div className="flex items-center gap-1.5 mb-2">
                  <MessageSquare className="w-3 h-3 text-pi-accent" />
                  <span className="text-[10px] text-pi-text-dim uppercase tracking-wider font-semibold">Chat</span>
                </div>
                {phase >= 1 && (
                  <div className="rounded-lg bg-pi-surface border border-pi-border p-2.5">
                    <p className="text-[11px] text-pi-text leading-relaxed">
                      {CHAT_MESSAGE.slice(0, chatChars)}
                      {phase === 1 && chatChars < CHAT_MESSAGE.length && (
                        <span className="typewriter-cursor">&nbsp;</span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              {/* Preview */}
              {phase >= 3 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, ease }}
                >
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[10px] text-pi-text-dim uppercase tracking-wider font-semibold">Preview</span>
                  </div>
                  <div className="rounded-lg border border-pi-border bg-pi-surface p-3 text-center">
                    <p className="text-xs font-semibold text-pi-text">Pro Plan</p>
                    <p className="text-xl font-bold text-pi-text mt-1">$12</p>
                    <p className="text-[10px] text-pi-text-dim">/month</p>
                    <div className="mt-2 w-full h-5 rounded bg-pi-accent/20 flex items-center justify-center">
                      <span className="text-[9px] font-medium text-pi-accent">Get Started</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
