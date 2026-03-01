'use client'

import { useState, useRef, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

interface TooltipProps {
  content: string
  children: ReactNode
  side?: 'top' | 'bottom'
  delay?: number
}

export function Tooltip({ content, children, side = 'top', delay = 400 }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const triggerRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => setMounted(true), [])

  const handleEnter = () => {
    timerRef.current = setTimeout(() => {
      if (!triggerRef.current) return
      const rect = triggerRef.current.getBoundingClientRect()
      setPos({
        x: rect.left + rect.width / 2,
        y: side === 'bottom' ? rect.bottom + 6 : rect.top - 6,
      })
      setVisible(true)
    }, delay)
  }

  const handleLeave = () => {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  return (
    <>
      <div
        ref={triggerRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        className="inline-flex"
      >
        {children}
      </div>
      {visible && mounted && createPortal(
        <div
          className={cn(
            'fixed z-[200] px-2 py-1 text-[11px] text-zinc-100 bg-zinc-900 dark:text-zinc-900 dark:bg-zinc-100 border border-forge-border rounded-md shadow-lg pointer-events-none animate-scale-in whitespace-nowrap',
            side === 'top' ? '-translate-x-1/2 -translate-y-full' : '-translate-x-1/2',
          )}
          style={{ left: pos.x, top: pos.y }}
        >
          {content}
        </div>,
        document.body,
      )}
    </>
  )
}
