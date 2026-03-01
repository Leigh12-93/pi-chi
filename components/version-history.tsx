'use client'

import { useState, useEffect } from 'react'
import { X, History, Clock, ChevronRight, FileText, Diff } from 'lucide-react'
import { cn } from '@/lib/utils'

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

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const selected = snapshots.find(s => s.id === selectedSnapshot)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-forge-overlay backdrop-blur-md animate-fade-in" />
      <div
        className="relative w-full max-w-lg mx-4 bg-forge-bg rounded-2xl shadow-2xl border border-forge-border overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-forge-border">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-forge-accent" />
            <h2 className="text-sm font-semibold text-forge-text">Version History</h2>
            <span className="text-[10px] text-forge-text-dim">{snapshots.length} snapshots</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex h-[50vh]">
          {/* Snapshot list */}
          <div className="w-48 border-r border-forge-border overflow-y-auto">
            {snapshots.length === 0 ? (
              <div className="p-4 text-center text-xs text-forge-text-dim">
                <History className="w-6 h-6 mx-auto mb-2 opacity-30" />
                No snapshots yet. Snapshots are created after each AI interaction.
              </div>
            ) : (
              snapshots.map(snapshot => (
                <button
                  key={snapshot.id}
                  onClick={() => setSelectedSnapshot(snapshot.id)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 border-b border-forge-border/50 hover:bg-forge-surface/50 transition-colors',
                    selectedSnapshot === snapshot.id && 'bg-forge-accent/10 border-l-2 border-l-forge-accent',
                  )}
                >
                  <p className="text-[11px] font-medium text-forge-text truncate">{snapshot.label}</p>
                  <div className="flex items-center gap-1 mt-0.5 text-[10px] text-forge-text-dim">
                    <Clock className="w-3 h-3" />
                    {new Date(snapshot.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <span className="text-[9px] text-forge-text-dim/60">
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
                  <h3 className="text-xs font-medium text-forge-text">{selected.label}</h3>
                  <button
                    onClick={() => { onRestore(selected); onClose() }}
                    className="px-2.5 py-1 text-[10px] font-medium text-white bg-forge-accent rounded-lg hover:bg-forge-accent-hover transition-colors"
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
                        className="flex items-center justify-between py-1 px-2 rounded hover:bg-forge-surface/50 text-[11px]"
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileText className="w-3 h-3 text-forge-text-dim shrink-0" />
                          <span className="text-forge-text truncate">{path}</span>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {isNew && <span className="text-[9px] text-red-500">deleted</span>}
                          {changed && !isNew && (
                            <button
                              onClick={() => onViewDiff(selected.id, path)}
                              className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] text-forge-accent hover:bg-forge-accent/10 rounded transition-colors"
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
              <div className="flex items-center justify-center h-full text-xs text-forge-text-dim">
                Select a snapshot to view details
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
