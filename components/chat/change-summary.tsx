'use client'

import { useState, useEffect, useRef } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, FileCode } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

export interface FileChanges {
  created: string[]
  modified: string[]
  deleted: string[]
}

interface ChangeSummaryProps {
  changes: FileChanges
  onFileClick?: (path: string) => void
}

function getFileName(path: string): string {
  return path.split('/').pop() || path
}

const CHANGE_CONFIG = {
  created: {
    icon: Plus,
    label: 'created',
    color: 'text-emerald-500 dark:text-emerald-400',
    bg: 'bg-emerald-50 dark:bg-emerald-950/30',
    dotColor: 'bg-emerald-500',
  },
  modified: {
    icon: Pencil,
    label: 'modified',
    color: 'text-amber-500 dark:text-amber-400',
    bg: 'bg-amber-50 dark:bg-amber-950/30',
    dotColor: 'bg-amber-500',
  },
  deleted: {
    icon: Trash2,
    label: 'deleted',
    color: 'text-red-500 dark:text-red-400',
    bg: 'bg-red-50 dark:bg-red-950/30',
    dotColor: 'bg-red-500',
  },
} as const

type ChangeType = keyof typeof CHANGE_CONFIG

export function ChangeSummary({ changes, onFileClick }: ChangeSummaryProps) {
  const [expanded, setExpanded] = useState(false)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const totalCount =
    changes.created.length + changes.modified.length + changes.deleted.length

  // Auto-collapse after 10 seconds
  useEffect(() => {
    collapseTimer.current = setTimeout(() => {
      setExpanded(false)
    }, 10_000)

    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
    }
  }, [])

  // Reset auto-collapse timer when user expands manually
  useEffect(() => {
    if (expanded) {
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
      collapseTimer.current = setTimeout(() => {
        setExpanded(false)
      }, 10_000)
    }
    return () => {
      if (collapseTimer.current) clearTimeout(collapseTimer.current)
    }
  }, [expanded])

  if (totalCount === 0) return null

  const summaryParts: string[] = []
  if (changes.modified.length > 0) summaryParts.push(`${changes.modified.length} modified`)
  if (changes.created.length > 0) summaryParts.push(`${changes.created.length} created`)
  if (changes.deleted.length > 0) summaryParts.push(`${changes.deleted.length} deleted`)

  const changeEntries: Array<{ type: ChangeType; path: string }> = [
    ...changes.created.map(p => ({ type: 'created' as const, path: p })),
    ...changes.modified.map(p => ({ type: 'modified' as const, path: p })),
    ...changes.deleted.map(p => ({ type: 'deleted' as const, path: p })),
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl border border-forge-border/60 bg-forge-surface/40 overflow-hidden"
    >
      {/* Collapsed header / toggle */}
      <button
        onClick={() => setExpanded(prev => !prev)}
        className="flex items-center gap-2 w-full px-3 py-2 text-left hover:bg-forge-surface-hover/40 transition-colors group"
      >
        <div className="w-5 h-5 rounded-md bg-forge-accent/10 border border-forge-accent/20 flex items-center justify-center shrink-0">
          <FileCode className="w-3 h-3 text-forge-accent" />
        </div>
        <span className="text-[12px] text-forge-text font-medium flex-1 min-w-0">
          {totalCount} file{totalCount !== 1 ? 's' : ''} changed
        </span>
        <span className="text-[11px] text-forge-text-dim/60 shrink-0 hidden sm:inline">
          {summaryParts.join(', ')}
        </span>
        <motion.div
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0"
        >
          <ChevronDown className="w-3.5 h-3.5 text-forge-text-dim/40 group-hover:text-forge-text-dim transition-colors" />
        </motion.div>
      </button>

      {/* Expanded file list */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-2 pb-2 space-y-0.5">
              {changeEntries.map(({ type, path }) => {
                const config = CHANGE_CONFIG[type]
                const Icon = config.icon
                return (
                  <button
                    key={`${type}-${path}`}
                    onClick={() => onFileClick?.(path)}
                    disabled={!onFileClick || type === 'deleted'}
                    className={cn(
                      'flex items-center gap-2 w-full px-2 py-1 rounded-lg text-left transition-colors',
                      type === 'deleted'
                        ? 'opacity-50 cursor-default'
                        : 'hover:bg-forge-bg/60 cursor-pointer',
                    )}
                  >
                    <div className={cn('w-4 h-4 rounded flex items-center justify-center shrink-0', config.bg)}>
                      <Icon className={cn('w-2.5 h-2.5', config.color)} />
                    </div>
                    <span
                      className={cn(
                        'text-[11px] font-mono truncate flex-1 min-w-0',
                        type === 'deleted'
                          ? 'text-forge-text-dim/50 line-through'
                          : 'text-forge-text-dim',
                      )}
                      title={path}
                    >
                      {getFileName(path)}
                    </span>
                    <span className="text-[10px] text-forge-text-dim/30 shrink-0 hidden sm:inline font-mono">
                      {path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : ''}
                    </span>
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
