'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

export interface FileChanges {
  created: string[]
  modified: string[]
  deleted: string[]
}

export interface PendingChanges {
  created: Set<string>
  modified: Set<string>
  deleted: Set<string>
}

export interface UseFileChangeTrackerReturn {
  /** Snapshotted changes after AI finishes responding */
  lastChanges: FileChanges | null
  /** Live pending changes ref (mutated during streaming) */
  pendingChangesRef: React.RefObject<PendingChanges>
  /** Reset pending changes for a new turn */
  resetPendingChanges: () => void
  /** Clear the lastChanges state */
  clearLastChanges: () => void
}

/**
 * Tracks file changes (created/modified/deleted) during an AI response turn.
 * Snapshots the accumulated changes when the AI stops loading.
 */
export function useFileChangeTracker(isLoading: boolean): UseFileChangeTrackerReturn {
  const [lastChanges, setLastChanges] = useState<FileChanges | null>(null)

  const pendingChangesRef = useRef<PendingChanges>({
    created: new Set(),
    modified: new Set(),
    deleted: new Set(),
  })

  // Snapshot file changes when AI finishes responding
  const wasLoadingRef = useRef(false)
  useEffect(() => {
    if (wasLoadingRef.current && !isLoading) {
      const pending = pendingChangesRef.current
      const hasChanges =
        pending.created.size > 0 ||
        pending.modified.size > 0 ||
        pending.deleted.size > 0
      if (hasChanges) {
        setLastChanges({
          created: [...pending.created],
          modified: [...pending.modified],
          deleted: [...pending.deleted],
        })
      }
    }
    wasLoadingRef.current = isLoading
  }, [isLoading])

  const resetPendingChanges = useCallback(() => {
    setLastChanges(null)
    pendingChangesRef.current = {
      created: new Set(),
      modified: new Set(),
      deleted: new Set(),
    }
  }, [])

  const clearLastChanges = useCallback(() => {
    setLastChanges(null)
  }, [])

  return {
    lastChanges,
    pendingChangesRef,
    resetPendingChanges,
    clearLastChanges,
  }
}
