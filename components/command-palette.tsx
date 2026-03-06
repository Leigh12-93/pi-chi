'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Search, Save, Rocket, Upload, GitBranch, Download,
  Eye, SidebarOpen, X as XIcon, Terminal, FileText,
  FolderTree, MessageSquare, Keyboard, Maximize2,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Command {
  id: string
  label: string
  description?: string
  shortcut?: string
  icon: LucideIcon
  category: 'actions' | 'navigation' | 'view'
  action: () => void
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  commands: Command[]
}

export function CommandPalette({ open, onClose, commands }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const filtered = useMemo(() => {
    if (!query.trim()) return commands
    const q = query.toLowerCase()
    return commands.filter(c =>
      c.label.toLowerCase().includes(q) ||
      c.description?.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    )
  }, [commands, query])

  // Group by category, pre-computing flat indices per item
  const { grouped, flatItems } = useMemo(() => {
    const groups: Record<string, Array<Command & { flatIndex: number }>> = {}
    let idx = 0
    for (const cmd of filtered) {
      if (!groups[cmd.category]) groups[cmd.category] = []
      groups[cmd.category].push({ ...cmd, flatIndex: idx })
      idx++
    }
    return { grouped: groups, flatItems: filtered }
  }, [filtered])

  const flatFiltered = flatItems

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Keyboard navigation + focus trap
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Tab') {
      e.preventDefault() // Trap focus inside palette
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, flatFiltered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatFiltered[selectedIndex]) {
        flatFiltered[selectedIndex].action()
        onClose()
      }
    }
  }, [flatFiltered, selectedIndex, onClose])

  // Reset selection when filter changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  if (!open) return null

  const categoryLabels: Record<string, string> = {
    actions: 'Actions',
    navigation: 'Navigation',
    view: 'View',
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh] sm:pt-[20vh]" onClick={onClose} role="dialog" aria-modal="true" aria-label="Command palette">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-forge-overlay backdrop-blur-md animate-fade-in" />

      {/* Palette */}
      <div
        className="relative w-full max-w-md mx-4 bg-forge-bg rounded-2xl shadow-2xl border border-forge-border overflow-hidden animate-fade-in-up"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-forge-border">
          <Search className="w-4 h-4 text-forge-text-dim shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a command..."
            className="flex-1 text-sm text-forge-text bg-transparent outline-none placeholder:text-forge-text-dim/50"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-forge-text-dim bg-forge-surface border border-forge-border rounded">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div className="max-h-[300px] overflow-y-auto py-1">
          {flatFiltered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-forge-text-dim">No matching commands</p>
            </div>
          ) : (
            Object.entries(grouped).map(([category, cmds]) => (
              <div key={category}>
                <div className="px-4 pt-2 pb-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-forge-text-dim/70">
                    {categoryLabels[category] || category}
                  </span>
                </div>
                {cmds.map(cmd => {
                  const isSelected = cmd.flatIndex === selectedIndex
                  return (
                    <button
                      key={cmd.id}
                      onClick={() => { cmd.action(); onClose() }}
                      onMouseEnter={() => setSelectedIndex(cmd.flatIndex)}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 sm:py-2 text-left transition-colors',
                        isSelected ? 'bg-forge-accent/10' : 'hover:bg-forge-surface',
                      )}
                    >
                      <div className={cn(
                        'w-9 h-9 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0',
                        isSelected ? 'bg-forge-accent/20 text-forge-accent' : 'bg-forge-surface text-forge-text-dim',
                      )}>
                        <cmd.icon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={cn(
                          'text-sm sm:text-xs font-medium truncate',
                          isSelected ? 'text-forge-accent' : 'text-forge-text',
                        )}>
                          {cmd.label}
                        </p>
                        {cmd.description && (
                          <p className="text-xs sm:text-[10px] text-forge-text-dim truncate">{cmd.description}</p>
                        )}
                      </div>
                      {cmd.shortcut && (
                        <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-forge-text-dim bg-forge-surface border border-forge-border rounded shrink-0">
                          {cmd.shortcut}
                        </kbd>
                      )}
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-forge-border bg-forge-surface/50 flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-forge-text-dim">
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-forge-bg border border-forge-border rounded text-[9px]">&uarr;&darr;</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="px-1 py-0.5 bg-forge-bg border border-forge-border rounded text-[9px]">&crarr;</kbd> select</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] text-forge-text-dim">
            <Keyboard className="w-3 h-3" />
            <span>{flatFiltered.length} commands</span>
          </div>
        </div>
      </div>
    </div>
  )
}
