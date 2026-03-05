'use client'

import { useState } from 'react'
import { History, RotateCcw, Plus, Loader2, AlertTriangle } from 'lucide-react'
import type { Snapshot } from '../version-history'

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
}

export function SnapshotsPanel({ snapshots, onRestoreSnapshot, onOpenVersionHistory, onCreateSnapshot, loading }: SnapshotsPanelProps) {
  const [creating, setCreating] = useState(false)
  const [confirmRestore, setConfirmRestore] = useState<Snapshot | null>(null)
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
      setConfirmRestore(null)
    }
  }

  return (
    <div className="p-3 space-y-3">
      <button
        onClick={handleCreate}
        disabled={creating}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-forge-accent text-white hover:bg-forge-accent/90 disabled:opacity-50 transition-colors"
      >
        {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
        {creating ? 'Creating...' : 'Create Snapshot'}
      </button>

      {/* Restore confirmation */}
      {confirmRestore && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2 animate-fade-in">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-forge-text font-medium">Restore &quot;{confirmRestore.label}&quot;?</p>
              <p className="text-[10px] text-forge-text-dim mt-0.5">
                This will replace all current files with the snapshot from {formatTime(confirmRestore.timestamp)} ({Object.keys(confirmRestore.files).length} files).
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleRestore(confirmRestore)}
              disabled={restoring}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] rounded-md bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors"
            >
              {restoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
              {restoring ? 'Restoring...' : 'Confirm Restore'}
            </button>
            <button
              onClick={() => setConfirmRestore(null)}
              disabled={restoring}
              className="px-3 py-1.5 text-[10px] rounded-md border border-forge-border hover:bg-forge-surface transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
            <div key={snap.id} className="flex items-center gap-2 group px-2 py-1.5 rounded-md hover:bg-forge-surface transition-colors">
              <History className="w-3 h-3 text-forge-text-dim shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-forge-text truncate">{snap.label}</p>
                <p className="text-[10px] text-forge-text-dim" title={formatTime(snap.timestamp)}>
                  {timeAgo(snap.timestamp)} &middot; {Object.keys(snap.files).length} files
                </p>
              </div>
              <button
                onClick={() => setConfirmRestore(snap)}
                className="p-1 text-forge-text-dim hover:text-forge-accent opacity-0 group-hover:opacity-100 transition-all"
                title="Restore this snapshot"
              >
                <RotateCcw className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={onOpenVersionHistory}
        className="w-full flex items-center justify-center gap-2 px-3 py-1.5 text-xs rounded-md border border-forge-border hover:bg-forge-surface transition-colors"
      >
        View Full History
      </button>
    </div>
  )
}
