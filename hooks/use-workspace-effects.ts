'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'
import type { WorkspaceStateReturn } from './use-workspace-state'
import type { WorkspaceActionsReturn } from './use-workspace-actions'
import type { AuditPlan } from '@/components/audit-panel'

interface WorkspaceEffectsDeps {
  state: WorkspaceStateReturn
  actions: WorkspaceActionsReturn
  files: Record<string, string>
  projectId: string | null
  activeFile: string | null
  onFileSelect: (path: string) => void
  autoSaveError?: boolean
  initialPendingMessage?: string | null
  onInitialPendingMessageSent?: () => void
  wcStatus: string
  wcSpawn: (cmd: string, args: string[]) => Promise<any>
}

export function useWorkspaceEffects(deps: WorkspaceEffectsDeps) {
  const { state, actions: _actions, files, projectId, activeFile, onFileSelect, autoSaveError, initialPendingMessage, onInitialPendingMessageSent, wcStatus, wcSpawn } = deps

  useEffect(() => {
    const handleTerminalAction = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      state.setRightTab('terminal')
      if (wcStatus === 'ready' && detail.command) {
        const parts = detail.command.split(' ')
        wcSpawn(parts[0], parts.slice(1)).catch(() => {})
      }
    }
    const handleAuditPlan = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail) state.setAuditPlan(detail as AuditPlan)
    }
    const handleOpenFile = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.path && typeof detail.path === 'string') {
        onFileSelect(detail.path)
      }
    }
    window.addEventListener('forge:terminal-action', handleTerminalAction)
    window.addEventListener('forge:audit-plan', handleAuditPlan)
    window.addEventListener('forge:open-file', handleOpenFile)
    return () => {
      window.removeEventListener('forge:terminal-action', handleTerminalAction)
      window.removeEventListener('forge:audit-plan', handleAuditPlan)
      window.removeEventListener('forge:open-file', handleOpenFile)
    }
  }, [wcStatus, onFileSelect]) // eslint-disable-line react-hooks/exhaustive-deps

  // AI file-edit highlight + diff tracking
  useEffect(() => {
    const handleFileEdited = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.paths) return
      const paths = detail.paths as string[]

      // Auto-navigate to the edited file
      if (paths.length > 0 && !state.userManualSwitchRef.current) {
        const targetPath = paths[0]
        onFileSelect(targetPath)
        state.setOpenFiles(prev => {
          let next = prev
          if (state.aiAutoTabRef.current && state.aiAutoTabRef.current !== targetPath && !prev.includes(targetPath)) {
            next = next.filter(f => f !== state.aiAutoTabRef.current)
          }
          if (!next.includes(targetPath)) next = [...next, targetPath]
          state.aiAutoTabRef.current = targetPath
          return next
        })
      }

      // Pulse animation
      state.setAiEditingFiles(prev => {
        const next = new Set(prev)
        paths.forEach(p => next.add(p))
        return next
      })

      // Compute line diffs
      state.setFileDiffs(prev => {
        const next = new Map(prev)
        for (const path of paths) {
          const oldContent = state.initialFilesRef.current[path] || ''
          const newContent = state.filesRef.current[path] || ''
          const oldLines = oldContent.split('\n')
          const newLines = newContent.split('\n')
          const oldSet = new Set(oldLines)
          const newSet = new Set(newLines)
          const added = newLines.filter(l => !oldSet.has(l)).length
          const removed = oldLines.filter(l => !newSet.has(l)).length
          if (added > 0 || removed > 0) next.set(path, { added, removed })
        }
        return next
      })

      // Remove pulse after animation
      for (const path of paths) {
        const existing = state.aiEditTimersRef.current.get(path)
        if (existing) clearTimeout(existing)
        state.aiEditTimersRef.current.set(path, setTimeout(() => {
          state.setAiEditingFiles(prev => {
            const next = new Set(prev)
            next.delete(path)
            return next
          })
          state.aiEditTimersRef.current.delete(path)
        }, 1500))
      }
    }

    window.addEventListener('forge:file-edited', handleFileEdited)
    return () => {
      window.removeEventListener('forge:file-edited', handleFileEdited)
      state.aiEditTimersRef.current.forEach(t => clearTimeout(t))
      state.aiEditTimersRef.current.clear()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!projectId) return
    state.setSnapshotsLoaded(false)
    fetch(`/api/projects/${projectId}/snapshots`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          state.setSnapshots(data.map((s: any) => ({
            id: s.id,
            label: s.description || 'Snapshot',
            timestamp: new Date(s.created_at).getTime(),
            files: {},
            fileCount: s.file_count,
          })))
        }
      })
      .catch(() => {})
      .finally(() => state.setSnapshotsLoaded(true))
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialPendingMessage) {
      state.setPendingChatMessage(initialPendingMessage)
      onInitialPendingMessageSent?.()
    }
  }, [initialPendingMessage, onInitialPendingMessageSent]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (Object.keys(state.initialFilesRef.current).length === 0 && Object.keys(files).length > 0) {
      state.initialFilesRef.current = { ...files }
    }
  }, [files]) // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced to avoid keystroke-level recalculation
  useEffect(() => {
    const timer = setTimeout(() => {
      const initial = state.initialFilesRef.current
      const modified = new Set<string>()
      for (const [path, content] of Object.entries(files)) {
        if (!(path in initial)) modified.add(path)
        else if (initial[path] !== content) modified.add(path)
      }
      state.setModifiedFiles(modified)
    }, 500)
    return () => clearTimeout(timer)
  }, [files]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    state.prevFileKeysRef.current = new Set(Object.keys(files))
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const fileKeys = Object.keys(files)
    const currentSet = new Set(fileKeys)
    const prevSet = state.prevFileKeysRef.current
    const wasEmpty = prevSet.size === 0
    const newFiles = fileKeys.filter(f => !prevSet.has(f))
    const deletedFiles = [...prevSet].filter(f => !currentSet.has(f))
    state.prevFileKeysRef.current = currentSet

    // Auto-select first file on scaffold
    if (wasEmpty && fileKeys.length > 0 && !activeFile) {
      const mainFile = fileKeys.find(f => f === 'app/page.tsx')
        || fileKeys.find(f => f === 'src/App.tsx')
        || fileKeys.find(f => f.endsWith('/page.tsx'))
        || fileKeys.find(f => f.endsWith('.tsx'))
        || fileKeys[0]
      if (mainFile) {
        onFileSelect(mainFile)
        state.setOpenFiles([mainFile])
      }
    }

    // Batch toasts
    if (!wasEmpty && (newFiles.length > 0 || deletedFiles.length > 0)) {
      state.pendingNewFilesRef.current.push(...newFiles)
      state.pendingDeletedFilesRef.current.push(...deletedFiles)
      if (state.toastTimerRef.current) clearTimeout(state.toastTimerRef.current)
      state.toastTimerRef.current = setTimeout(() => {
        const created = [...new Set(state.pendingNewFilesRef.current)]
        const deleted = [...new Set(state.pendingDeletedFilesRef.current)]
        state.pendingNewFilesRef.current = []
        state.pendingDeletedFilesRef.current = []

        if (created.length > 0 && created.length <= 5) {
          toast.success(`${created.length} file${created.length > 1 ? 's' : ''} created`, {
            description: created.map(f => f.split('/').pop()).join(', '), duration: 2500,
          })
        } else if (created.length > 5) {
          toast.success(`${created.length} files created`, { duration: 2500 })
        }
        if (deleted.length > 0 && deleted.length <= 3) {
          toast(`${deleted.length} file${deleted.length > 1 ? 's' : ''} deleted`, {
            description: deleted.map(f => f.split('/').pop()).join(', '), duration: 2500,
          })
        }
      }, 2000)
    }

    return () => { if (state.toastTimerRef.current) clearTimeout(state.toastTimerRef.current) }
  }, [files, activeFile, onFileSelect]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (autoSaveError) {
      state.setLocalSaveStatus('error')
      toast.error('Auto-save failed', { description: 'Changes may not be saved. Try saving manually with Ctrl+S.' })
    }
  }, [autoSaveError]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (autoSaveError) { e.preventDefault(); e.returnValue = '' }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [autoSaveError])

  useEffect(() => {
    if (state.pendingChatMessage && state.mobileTab !== 'chat') {
      state.setMobileTab('chat')
    }
  }, [state.pendingChatMessage, state.mobileTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-switch panels based on AI loading state
  useEffect(() => {
    const wasLoading = state.prevAiLoadingRef.current
    state.prevAiLoadingRef.current = state.aiLoading

    if (state.aiLoading && !wasLoading) {
      state.fileCountAtStartRef.current = Object.keys(files).length
      if (!state.userManualSwitchRef.current) state.setRightTab('code')
    }

    if (!state.aiLoading && wasLoading) {
      state.aiAutoTabRef.current = null
      const currentCount = Object.keys(files).length
      if (currentCount > state.fileCountAtStartRef.current && !state.userManualSwitchRef.current) {
        const timer = setTimeout(() => {
          if (!state.userManualSwitchRef.current) state.setRightTab('preview')
        }, 3000)
        return () => clearTimeout(timer)
      }
    }
  }, [state.aiLoading, files]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { if (state.userSwitchTimerRef.current) clearTimeout(state.userSwitchTimerRef.current) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
