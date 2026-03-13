'use client'

import { useCallback } from 'react'
import { toast } from 'sonner'
import type { WorkspaceStateReturn, DialogType } from './use-workspace-state'

const BINARY_EXTS = new Set(['png','jpg','jpeg','gif','ico','webp','avif','bmp','svg','woff','woff2','ttf','eot','otf','mp3','mp4','wav','ogg','webm','zip','tar','gz','rar','7z','pdf','exe','dll','so','dylib','bin','dat','db','sqlite'])

interface WorkspaceActionsDeps {
  state: WorkspaceStateReturn
  files: Record<string, string>
  projectId: string | null
  projectName: string
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileChange: (path: string, content: string) => void
  onFileDelete: (path: string) => void
  onBulkFileUpdate: (files: Record<string, string>, opts?: { replace?: boolean }) => void
  onManualSave?: () => Promise<void>
  githubToken?: string
  githubRepoUrl: string | null
  onGithubRepoUrlChange?: (url: string | null) => void
  onVercelUrlChange?: (url: string | null) => void
}

export function useWorkspaceActions(deps: WorkspaceActionsDeps) {
  const { state, files, projectId, projectName, activeFile, onFileSelect, onFileChange, onFileDelete: _onFileDelete, onBulkFileUpdate, onManualSave, githubToken: _githubToken, githubRepoUrl, onGithubRepoUrlChange, onVercelUrlChange } = deps

  const handleFileSelect = useCallback((path: string) => {
    onFileSelect(path)
    state.setOpenFiles(prev => prev.includes(path) ? prev : [...prev, path])
    state.setMobileTab(prev => prev === 'editor' ? 'editor' : prev)
  }, [onFileSelect, state.setOpenFiles, state.setMobileTab])

  // Keep ref in sync for handleDrop closure
  state.handleFileSelectRef.current = handleFileSelect

  const handleFileCreate = useCallback((path: string) => {
    onFileChange(path, '')
    handleFileSelect(path)
  }, [onFileChange, handleFileSelect])

  const handleCloseFile = useCallback((path: string) => {
    state.setOpenFiles(prev => {
      const remaining = prev.filter(f => f !== path)
      if (activeFile === path) {
        onFileSelect(remaining[remaining.length - 1] || '')
      }
      return remaining
    })
  }, [activeFile, onFileSelect, state.setOpenFiles])

  const handleReorderTabs = useCallback((from: number, to: number) => {
    state.setOpenFiles(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [state.setOpenFiles])

  const handleFileRename = useCallback((oldPath: string, newPath: string) => {
    state.setOpenFiles(prev => prev.map(f => f === oldPath ? newPath : f))
    if (activeFile === oldPath) onFileSelect(newPath)
    if (files[oldPath] !== undefined) {
      const updated = { ...files }
      updated[newPath] = updated[oldPath]
      delete updated[oldPath]
      onBulkFileUpdate(updated, { replace: true })
    }
  }, [activeFile, files, onFileSelect, onBulkFileUpdate, state.setOpenFiles])

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    state.dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) state.setIsDragging(true)
  }, [state.dragCounterRef, state.setIsDragging])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    state.dragCounterRef.current--
    if (state.dragCounterRef.current === 0) state.setIsDragging(false)
  }, [state.dragCounterRef, state.setIsDragging])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    state.setIsDragging(false)
    state.dragCounterRef.current = 0

    const items = e.dataTransfer.files
    if (!items.length) return

    const binaryExts = BINARY_EXTS
    let skipped = 0
    const newFiles: Record<string, string> = {}
    for (let i = 0; i < items.length; i++) {
      const file = items[i]
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      if (binaryExts.has(ext)) { skipped++; continue }
      if (file.size > 500_000) {
        toast.error(`Skipped ${file.name}`, { description: 'File too large (max 500KB)' })
        continue
      }
      try {
        const text = await file.text()
        if (text.includes('\0')) { skipped++; continue }
        const filePath = file.webkitRelativePath
          ? file.webkitRelativePath.split('/').slice(1).join('/') || file.name
          : file.name
        newFiles[filePath] = text
      } catch {
        toast.error(`Failed to read ${file.name}`)
      }
    }

    const count = Object.keys(newFiles).length
    if (count > 200) console.warn(`Bulk import: ${count} files — this may be slow`)
    if (skipped > 0) toast.info(`Skipped ${skipped} binary file${skipped > 1 ? 's' : ''}`, { duration: 2000 })
    if (count > 0) {
      onBulkFileUpdate({ ...state.filesRef.current, ...newFiles })
      toast.success(`${count} file${count > 1 ? 's' : ''} imported`, { duration: 2500 })
      if (count === 1) state.handleFileSelectRef.current(Object.keys(newFiles)[0])
    }
  }, [onBulkFileUpdate, state.filesRef, state.handleFileSelectRef, state.setIsDragging, state.dragCounterRef])

  const handleDownload = useCallback(async () => {
    const fileEntries = Object.entries(files)
    if (fileEntries.length === 0) { toast.error('No files to download'); return }

    try {
      const JSZip = (await import('jszip')).default
      const zip = new JSZip()
      for (const [path, content] of fileEntries) zip.file(path, content)
      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${projectName || 'project'}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Download started', { description: `${fileEntries.length} files in ${projectName}.zip` })
    } catch { toast.error('Download failed') }
  }, [files, projectName])

  const handleSave = useCallback(async () => {
    if (!projectId || Object.keys(files).length === 0) return
    onManualSave?.()
    state.setLocalSaveStatus('saving')
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      })
      if (res.ok) {
        state.setLocalSaveStatus('saved')
        fetch(`/api/projects/${projectId}/snapshots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: `Save ${state.snapshots.length + 1}`, files }),
        }).then(r => r.json()).then(data => {
          if (data.id) {
            state.setSnapshots(prev => [{
              id: data.id,
              label: data.description || `Save ${prev.length + 1}`,
              timestamp: new Date(data.created_at || Date.now()).getTime(),
              files: { ...files },
            }, ...prev].slice(0, 50))
          }
        }).catch(() => {})
        toast.success('Project saved', { description: `${Object.keys(files).length} files saved` })
      } else {
        console.error(`Auto-save failed: ${res.status}`)
        state.setLocalSaveStatus('error')
        toast.error('Save failed', { description: `Could not save to database (HTTP ${res.status})` })
      }
      setTimeout(() => state.setLocalSaveStatus('idle'), 2000)
    } catch {
      state.setLocalSaveStatus('error')
      toast.error('Save failed', { description: 'Network error' })
      setTimeout(() => state.setLocalSaveStatus('idle'), 2000)
    }
  }, [projectId, files, onManualSave, state.snapshots.length, state.setLocalSaveStatus, state.setSnapshots])

  const handleAction = useCallback((action: string) => {
    switch (action) {
      case 'download': handleDownload(); break
      case 'save': handleSave(); break
      case 'share':
        if (projectId) {
          const url = `${window.location.origin}?project=${projectId}`
          navigator.clipboard.writeText(url)
          toast.success('Share link copied', { description: url })
        } else {
          toast.error('Save the project first to get a share link')
        }
        break
      case 'deploy':
        if (projectId && Object.keys(files).length > 0) {
          fetch(`/api/projects/${projectId}/snapshots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: 'Pre-deploy snapshot', files }),
          }).then(r => r.json()).then(data => {
            if (data.id) {
              state.setSnapshots(prev => [{
                id: data.id, label: 'Pre-deploy snapshot',
                timestamp: new Date(data.created_at || Date.now()).getTime(),
                files: { ...files },
              }, ...prev].slice(0, 50))
            }
          }).catch(() => {})
        }
        state.setShowDeployPanel(true)
        break
      case 'push':
      case 'create-repo':
      case 'import':
        state.setActiveDialog(action as DialogType)
        break
    }
  }, [handleDownload, handleSave, files, projectId, state.setSnapshots, state.setShowDeployPanel, state.setActiveDialog])

  const autoConnectRepo = useCallback(async (repoUrl: string) => {
    if (!projectId || !repoUrl) return
    try {
      const res = await fetch(`/api/projects/${projectId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_repo_url: repoUrl }),
      })
      if (res.ok) {
        onGithubRepoUrlChange?.(repoUrl)
      }
    } catch (e) { console.warn('[pi:workspace] Failed to auto-connect repo:', e) }
  }, [projectId, onGithubRepoUrlChange])

  const handleDialogSuccess = useCallback((result: Record<string, unknown>) => {
    if (result.url && result.repoName) {
      // github_create success — auto-connect the new repo
      const repoUrl = String(result.url)
      toast.success('Repository created', {
        description: repoUrl.replace('https://github.com/', ''),
        action: { label: 'Open', onClick: () => window.open(repoUrl, '_blank') },
      })
      state.setPendingChatMessage(`[System] Repository created. URL: ${repoUrl}`)
      if (!githubRepoUrl) autoConnectRepo(repoUrl)
    } else if (result.url) {
      // deploy success
      const deployUrl = String(result.url)
      toast.success('Deployed successfully', {
        description: deployUrl,
        action: { label: 'Open', onClick: () => window.open(deployUrl, '_blank') },
      })
      state.setPendingChatMessage(`[System] Operation completed successfully. URL: ${deployUrl}`)
      onVercelUrlChange?.(deployUrl)
    } else if (result.commitSha) {
      // github_push success — auto-connect if not already connected
      toast.success('Pushed to GitHub', { description: `Commit: ${String(result.commitSha).slice(0, 7)}` })
      state.setPendingChatMessage(`[System] Pushed to GitHub. Commit: ${String(result.commitSha).slice(0, 7)}`)
      if (!githubRepoUrl && result.repoUrl) {
        autoConnectRepo(String(result.repoUrl))
      }
    }
  }, [state.setPendingChatMessage, githubRepoUrl, autoConnectRepo])

  const handleDialogFix = useCallback((errorMessage: string) => {
    state.setPendingChatMessage(`The deploy failed with these build errors. Please fix them:\n\n\`\`\`\n${errorMessage}\n\`\`\``)
    state.setMobileTab('chat')
  }, [state.setPendingChatMessage, state.setMobileTab])

  const handleRegisterSend = useCallback((sendFn: (message: string) => void) => {
    state.chatSendRef.current = sendFn
  }, [state.chatSendRef])

  const handleMobileTabSwitch = useCallback((tab: typeof state.mobileTab) => {
    state.userInteractingRef.current = true
    state.setMobileTab(tab)
    setTimeout(() => { state.userInteractingRef.current = false }, 10000)
  }, [state.setMobileTab, state.userInteractingRef])

  const handleAiLoadingChange = useCallback((loading: boolean) => {
    state.setAiLoading(loading)
  }, [state.setAiLoading])

  const handlePreviewReady = useCallback(() => {
    if (!state.aiLoading && !state.userManualSwitchRef.current && Object.keys(files).length >= 2) {
      state.setRightTab('preview')
    }
  }, [state.aiLoading, files, state.userManualSwitchRef, state.setRightTab])

  const handleRestoreSnapshot = useCallback(async (snap: { id: string; files: Record<string, string>; label: string }) => {
    if (Object.keys(snap.files).length > 0) {
      onBulkFileUpdate(snap.files, { replace: true })
      toast.success('Snapshot restored', { description: snap.label })
    } else if (projectId) {
      try {
        const res = await fetch(`/api/projects/${projectId}/snapshots/${snap.id}`)
        const data = await res.json()
        if (data.files) {
          onBulkFileUpdate(data.files, { replace: true })
          toast.success('Snapshot restored', { description: snap.label })
        } else {
          toast.error('Failed to load snapshot files')
        }
      } catch { toast.error('Failed to restore snapshot') }
    }
  }, [projectId, onBulkFileUpdate])

  const handleCreateSnapshot = useCallback(async () => {
    if (!projectId) return
    try {
      const res = await fetch(`/api/projects/${projectId}/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: `Snapshot ${state.snapshots.length + 1}`, files }),
      })
      const data = await res.json()
      if (res.ok) {
        state.setSnapshots(prev => [{
          id: data.id || `snap-${Date.now()}`,
          label: data.description || `Snapshot ${prev.length + 1}`,
          timestamp: new Date(data.created_at || Date.now()).getTime(),
          files: { ...files },
        }, ...prev].slice(0, 50))
        toast.success('Snapshot created')
      } else { toast.error('Failed to create snapshot') }
    } catch { toast.error('Failed to create snapshot') }
  }, [projectId, files, state.snapshots.length, state.setSnapshots])

  return {
    handleFileSelect, handleFileCreate, handleCloseFile, handleReorderTabs, handleFileRename,
    handleDragEnter, handleDragLeave, handleDragOver, handleDrop,
    handleDownload, handleSave, handleAction,
    handleDialogSuccess, handleDialogFix, handleRegisterSend,
    handleMobileTabSwitch, handleAiLoadingChange, handlePreviewReady,
    handleRestoreSnapshot, handleCreateSnapshot,
  }
}

export type WorkspaceActionsReturn = ReturnType<typeof useWorkspaceActions>
