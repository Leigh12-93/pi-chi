'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from '@/components/session-provider'
import { AgentShell } from '@/components/agent-shell'
import { ErrorBoundary } from '@/components/error-boundary'
import { LandingPage } from '@/components/landing/landing-page'
import { ApiKeyGate } from '@/components/api-key-gate'
import { hashFileMapDeep } from '@/lib/utils'
import { toast } from 'sonner'

export default function PiChiPage() {
  const { session, status, refresh } = useSession()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [files, setFiles] = useState<Record<string, string>>({})
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const agentInitRef = useRef(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedHash = useRef<string>('')
  const restoredRef = useRef(false)
  const savingRef = useRef(false)
  const saveRetriesRef = useRef(0)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const [autoSaveError, setAutoSaveError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [restoringProject, setRestoringProject] = useState(false)
  const [concurrentTabWarning, setConcurrentTabWarning] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null)
  const [vercelUrl, setVercelUrl] = useState<string | null>(null)
  const [currentBranch, setCurrentBranch] = useState<string>('main')

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel('pi_project_edit')
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

  // Show toast for OAuth errors in URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const error = params.get('error')
    if (!error) return
    const errorMessages: Record<string, string> = {
      no_code: 'Sign-in was cancelled. Please try again.',
      csrf_validation_failed: 'Security check failed. Please sign in again.',
      token_exchange_failed: 'GitHub authentication failed. Please try again.',
      callback_failed: 'Sign-in error. Please try again.',
    }
    toast.error(errorMessages[error] || 'Authentication error. Please try again.')
    window.history.replaceState({}, '', window.location.pathname)
  }, [])

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      const raw = sessionStorage.getItem('pi_active_project')
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
              setGithubRepoUrl(data.github_repo_url || null)
              setVercelUrl(data.vercel_url || null)
              lastSavedHash.current = hashFileMapDeep(data.files || {})
              // Restore active file if it still exists
              if (stored.activeFile && data.files?.[stored.activeFile]) {
                setActiveFile(stored.activeFile)
              }
              // Auto-scan disabled — user triggers audits manually via chat
              // Previous behavior silently fired scans on load, spamming the chat
            } else {
              // Project was deleted — clear storage
              sessionStorage.removeItem('pi_active_project')
            }
          })
          .catch(() => sessionStorage.removeItem('pi_active_project'))
          .finally(() => setRestoringProject(false))
      } else if (name) {
        // Unsaved project — just restore the name (files are lost on refresh)
        setProjectName(name)
      }
    } catch { /* ignore corrupt storage */ }
  }, [])

  // Longer timeout for persistent warnings (local-only mode)
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
        sessionStorage.setItem('pi_active_project', JSON.stringify({ id: projectId, name: projectName, activeFile }))
        // Push a history entry so browser back goes to project picker, not off-site
        if (!window.history.state?.piProject) {
          window.history.pushState({ piProject: true }, '', window.location.href)
        }
      } else {
        sessionStorage.removeItem('pi_active_project')
      }
    } catch { /* sessionStorage unavailable (private browsing) — non-fatal */ }
  }, [projectId, projectName, activeFile])

  // Handle browser back button — reset to re-init agent project
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (projectName) {
        e.preventDefault()
        setProjectName(null)
        setProjectId(null)
        setFiles({})
        setActiveFile(null)
        agentInitRef.current = false // allow re-init
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [projectName])

  // Auto-create or restore the agent project
  useEffect(() => {
    if (!session?.githubUsername || agentInitRef.current || restoredRef.current) return
    if (projectName) return // already have a project (restored from session)
    agentInitRef.current = true

    async function initAgentProject() {
      setRestoringProject(true)
      try {
        // Check for existing projects
        const res = await fetch('/api/projects?page=1&limit=1')
        if (res.ok) {
          const data = await res.json()
          const projects = data.projects || data
          if (projects.length > 0) {
            // Restore the first (most recent) project
            const proj = projects[0]
            const detailRes = await fetch(`/api/projects/${proj.id}`)
            if (detailRes.ok) {
              const detail = await detailRes.json()
              setProjectId(detail.id)
              setProjectName(detail.name)
              setFiles(detail.files || {})
              setGithubRepoUrl(detail.github_repo_url || null)
              setVercelUrl(detail.vercel_url || null)
              lastSavedHash.current = hashFileMapDeep(detail.files || {})
              setRestoringProject(false)
              return
            }
          }
        }

        // No existing project — create the default agent project
        const createRes = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Pi-Chi Agent' }),
        })
        if (createRes.ok) {
          const data = await createRes.json()
          setProjectId(data.id)
          setProjectName('Pi-Chi Agent')
        } else {
          // Fallback: work without cloud save
          setProjectName('Pi-Chi Agent')
          setErrorMessage('Cloud save unavailable. Working in local-only mode.')
        }
      } catch (err) {
        console.error('Failed to init agent project:', err)
        setProjectName('Pi-Chi Agent')
        setErrorMessage('Cloud save unavailable. Working in local-only mode.')
      } finally {
        setRestoringProject(false)
      }
    }

    initAgentProject()
  }, [session?.githubUsername, projectName])

  // Auto-save when files change (debounced 5 seconds, with save lock)
  useEffect(() => {
    if (!projectId || Object.keys(files).length === 0) return

    const hash = hashFileMapDeep(files)
    if (hash === lastSavedHash.current) return

    setSaveStatus('pending')
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    if (retryTimer.current) clearTimeout(retryTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      if (savingRef.current) return // skip if another save is in-flight
      savingRef.current = true
      setSaveStatus('saving')
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files }),
        })
        if (res.ok) {
          lastSavedHash.current = hash
          setAutoSaveError(false)
          setSaveStatus('saved')
          saveRetriesRef.current = 0
          setTimeout(() => setSaveStatus('idle'), 2000)
        } else {
          throw new Error(`HTTP ${res.status}`)
        }
      } catch {
        if (saveRetriesRef.current < 3) {
          saveRetriesRef.current++
          // Exponential backoff retry
          savingRef.current = false
          retryTimer.current = setTimeout(async () => {
            savingRef.current = true
            try {
              const retryRes = await fetch(`/api/projects/${projectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files }),
              })
              if (retryRes.ok) {
                lastSavedHash.current = hash
                setAutoSaveError(false)
                setSaveStatus('saved')
                saveRetriesRef.current = 0
                setTimeout(() => setSaveStatus('idle'), 2000)
              } else {
                setAutoSaveError(true)
                setSaveStatus('error')
              }
            } catch {
              setAutoSaveError(true)
            } finally {
              savingRef.current = false
            }
          }, 2000 * saveRetriesRef.current)
          return
        }
        setAutoSaveError(true)
        setSaveStatus('error')
        // Backup to localStorage as safety net
        try { localStorage.setItem(`pi-unsaved-${projectId}`, JSON.stringify(files)) } catch (e) { console.warn('[pi:localStorage] Failed to backup unsaved files:', e) }
      } finally {
        savingRef.current = false
      }
    }, 5000)

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [files, projectId])

  // Manual save — cancels pending auto-save, saves immediately, updates hash
  const handleManualSave = useCallback(async () => {
    if (!projectId || Object.keys(files).length === 0) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    if (savingRef.current) return
    savingRef.current = true
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      })
      if (res.ok) {
        lastSavedHash.current = hashFileMapDeep(files)
        setAutoSaveError(false)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else {
        setAutoSaveError(true)
        setSaveStatus('error')
      }
    } catch {
      setAutoSaveError(true)
      setSaveStatus('error')
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

  // Auth gate: show sign-in page if not authenticated
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-pi-bg">
        <div className="h-5 w-5 border-2 border-pi-border border-t-pi-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <LandingPage />
  }

  // API key gate: require BYOK before proceeding
  if (session && !session.hasApiKey) {
    return <ApiKeyGate onKeySet={() => refresh()} />
  }

  // Loading state: initializing agent project
  if (restoringProject || !projectName) {
    return (
      <ErrorBoundary>
        <div className="flex items-center justify-center h-screen bg-pi-bg">
          <div className="flex flex-col items-center gap-3">
            <div className="h-6 w-6 border-2 border-pi-border border-t-pi-accent rounded-full animate-spin" />
            <span className="text-sm text-pi-text-dim">Initializing Pi-Chi Agent...</span>
          </div>
        </div>
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
      <AgentShell
        projectName={projectName}
        projectId={projectId}
        files={files}
        activeFile={activeFile}
        onFileSelect={setActiveFile}
        onFileChange={handleFileChange}
        onFileDelete={handleFileDelete}
        onBulkFileUpdate={handleBulkFileUpdate}
        onSwitchProject={() => {
          // In agent mode, "switch project" just resets state
          setProjectName(null)
          setProjectId(null)
          setFiles({})
          setActiveFile(null)
        }}
        autoSaveError={autoSaveError}
        saveStatus={saveStatus}
        onManualSave={handleManualSave}
        onUpdateSettings={(settings) => {
          if (settings.name) setProjectName(settings.name)
        }}
        pendingMessage={pendingMessage}
        onPendingMessageSent={() => setPendingMessage(null)}
        githubRepoUrl={githubRepoUrl}
        onGithubRepoUrlChange={setGithubRepoUrl}
        githubUsername={session?.githubUsername}
        vercelUrl={vercelUrl}
        onVercelUrlChange={setVercelUrl}
        currentBranch={currentBranch}
        onBranchChange={setCurrentBranch}
      />
    </ErrorBoundary>
  )
}
