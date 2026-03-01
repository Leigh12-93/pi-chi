'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from '@/components/session-provider'
import { Workspace } from '@/components/workspace'
import { ProjectPicker } from '@/components/project-picker'
import { ErrorBoundary } from '@/components/error-boundary'
import { hashFileMapDeep } from '@/lib/utils'

interface SavedProject {
  id: string
  name: string
  description: string
  framework: string
  github_repo_url: string | null
  vercel_url: string | null
  updated_at: string
  created_at: string
}

export default function ForgePage() {
  const { session, status } = useSession()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [files, setFiles] = useState<Record<string, string>>({})
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedHash = useRef<string>('')
  const restoredRef = useRef(false)
  const savingRef = useRef(false)
  const loadingProjectsRef = useRef(false)
  const [autoSaveError, setAutoSaveError] = useState(false)
  const [projectsLoadError, setProjectsLoadError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [restoringProject, setRestoringProject] = useState(false)
  const [concurrentTabWarning, setConcurrentTabWarning] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)

  // Concurrent-tab detection: warn if another tab is editing the same project
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel('forge_project_edit')
    // Announce when we start editing a project
    if (projectId) {
      bc.postMessage({ type: 'editing', projectId })
    }
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'editing' && e.data.projectId === projectId && projectId) {
        setConcurrentTabWarning(true)
      }
      // Other tab is asking who's editing — respond
      if (e.data?.type === 'ping' && e.data.projectId === projectId && projectId) {
        bc.postMessage({ type: 'editing', projectId })
      }
    }
    bc.addEventListener('message', handler)
    // Ask if anyone else is already editing this project
    if (projectId) {
      bc.postMessage({ type: 'ping', projectId })
    }
    return () => { bc.removeEventListener('message', handler); bc.close() }
  }, [projectId])

  // Restore project from sessionStorage on mount (survives refresh)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      const raw = sessionStorage.getItem('forge_active_project')
      if (!raw) return
      const stored: { id?: string; name?: string; activeFile?: string } = JSON.parse(raw)
      const { id, name } = stored
      if (id && name) {
        // Load the saved project from API
        setRestoringProject(true)
        fetch(`/api/projects/${id}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data) {
              setProjectId(data.id)
              setProjectName(data.name)
              setFiles(data.files || {})
              lastSavedHash.current = hashFileMapDeep(data.files || {})
              // Restore active file if it still exists
              if (stored.activeFile && data.files?.[stored.activeFile]) {
                setActiveFile(stored.activeFile)
              }
            } else {
              // Project was deleted — clear storage
              sessionStorage.removeItem('forge_active_project')
            }
          })
          .catch(() => sessionStorage.removeItem('forge_active_project'))
          .finally(() => setRestoringProject(false))
      } else if (name) {
        // Unsaved project — just restore the name (files are lost on refresh)
        setProjectName(name)
      }
    } catch { /* ignore corrupt storage */ }
  }, [])

  // Auto-clear error messages — longer timeout for persistent warnings (local-only mode)
  useEffect(() => {
    if (errorMessage) {
      const isLocalOnlyWarning = errorMessage.includes('local-only')
      const t = setTimeout(() => setErrorMessage(null), isLocalOnlyWarning ? 15000 : 5000)
      return () => clearTimeout(t)
    }
  }, [errorMessage])

  // Persist active project to sessionStorage + push history state
  useEffect(() => {
    try {
      if (projectName) {
        sessionStorage.setItem('forge_active_project', JSON.stringify({ id: projectId, name: projectName, activeFile }))
        // Push a history entry so browser back goes to project picker, not off-site
        if (!window.history.state?.forgeProject) {
          window.history.pushState({ forgeProject: true }, '', window.location.href)
        }
      } else {
        sessionStorage.removeItem('forge_active_project')
      }
    } catch { /* sessionStorage unavailable (private browsing) — non-fatal */ }
  }, [projectId, projectName, activeFile])

  // Handle browser back button — go to project picker instead of leaving the site
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (projectName) {
        e.preventDefault()
        setProjectName(null)
        setProjectId(null)
        setFiles({})
        setActiveFile(null)
        loadProjects()
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [projectName]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load saved projects when session is available
  useEffect(() => {
    if (session?.githubUsername) {
      loadProjects()
    }
  }, [session?.githubUsername])

  const loadProjects = async () => {
    if (loadingProjectsRef.current) return
    loadingProjectsRef.current = true
    setLoadingProjects(true)
    setProjectsLoadError(false)
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        setSavedProjects(data)
      } else {
        setProjectsLoadError(true)
      }
    } catch (err) {
      console.error('Failed to load projects:', err)
      setProjectsLoadError(true)
    } finally {
      setLoadingProjects(false)
      loadingProjectsRef.current = false
    }
  }

  // Auto-save when files change (debounced 5 seconds, with save lock)
  useEffect(() => {
    if (!projectId || Object.keys(files).length === 0) return

    const hash = hashFileMapDeep(files)
    if (hash === lastSavedHash.current) return

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      if (savingRef.current) return // skip if another save is in-flight
      savingRef.current = true
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files }),
        })
        if (res.ok) {
          lastSavedHash.current = hash
          setAutoSaveError(false)
        } else {
          setAutoSaveError(true)
        }
      } catch {
        setAutoSaveError(true)
      } finally {
        savingRef.current = false
      }
    }, 5000)

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    }
  }, [files, projectId])

  // Manual save — cancels pending auto-save, saves immediately, updates hash
  const handleManualSave = useCallback(async () => {
    if (!projectId || Object.keys(files).length === 0) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    if (savingRef.current) return
    savingRef.current = true
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      })
      if (res.ok) {
        lastSavedHash.current = hashFileMapDeep(files)
        setAutoSaveError(false)
      } else {
        setAutoSaveError(true)
      }
    } catch {
      setAutoSaveError(true)
    } finally {
      savingRef.current = false
    }
  }, [projectId, files])

  // Offline/reconnection handling — retry save when coming back online
  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => {
      setIsOffline(false)
      // Retry save on reconnection
      if (projectId && Object.keys(files).length > 0) {
        const hash = hashFileMapDeep(files)
        if (hash !== lastSavedHash.current) {
          handleManualSave()
        }
      }
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [projectId, files, handleManualSave])

  const handleSelectProject = useCallback(async (name: string, id?: string, initialFiles?: Record<string, string>, query?: string) => {
    if (id) {
      try {
        const res = await fetch(`/api/projects/${id}`)
        if (res.ok) {
          const data = await res.json()
          setProjectId(data.id)
          setProjectName(data.name)
          setFiles(data.files || {})
          lastSavedHash.current = hashFileMapDeep(data.files || {})
          setActiveFile(null)
          return
        }
        console.error('Failed to load project:', res.status)
        setErrorMessage(`Could not load project (${res.status}). It may have been deleted.`)
        // Don't fall through to project creation — return to picker
        return
      } catch (err) {
        console.error('Failed to load project:', err)
        setErrorMessage('Could not load project. Check your connection and try again.')
        // Don't fall through to project creation — return to picker
        return
      }
    }

    // Creating new project (only reached when id is not provided)
    if (session?.githubUsername) {
      try {
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        })
        if (res.ok) {
          const data = await res.json()
          setProjectId(data.id)
        } else {
          console.error('Failed to create project:', res.status)
          setErrorMessage(`Cloud save unavailable (${res.status}). Working in local-only mode — changes won't persist across sessions.`)
        }
      } catch (err) {
        console.error('Failed to create project:', err)
        setErrorMessage('Cloud save unavailable. Working in local-only mode — changes won\'t persist across sessions.')
      }
    }

    setProjectName(name)
    setFiles(initialFiles || {})
    setActiveFile(null)
    if (query) setPendingMessage(query)
  }, [session])

  const handleFileChange = useCallback((path: string, content: string) => {
    setFiles(prev => ({ ...prev, [path]: content }))
  }, [])

  const handleFileDelete = useCallback((path: string) => {
    setFiles(prev => {
      const next = { ...prev }
      delete next[path]
      return next
    })
    setActiveFile(prev => prev === path ? null : prev)
  }, [])

  const handleBulkFileUpdate = useCallback((newFiles: Record<string, string>, opts?: { replace?: boolean }) => {
    if (opts?.replace) {
      setFiles(newFiles)
    } else {
      setFiles(prev => ({ ...prev, ...newFiles }))
    }
  }, [])

  const handleDeleteProject = useCallback(async (id: string) => {
    try {
      await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      setSavedProjects(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      console.error('Failed to delete project:', err)
      setErrorMessage('Failed to delete project. Please try again.')
    }
  }, [])

  // GitHub token is now handled server-side from JWT session — not exposed to client

  if (restoringProject && !projectName) {
    return (
      <ErrorBoundary>
        <div className="flex items-center justify-center h-screen bg-zinc-950">
          <div className="flex items-center gap-3 text-zinc-400">
            <div className="h-5 w-5 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
            <span className="text-sm">Restoring project...</span>
          </div>
        </div>
      </ErrorBoundary>
    )
  }

  if (!projectName) {
    return (
      <ErrorBoundary>
        {errorMessage && (
          <div className="fixed top-4 right-4 z-50 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm animate-in fade-in">
            {errorMessage}
          </div>
        )}
        {isOffline && (
          <div className="fixed bottom-4 left-4 z-50 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-4 py-2 rounded-lg text-sm">
            You&apos;re offline. Changes will save when you reconnect.
          </div>
        )}
        <ProjectPicker
          onSelect={handleSelectProject}
          savedProjects={savedProjects}
          loadingProjects={loadingProjects}
          onDeleteProject={handleDeleteProject}
          isLoggedIn={!!session?.user}
          loadError={projectsLoadError}
          onRetryLoad={loadProjects}
        />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
      {errorMessage && (
        <div className="fixed top-4 right-4 z-50 bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-2 rounded-lg text-sm animate-in fade-in">
          {errorMessage}
        </div>
      )}
      {concurrentTabWarning && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-amber-500/10 border border-amber-500/20 text-amber-400 px-4 py-2 rounded-lg text-sm flex items-center gap-2 animate-in fade-in">
          <span>This project is open in another tab. Edits may overwrite each other.</span>
          <button onClick={() => window.location.reload()} className="text-amber-300 hover:text-amber-100 font-medium ml-1">Reload</button>
          <button onClick={() => setConcurrentTabWarning(false)} className="text-amber-300 hover:text-amber-100 font-medium ml-1">Dismiss</button>
        </div>
      )}
      {isOffline && (
        <div className="fixed bottom-4 left-4 z-50 bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 px-4 py-2 rounded-lg text-sm">
          You&apos;re offline. Changes will save when you reconnect.
        </div>
      )}
      <Workspace
        projectName={projectName}
        projectId={projectId}
        files={files}
        activeFile={activeFile}
        onFileSelect={setActiveFile}
        onFileChange={handleFileChange}
        onFileDelete={handleFileDelete}
        onBulkFileUpdate={handleBulkFileUpdate}
        onSwitchProject={() => {
          setProjectName(null)
          setProjectId(null)
          setFiles({})
          setActiveFile(null)
          loadProjects()
        }}
        autoSaveError={autoSaveError}
        onManualSave={handleManualSave}
        onUpdateSettings={(settings) => {
          if (settings.name) setProjectName(settings.name)
        }}
        initialPendingMessage={pendingMessage}
        onInitialPendingMessageSent={() => setPendingMessage(null)}
      />
    </ErrorBoundary>
  )
}
