'use client'

import { useState } from 'react'
import { History, RotateCcw, Plus, Loader2 } from 'lucide-react'
import type { Snapshot } from '../version-history'
import { SnapshotDiffDialog } from '../snapshot-diff-dialog'

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface SnapshotsPanelProps {
  snapshots: Snapshot[]
  onRestoreSnapshot: (snap: Snapshot) => void
  onOpenVersionHistory: () => void
  onCreateSnapshot: () => void
  loading?: boolean
  currentFiles?: Record<string, string>
}

export function SnapshotsPanel({ snapshots, onRestoreSnapshot, onOpenVersionHistory, onCreateSnapshot, loading, currentFiles }: SnapshotsPanelProps) {
  const [creating, setCreating] = useState(false)
  const [previewSnapshot, setPreviewSnapshot] = useState<Snapshot | null>(null)
  const [restoring, setRestoring] = useState(false)

  const handleCreate = async () => {
    setCreating(true)
    try {
      await onCreateSnapshot()
    } finally {
      setCreating(false)
    }
  }

  const handleRestore = async (snap: Snapshot) => {
    setRestoring(true)
    try {
      await onRestoreSnapshot(snap)
    } finally {
      setRestoring(false)
      setPreviewSnapshot(null)
    }
  }

  return (
    <div className="p-3 space-y-3">
      <button
        onClick={handleCreate}
        disabled={creating}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-forge-accent text-white hover:bg-forge-accent/90 active:scale-[0.98] disabled:opacity-50 transition-all duration-150"
      >
        {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {creating ? 'Creating...' : 'Create Snapshot'}
      </button>

      {loading ? (
        <div className="flex items-center gap-2 py-4 justify-center">
          <Loader2 className="w-3.5 h-3.5 animate-spin text-forge-text-dim" />
          <span className="text-xs text-forge-text-dim">Loading snapshots...</span>
        </div>
      ) : snapshots.length === 0 ? (
        <p className="text-xs text-forge-text-dim">No snapshots yet. Save your project or create one above.</p>
      ) : (
        <div className="space-y-1">
          {snapshots.slice(0, 15).map(snap => (
            <div key={snap.id} className="flex items-center gap-2 group px-2 py-1.5 rounded-md hover:bg-forge-surface border-l-2 border-l-transparent hover:border-l-forge-accent transition-all duration-150">
              <History className="w-3 h-3 text-forge-text-dim group-hover:text-forge-accent shrink-0 transition-colors" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-forge-text truncate">{snap.label}</p>
                <p className="text-[10px] text-forge-text-dim" title={formatTime(snap.timestamp)}>
                  {timeAgo(snap.timestamp)} &middot; {Object.keys(snap.files).length} files
                </p>
              </div>
              <button
                onClick={() => setPreviewSnapshot(snap)}
                className="p-1 text-forge-text-dim hover:text-forge-accent hover:rotate-[-30deg] active:scale-90 opacity-0 group-hover:opacity-100 transition-all duration-200"
                title="Preview changes before restoring"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onOpenVersionHistory}
        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs rounded-md border border-forge-border hover:bg-forge-surface active:scale-[0.98] transition-all duration-150"
      >
        View Full History
      </button>

      {/* Diff preview dialog */}
      {previewSnapshot && (
        <SnapshotDiffDialog
          open={!!previewSnapshot}
          snapshotLabel={previewSnapshot.label}
          currentFiles={currentFiles || {}}
          snapshotFiles={previewSnapshot.files}
          onConfirm={() => handleRestore(previewSnapshot)}
          onCancel={() => setPreviewSnapshot(null)}
          restoring={restoring}
        />
      )}
    </div>
  )
}
