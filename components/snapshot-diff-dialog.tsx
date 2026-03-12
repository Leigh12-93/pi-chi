'use client'

import { useEffect, useMemo } from 'react'
import { X, Plus, Pencil, Trash2, FileCode, RotateCcw } from 'lucide-react'
import { motion } from 'framer-motion'

type ChangeType = 'added' | 'modified' | 'removed'

interface FileChange {
  path: string
  type: ChangeType
}

interface DiffSummary {
  added: FileChange[]
  modified: FileChange[]
  removed: FileChange[]
  unchangedCount: number
}

interface SnapshotDiffDialogProps {
  open: boolean
  snapshotLabel: string
  currentFiles: Record<string, string>
  snapshotFiles: Record<string, string>
  onConfirm: () => void
  onCancel: () => void
  restoring?: boolean
}

function computeDiff(
  currentFiles: Record<string, string>,
  snapshotFiles: Record<string, string>,
): DiffSummary {
  const added: FileChange[] = []
  const modified: FileChange[] = []
  const removed: FileChange[] = []
  let unchangedCount = 0

  const allPaths = new Set([
    ...Object.keys(currentFiles),
    ...Object.keys(snapshotFiles),
  ])

  for (const path of allPaths) {
    const inCurrent = path in currentFiles
    const inSnapshot = path in snapshotFiles

    if (inSnapshot && !inCurrent) {
      added.push({ path, type: 'added' })
    } else if (inCurrent && !inSnapshot) {
      removed.push({ path, type: 'removed' })
    } else if (inCurrent && inSnapshot) {
      if (currentFiles[path] !== snapshotFiles[path]) {
        modified.push({ path, type: 'modified' })
      } else {
        unchangedCount++
      }
    }
  }

  // Sort each group alphabetically
  added.sort((a, b) => a.path.localeCompare(b.path))
  modified.sort((a, b) => a.path.localeCompare(b.path))
  removed.sort((a, b) => a.path.localeCompare(b.path))

  return { added, modified, removed, unchangedCount }
}

const CHANGE_CONFIG: Record<ChangeType, { icon: typeof Plus; color: string; label: string }> = {
  added: { icon: Plus, color: 'text-emerald-400', label: 'Added' },
  modified: { icon: Pencil, color: 'text-amber-400', label: 'Modified' },
  removed: { icon: Trash2, color: 'text-red-400', label: 'Removed' },
}

function FileChangeRow({ change }: { change: FileChange }) {
  const config = CHANGE_CONFIG[change.type]
  const Icon = config.icon
  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded-md hover:bg-forge-surface/50 transition-colors">
      <Icon className={`w-3 h-3 shrink-0 ${config.color}`} />
      <span className="text-[11px] text-forge-text truncate">{change.path}</span>
    </div>
  )
}

export function SnapshotDiffDialog({
  open,
  snapshotLabel,
  currentFiles,
  snapshotFiles,
  onConfirm,
  onCancel,
  restoring,
}: SnapshotDiffDialogProps) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onCancel])

  const diff = useMemo(
    () => computeDiff(currentFiles, snapshotFiles),
    [currentFiles, snapshotFiles],
  )

  const hasChanges = diff.added.length > 0 || diff.modified.length > 0 || diff.removed.length > 0

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-forge-overlay backdrop-blur-md animate-fade-in" />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="relative w-full max-w-md mx-4 bg-forge-bg rounded-2xl shadow-2xl border border-forge-border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-forge-border">
          <div className="flex items-center gap-2">
            <FileCode className="w-4 h-4 text-forge-accent" />
            <h2 className="text-sm font-semibold text-forge-text">Restore Preview</h2>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Snapshot name */}
        <div className="px-5 pt-3 pb-2">
          <p className="text-xs text-forge-text-dim">
            Restoring <span className="font-medium text-forge-text">&ldquo;{snapshotLabel}&rdquo;</span>
          </p>
        </div>

        {/* Summary badges */}
        <div className="flex items-center gap-2 px-5 pb-3 flex-wrap">
          {diff.modified.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Pencil className="w-2.5 h-2.5" />
              {diff.modified.length} modified
            </span>
          )}
          {diff.added.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Plus className="w-2.5 h-2.5" />
              {diff.added.length} added
            </span>
          )}
          {diff.removed.length > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
              <Trash2 className="w-2.5 h-2.5" />
              {diff.removed.length} removed
            </span>
          )}
          {diff.unchangedCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full bg-forge-surface text-forge-text-dim border border-forge-border">
              {diff.unchangedCount} unchanged
            </span>
          )}
        </div>

        {/* File list */}
        <div className="px-5 pb-3 max-h-[60vh] overflow-y-auto">
          {!hasChanges ? (
            <div className="py-6 text-center">
              <FileCode className="w-8 h-8 mx-auto mb-2 text-forge-text-dim opacity-40" />
              <p className="text-xs text-forge-text-dim">No differences found.</p>
              <p className="text-[10px] text-forge-text-dim/60 mt-1">
                The snapshot is identical to the current files.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {diff.modified.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/70 mb-1 px-2">
                    Modified
                  </h3>
                  <div className="space-y-0">
                    {diff.modified.map(c => (
                      <FileChangeRow key={c.path} change={c} />
                    ))}
                  </div>
                </div>
              )}
              {diff.added.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400/70 mb-1 px-2">
                    Added
                  </h3>
                  <div className="space-y-0">
                    {diff.added.map(c => (
                      <FileChangeRow key={c.path} change={c} />
                    ))}
                  </div>
                </div>
              )}
              {diff.removed.length > 0 && (
                <div>
                  <h3 className="text-[10px] font-semibold uppercase tracking-wider text-red-400/70 mb-1 px-2">
                    Removed
                  </h3>
                  <div className="space-y-0">
                    {diff.removed.map(c => (
                      <FileChangeRow key={c.path} change={c} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-forge-border bg-forge-surface/30">
          <button
            onClick={onCancel}
            disabled={restoring}
            className="px-3 py-1.5 text-xs text-forge-text-dim hover:text-forge-text rounded-lg hover:bg-forge-surface transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={restoring}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-forge-accent rounded-lg hover:bg-forge-accent-hover active:scale-[0.97] transition-all disabled:opacity-50"
          >
            <RotateCcw className={`w-3 h-3 ${restoring ? 'animate-spin' : ''}`} />
            {restoring ? 'Restoring...' : 'Restore'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
