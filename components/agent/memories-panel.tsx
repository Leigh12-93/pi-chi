'use client'

import { useState, useMemo, useCallback } from 'react'
import { BookOpen, Search, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { BrainMemory } from '@/lib/brain/brain-types'

interface MemoriesPanelProps {
  memories: BrainMemory[]
  className?: string
}

type ImportanceFilter = 'all' | 'critical' | 'high' | 'medium' | 'low'

const importanceColors: Record<string, string> = {
  critical: 'border-l-red-500',
  high: 'border-l-orange-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-blue-500',
}

const importanceBadgeColors: Record<string, string> = {
  critical: 'bg-red-500/10 text-red-500 border-red-500/20',
  high: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  medium: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  low: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
}

function formatRelativeTime(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  } catch { return '' }
}

const importanceOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export function MemoriesPanel({ memories, className }: MemoriesPanelProps) {
  const [filter, setFilter] = useState<ImportanceFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchDebounced, setSearchDebounced] = useState('')

  // Debounce search
  const searchTimerRef = useState<ReturnType<typeof setTimeout> | null>(null)
  const handleSearch = useCallback((value: string) => {
    setSearchQuery(value)
    if (searchTimerRef[0]) clearTimeout(searchTimerRef[0])
    searchTimerRef[0] = setTimeout(() => setSearchDebounced(value), 200)
  }, [searchTimerRef])

  const filtered = useMemo(() => {
    let result = memories
    if (filter !== 'all') {
      result = result.filter(m => m.importance === filter)
    }
    if (searchDebounced) {
      const q = searchDebounced.toLowerCase()
      result = result.filter(m =>
        m.key.toLowerCase().includes(q) || m.content.toLowerCase().includes(q)
      )
    }
    return [...result].sort((a, b) => {
      const ia = importanceOrder[a.importance] ?? 4
      const ib = importanceOrder[b.importance] ?? 4
      if (ia !== ib) return ia - ib
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [memories, filter, searchDebounced])

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <BookOpen className="w-3.5 h-3.5 text-pi-accent" />
          <span className="text-xs font-bold text-pi-text">Memories</span>
          <span className="text-[10px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full font-mono">
            {memories.length}
          </span>
        </div>

        {/* Filter dropdown */}
        <div className="relative group">
          <button
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-all"
            aria-label="Filter by importance"
          >
            {filter === 'all' ? 'All' : filter}
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          <div className="absolute right-0 top-full mt-1 bg-pi-surface border border-pi-border rounded-lg shadow-xl z-20 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all min-w-[100px]">
            {(['all', 'critical', 'high', 'medium', 'low'] as ImportanceFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'w-full text-left px-3 py-1.5 text-[11px] hover:bg-pi-surface-hover transition-colors first:rounded-t-lg last:rounded-b-lg capitalize',
                  filter === f ? 'text-pi-accent font-medium' : 'text-pi-text-dim'
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-pi-border/50">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-pi-text-dim/40" />
          <input
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
            placeholder="Search memories..."
            className="w-full bg-pi-surface border border-pi-border rounded-lg pl-7 pr-3 py-1.5 text-[11px] text-pi-text placeholder:text-pi-text-dim/40 focus:outline-none focus:ring-1 focus:ring-pi-accent/50"
          />
        </div>
      </div>

      {/* Memories list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 text-pi-text-dim"
          >
            <BookOpen className="w-10 h-10 mb-3 opacity-15" />
            <p className="text-xs font-medium">
              {memories.length === 0 ? 'No memories yet' : 'No matching memories'}
            </p>
            <p className="text-[10px] mt-1 text-center max-w-[200px]">
              {memories.length === 0
                ? 'The brain will store important insights here as it learns.'
                : 'Try adjusting your search or filter.'}
            </p>
          </motion.div>
        ) : (
          <AnimatePresence>
            {filtered.map((memory, i) => {
              const isExpanded = expandedId === memory.id
              return (
                <motion.div
                  key={memory.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: i * 0.02, type: 'spring', stiffness: 400, damping: 25 }}
                  className={cn(
                    'border border-pi-border rounded-lg bg-pi-surface/50 border-l-2 transition-all cursor-pointer hover:bg-pi-surface/80',
                    importanceColors[memory.importance] || 'border-l-gray-500'
                  )}
                  onClick={() => setExpandedId(isExpanded ? null : memory.id)}
                >
                  <div className="p-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[11px] font-semibold text-pi-text leading-tight">{memory.key}</p>
                      <span className={cn(
                        'text-[8px] px-1.5 py-px rounded-full font-medium border shrink-0',
                        importanceBadgeColors[memory.importance] || 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                      )}>
                        {memory.importance}
                      </span>
                    </div>
                    <p className={cn(
                      'text-[10px] text-pi-text-dim mt-1 leading-relaxed',
                      !isExpanded && 'line-clamp-2'
                    )}>
                      {memory.content}
                    </p>
                    <p className="text-[9px] text-pi-text-dim/40 mt-1.5 font-mono">
                      {formatRelativeTime(memory.createdAt)}
                    </p>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
