'use client'

import { useRef, useEffect, useState } from 'react'
import { useInView } from 'framer-motion'

interface StatProps {
  target: string
  label: string
  isInView: boolean
}

function AnimatedStat({ target, label, isInView }: StatProps) {
  const [display, setDisplay] = useState(target)
  const numericPart = parseInt(target.replace(/\D/g, ''))
  const prefix = target.match(/^[^\d]*/)?.[0] || ''
  const suffix = target.match(/[^\d]*$/)?.[0] || ''

  useEffect(() => {
    if (!isInView || isNaN(numericPart)) return
    let current = 0
    const step = Math.ceil(numericPart / 20)
    const timer = setInterval(() => {
      current += step
      if (current >= numericPart) {
        current = numericPart
        clearInterval(timer)
      }
      setDisplay(`${prefix}${current}${suffix}`)
    }, 40)
    return () => clearInterval(timer)
  }, [isInView, numericPart, prefix, suffix])

  return (
    <div className="text-center px-6 py-4">
      <p className="text-3xl font-bold text-pi-text font-mono">{display}</p>
      <p className="text-sm text-pi-text-dim mt-1">{label}</p>
    </div>
  )
}

const STATS = [
  { target: '60+', label: 'Tools Built In' },
  { target: '<30s', label: 'Idea to Deploy' },
  { target: '100%', label: 'Your Code, Your Repos' },
  { target: '$0', label: 'Platform Cost' },
]

export function LandingSocialProof() {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-40px' })

  return (
    <section ref={ref} className="border-y border-pi-border/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-pi-border/30">
          {STATS.map(stat => (
            <AnimatedStat key={stat.label} {...stat} isInView={isInView} />
          ))}
        </div>
      </div>
    </section>
  )
}
