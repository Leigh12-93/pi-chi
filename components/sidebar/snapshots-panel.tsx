'use client'

import { History, RotateCcw, Plus } from 'lucide-react'
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

interface SnapshotsPanelProps {
  snapshots: Snapshot[]
  onRestoreSnapshot: (snap: Snapshot) => void
  onOpenVersionHistory: () => void
  onCreateSnapshot: () => void
}

export function SnapshotsPanel({ snapshots, onRestoreSnapshot, onOpenVersionHistory, onCreateSnapshot }: SnapshotsPanelProps) {
  return (
    <div className="p-3 space-y-3">
      <button
        onClick={onCreateSnapshot}
        className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs rounded-lg bg-forge-accent text-white hover:bg-forge-accent/90 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Create Snapshot
      </button>

      {snapshots.length === 0 ? (
        <p className="text-xs text-forge-text-dim">No snapshots yet. Save your project or create one above.</p>
      ) : (
        <div className="space-y-1">
          {snapshots.slice(0, 10).map(snap => (
            <div key={snap.id} className="flex items-center gap-2 group px-2 py-1.5 rounded-md hover:bg-forge-surface transition-colors">
              <History className="w-3 h-3 text-forge-text-dim shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-forge-text truncate">{snap.label}</p>
                <p className="text-[10px] text-forge-text-dim">
                  {timeAgo(snap.timestamp)} &middot; {Object.keys(snap.files).length} files
                </p>
              </div>
              <button
                onClick={() => onRestoreSnapshot(snap)}
                className="p-1 text-forge-text-dim hover:text-forge-accent opacity-0 group-hover:opacity-100 transition-all"
                title="Restore"
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
