'use client'

import { useEffect } from 'react'
import { X, Keyboard } from 'lucide-react'

interface KeyboardShortcutsOverlayProps {
  open: boolean
  onClose: () => void
}

const SHORTCUTS = [
  {
    category: 'Essentials',
    items: [
      { keys: 'Ctrl+K', description: 'Command palette', essential: true },
      { keys: 'Ctrl+S', description: 'Save project', essential: true },
      { keys: 'Ctrl+Enter', description: 'Send chat message', essential: true },
      { keys: 'Ctrl+/', description: 'Keyboard shortcuts', essential: true },
      { keys: 'Escape', description: 'Stop AI generation', essential: true },
    ],
  },
  {
    category: 'Navigation',
    items: [
      { keys: 'Ctrl+B', description: 'Toggle file sidebar' },
      { keys: 'Ctrl+Shift+P', description: 'Cycle code / split / preview' },
      { keys: 'Ctrl+F', description: 'Search files' },
      { keys: 'Ctrl+W', description: 'Close current file' },
    ],
  },
  {
    category: 'Editor',
    items: [
      { keys: 'Ctrl+Z', description: 'Undo' },
      { keys: 'Ctrl+Shift+Z', description: 'Redo' },
      { keys: 'Ctrl+D', description: 'Select next occurrence' },
      { keys: 'Ctrl+Shift+K', description: 'Delete line' },
    ],
  },
  {
    category: 'Chat',
    items: [
      { keys: 'Shift+Enter', description: 'New line in message' },
      { keys: 'Up', description: 'Edit last message (when input empty)' },
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose} onKeyDown={handleKeyDown} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
      <div className="absolute inset-0 bg-pi-overlay backdrop-blur-md animate-fade-in" />
      <div
        className="relative w-full max-w-md mx-4 bg-pi-bg rounded-2xl shadow-2xl border border-pi-border overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-pi-border">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-pi-accent" />
            <h2 className="text-sm font-semibold text-pi-text">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Shortcuts list */}
        <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
          {SHORTCUTS.map(group => (
            <div key={group.category}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-pi-text-dim/70 mb-2">
                {group.category}
              </h3>
              <div className="space-y-0.5">
                {group.items.map((item: { keys: string; description: string; essential?: boolean }) => (
                  <div
                    key={item.keys}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-pi-surface/50"
                  >
                    <span className="text-xs text-pi-text flex items-center gap-1.5">
                      {item.essential && <span className="w-1 h-1 rounded-full bg-pi-accent shrink-0" />}
                      {item.description}
                    </span>
                    <kbd className="px-2 py-0.5 text-[10px] font-mono text-pi-text-dim bg-pi-surface border border-pi-border rounded-md shrink-0 ml-3">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-pi-border bg-pi-surface/30">
          <p className="text-[10px] text-pi-text-dim text-center">
            Press{' '}
            <kbd className="px-1 py-0.5 text-[9px] font-mono bg-pi-surface border border-pi-border rounded">
              Esc
            </kbd>{' '}
            to close
          </p>
        </div>
      </div>
    </div>
  )
}
