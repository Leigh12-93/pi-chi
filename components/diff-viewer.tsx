'use client'

import { useEffect } from 'react'
import { X, Diff } from 'lucide-react'

interface DiffViewerProps {
  open: boolean
  onClose: () => void
  path: string
  oldContent: string
  newContent: string
  oldLabel?: string
  newLabel?: string
}

interface DiffLine {
  type: 'same' | 'add' | 'remove'
  text: string
  oldLine?: number
  newLine?: number
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split('\n')
  const newLines = newText.split('\n')
  // Simple LCS-based diff
  const m = oldLines.length
  const n = newLines.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  // Backtrack to build diff
  let i = m, j = n
  const stack: DiffLine[] = []
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      stack.push({ type: 'same', text: oldLines[i - 1], oldLine: i, newLine: j })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      stack.push({ type: 'add', text: newLines[j - 1], newLine: j })
      j--
    } else if (i > 0) {
      stack.push({ type: 'remove', text: oldLines[i - 1], oldLine: i })
      i--
    }
  }

  stack.reverse()
  return stack
}

export function DiffViewer({ open, onClose, path, oldContent, newContent, oldLabel: _oldLabel = 'Previous', newLabel: _newLabel = 'Current' }: DiffViewerProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const diff = computeDiff(oldContent, newContent)
  const additions = diff.filter(d => d.type === 'add').length
  const deletions = diff.filter(d => d.type === 'remove').length

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-pi-overlay backdrop-blur-md animate-fade-in" />
      <div
        className="relative w-full max-w-3xl mx-4 max-h-[80vh] bg-pi-bg rounded-2xl shadow-2xl border border-pi-border overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-pi-border">
          <div className="flex items-center gap-2">
            <Diff className="w-4 h-4 text-pi-accent" />
            <span className="text-xs font-medium text-pi-text font-mono">{path}</span>
            <span className="text-[10px] text-emerald-500">+{additions}</span>
            <span className="text-[10px] text-red-500">-{deletions}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Diff content */}
        <div className="overflow-auto max-h-[calc(80vh-48px)]">
          <pre className="text-[11px] font-mono leading-5">
            {diff.map((line, i) => (
              <div
                key={i}
                className={
                  line.type === 'add' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' :
                  line.type === 'remove' ? 'bg-red-500/10 text-red-700 dark:text-red-300' :
                  'text-pi-text'
                }
              >
                <span className="inline-block w-10 text-right pr-2 text-pi-text-dim/50 select-none">
                  {line.oldLine || ''}
                </span>
                <span className="inline-block w-10 text-right pr-2 text-pi-text-dim/50 select-none">
                  {line.newLine || ''}
                </span>
                <span className="inline-block w-4 text-center select-none font-medium">
                  {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
                </span>
                {line.text}
              </div>
            ))}
          </pre>
        </div>
      </div>
    </div>
  )
}
