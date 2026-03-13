'use client'

import { useState, useEffect } from 'react'
import { X, History, Clock, FileText, Diff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SnapshotDiffDialog } from './snapshot-diff-dialog'

export interface FileVersion {
  path: string
  content: string
  timestamp: number
  label?: string
}

export interface Snapshot {
  id: string
  label: string
  timestamp: number
  files: Record<string, string>
}

interface VersionHistoryProps {
  open: boolean
  onClose: () => void
  snapshots: Snapshot[]
  currentFiles: Record<string, string>
  onRestore: (snapshot: Snapshot) => void
  onViewDiff: (snapshotId: string, path: string) => void
}

export function VersionHistory({ open, onClose, snapshots, currentFiles, onRestore, onViewDiff }: VersionHistoryProps) {
  const [selectedSnapshot, setSelectedSnapshot] = useState<string | null>(null)
  const [showDiffPreview, setShowDiffPreview] = useState(false)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDiffPreview) {
          setShowDiffPreview(false)
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose, showDiffPreview])

  if (!open) return null

  const selected = snapshots.find(s => s.id === selectedSnapshot)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-pi-overlay backdrop-blur-md animate-fade-in" />
      <div
        className="relative w-full max-w-lg mx-4 bg-pi-bg rounded-2xl shadow-2xl border border-pi-border overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-pi-border">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-pi-accent" />
            <h2 className="text-sm font-semibold text-pi-text">Version History</h2>
            <span className="text-[10px] text-pi-text-dim">{snapshots.length} snapshots</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex h-[50vh]">
          {/* Snapshot list */}
          <div className="w-48 border-r border-pi-border overflow-y-auto">
            {snapshots.length === 0 ? (
              <div className="p-4 text-center text-xs text-pi-text-dim">
                <History className="w-6 h-6 mx-auto mb-2 opacity-30" />
                No snapshots yet. Snapshots are created after each AI interaction.
              </div>
            ) : (
              snapshots.map((snapshot, i) => (
                <button
                  key={snapshot.id}
                  onClick={() => setSelectedSnapshot(snapshot.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 border-b border-pi-border/50 hover:bg-pi-surface/50 transition-colors animate-fade-in-up',
                    selectedSnapshot === snapshot.id && 'bg-pi-accent/10 border-l-2 border-l-pi-accent',
                  )}
                  style={{ animationDelay: `${i * 40}ms`, animationFillMode: 'backwards' }}
                >
                  <p className="text-[11px] font-medium text-pi-text truncate">{snapshot.label}</p>
                  <div className="flex items-center gap-1 mt-0.5 text-[10px] text-pi-text-dim">
                    <Clock className="w-3 h-3" />
                    {new Date(snapshot.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <span className="text-[9px] text-pi-text-dim/60">
                    {Object.keys(snapshot.files).length} files
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Snapshot detail */}
          <div className="flex-1 overflow-y-auto">
            {selected ? (
              <div className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-medium text-pi-text">{selected.label}</h3>
                  <button
                    onClick={() => setShowDiffPreview(true)}
                    className="px-2.5 py-1 text-[10px] font-medium text-white bg-pi-accent rounded-lg hover:bg-pi-accent-hover transition-colors"
                  >
                    Restore
                  </button>
                </div>
                <div className="space-y-0.5">
                  {Object.keys(selected.files).sort().map(path => {
                    const changed = currentFiles[path] !== selected.files[path]
                    const isNew = !currentFiles[path]
                    return (
                      <div
                        key={path}
                        className="flex items-center justify-between py-1 px-2 rounded hover:bg-pi-surface/50 text-[11px]"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileText className="w-3 h-3 text-pi-text-dim shrink-0" />
                          <span className="text-pi-text truncate">{path}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isNew && <span className="text-[9px] text-red-500">deleted</span>}
                          {changed && !isNew && (
                            <button
                              onClick={() => onViewDiff(selected.id, path)}
                              className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] text-pi-accent hover:bg-pi-accent/10 rounded transition-colors"
                            >
                              <Diff className="w-3 h-3" />
                              Diff
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-xs text-pi-text-dim">
                Select a snapshot to view details
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Diff preview dialog */}
      {showDiffPreview && selected && (
        <SnapshotDiffDialog
          open={showDiffPreview}
          snapshotLabel={selected.label}
          currentFiles={currentFiles}
          snapshotFiles={selected.files}
          onConfirm={() => {
            onRestore(selected)
            setShowDiffPreview(false)
            onClose()
          }}
          onCancel={() => setShowDiffPreview(false)}
        />
      )}
    </div>
  )
}
