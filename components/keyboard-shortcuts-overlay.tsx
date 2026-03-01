'use client'

import { useEffect } from 'react'
import { X, Keyboard } from 'lucide-react'

interface KeyboardShortcutsOverlayProps {
  open: boolean
  onClose: () => void
}

const SHORTCUTS = [
  {
    category: 'General',
    items: [
      { keys: 'Ctrl+K', description: 'Command palette' },
      { keys: 'Ctrl+S', description: 'Save current file' },
      { keys: 'Ctrl+/', description: 'Keyboard shortcuts' },
    ],
  },
  {
    category: 'Editor',
    items: [
      { keys: 'Ctrl+W', description: 'Close current file' },
      { keys: 'Ctrl+F', description: 'Search across all files' },
    ],
  },
  {
    category: 'View',
    items: [
      { keys: 'Ctrl+Shift+P', description: 'Cycle code / split / preview' },
      { keys: 'Ctrl+B', description: 'Toggle file sidebar' },
    ],
  },
  {
    category: 'Actions',
    items: [
      { keys: 'Ctrl+Enter', description: 'Send chat message' },
    ],
  },
]

export function KeyboardShortcutsOverlay({ open, onClose }: KeyboardShortcutsOverlayProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      onClose()
    } else if (e.key === 'Tab') {
      // Keep focus within the modal
      const modal = e.currentTarget
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose} onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-forge-overlay backdrop-blur-md animate-fade-in" />
      <div
        className="relative w-full max-w-md mx-4 bg-forge-bg rounded-2xl shadow-2xl border border-forge-border overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-forge-border">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-forge-accent" />
            <h2 className="text-sm font-semibold text-forge-text">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
          {SHORTCUTS.map(group => (
            <div key={group.category}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-forge-text-dim/70 mb-2">
                {group.category}
              </h3>
              <div className="space-y-0.5">
                {group.items.map(item => (
                  <div
                    key={item.keys}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-forge-surface/50"
                  >
                    <span className="text-xs text-forge-text">{item.description}</span>
                    <kbd className="px-2 py-0.5 text-[10px] font-mono text-forge-text-dim bg-forge-surface border border-forge-border rounded-md">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-forge-border bg-forge-surface/30">
          <p className="text-[10px] text-forge-text-dim text-center">
            Press{' '}
            <kbd className="px-1 py-0.5 text-[9px] font-mono bg-forge-surface border border-forge-border rounded">
              Esc
            </kbd>{' '}
            to close
          </p>
        </div>
      </div>
    </div>
  )
}
