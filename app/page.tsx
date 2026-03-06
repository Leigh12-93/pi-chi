'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from '@/components/session-provider'
import { Workspace } from '@/components/workspace'
import { ProjectPicker } from '@/components/project-picker'
import { ErrorBoundary } from '@/components/error-boundary'
import { SignInPage } from '@/components/sign-in-page'
import { ApiKeyGate } from '@/components/api-key-gate'
import { Onboarding } from '@/components/onboarding'
import { hashFileMapDeep } from '@/lib/utils'
import { toast } from 'sonner'

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
  const { session, status, refresh } = useSession()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [files, setFiles] = useState<Record<string, string>>({})
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [projectsHasMore, setProjectsHasMore] = useState(false)
  const projectsPageRef = useRef(1)
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedHash = useRef<string>('')
  const restoredRef = useRef(false)
  const savingRef = useRef(false)
  const saveRetriesRef = useRef(0)
  const loadingProjectsRef = useRef(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'pending' | 'saving' | 'saved' | 'error'>('idle')
  const [autoSaveError, setAutoSaveError] = useState(false)
  const [projectsLoadError, setProjectsLoadError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [restoringProject, setRestoringProject] = useState(false)
  const [concurrentTabWarning, setConcurrentTabWarning] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null)
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null)
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try { return sessionStorage.getItem('forge_onboarding_done') === '1' } catch { return false }
  })
  const [pendingAuditMessage, setPendingAuditMessage] = useState<string | null>(null)

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
              setGithubRepoUrl(data.github_repo_url || null)
              lastSavedHash.current = hashFileMapDeep(data.files || {})
              // Restore active file if it still exists
              if (stored.activeFile && data.files?.[stored.activeFile]) {
                setActiveFile(stored.activeFile)
              }
              // Auto-scan if project hasn't been scanned in 7+ days
              const projectFiles = data.files || {}
              const fileCount = Object.keys(projectFiles).length
              if (fileCount >= 3) {
                try {
                  const lastAuditFile = projectFiles['.forge/last-audit.json']
                  const lastScan = lastAuditFile ? JSON.parse(lastAuditFile).timestamp : null
                  const daysSinceScan = lastScan ? (Date.now() - new Date(lastScan).getTime()) / 86400000 : Infinity
                  if (daysSinceScan > 7) {
                    setPendingAuditMessage(
                      '[AUTO-SCAN] This project hasn\'t been scanned in ' +
                      (lastScan ? `${Math.floor(daysSinceScan)} days` : 'ever') + '. ' +
                      'Run a deep architectural scan focusing on structural issues and codebase errors. ' +
                      'Do NOT change any UI or content.'
                    )
                  }
                } catch { /* ignore parse errors */ }
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

  const loadProjects = async (page = 1) => {
    if (loadingProjectsRef.current) return
    loadingProjectsRef.current = true
    setLoadingProjects(true)
    if (page === 1) setProjectsLoadError(false)
    try {
      const res = await fetch(`/api/projects?page=${page}&limit=20`)
      if (res.ok) {
        const data = await res.json()
        const projects = data.projects || data
        setSavedProjects(prev => page === 1 ? projects : [...prev, ...projects])
        setProjectsHasMore(!!data.hasMore)
        projectsPageRef.current = page
      } else {
        if (page === 1) setProjectsLoadError(true)
      }
    } catch (err) {
      console.error('Failed to load projects:', err)
      if (page === 1) setProjectsLoadError(true)
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
        try { localStorage.setItem(`forge-unsaved-${projectId}`, JSON.stringify(files)) } catch {}
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

  // Auto-audit: dispatch pending audit message after project load settles
  useEffect(() => {
    if (!pendingAuditMessage || !projectId) return
    const timer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('forge:auto-audit', {
        detail: { message: pendingAuditMessage, projectId }
      }))
      setPendingAuditMessage(null)
    }, 1500) // Wait for project to fully load
    return () => clearTimeout(timer)
  }, [pendingAuditMessage, projectId])

  /** After importing from GitHub, auto-detect and connect integrations (fire-and-forget) */
  const autoConnectFromImport = useCallback(async (importedFiles: Record<string, string>, repoUrl: string, newProjectId: string) => {
    // 1. Auto-detect Supabase credentials from env files and save to user settings
    const envFiles = ['.env.local', '.env', '.env.development', '.env.production']
    for (const envFile of envFiles) {
      const content = importedFiles[envFile]
      if (!content) continue
      let sbUrl = ''
      let sbKey = ''
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
        const eqIdx = trimmed.indexOf('=')
        const k = trimmed.slice(0, eqIdx).trim()
        const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
        if (k.includes('SUPABASE') && k.includes('URL') && v.startsWith('https://')) sbUrl = v
        if (k.includes('SUPABASE') && (k.includes('SERVICE_ROLE') || k.includes('ANON')) && v.startsWith('ey')) {
          if (k.includes('SERVICE_ROLE') || !sbKey) sbKey = v
        }
      }
      if (sbUrl && sbKey) {
        try {
          await fetch('/api/settings', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ supabaseUrl: sbUrl, supabaseKey: sbKey, skipValidation: true }),
          })
        } catch {}
        break
      }
    }

    // 2. Auto-detect Vercel project linked to this GitHub repo
    try {
      const res = await fetch('/api/vercel/projects')
      if (res.ok) {
        const data = await res.json()
        const projects = Array.isArray(data) ? data : data.projects || []
        // Match by GitHub repo URL
        const repoPath = repoUrl.replace('https://github.com/', '').toLowerCase()
        const match = projects.find((p: any) => {
          const linked = p.link?.repo?.toLowerCase() || p.link?.repoSlug?.toLowerCase() || ''
          return linked === repoPath || linked === repoPath.split('/')[1]
        })
        if (match) {
          await fetch(`/api/projects/${newProjectId}/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vercel_project_id: match.id }),
          })
        }
      }
    } catch {}
  }, [])

  const handleSelectProject = useCallback(async (name: string, id?: string, initialFiles?: Record<string, string>, query?: string, meta?: { githubRepoUrl?: string }) => {
    if (id) {
      setLoadingProjectId(id)
      try {
        const res = await fetch(`/api/projects/${id}`)
        if (res.ok) {
          const data = await res.json()
          setProjectId(data.id)
          setProjectName(data.name)
          setFiles(data.files || {})
          setGithubRepoUrl(data.github_repo_url || null)
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
      } finally {
        setLoadingProjectId(null)
      }
    }

    // Creating new project (only reached when id is not provided)
    let newProjectId: string | null = null
    if (session?.githubUsername) {
      try {
        const createBody: Record<string, unknown> = { name }
        if (meta?.githubRepoUrl) createBody.github_repo_url = meta.githubRepoUrl
        const res = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createBody),
        })
        if (res.ok) {
          const data = await res.json()
          setProjectId(data.id)
          newProjectId = data.id
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
    setGithubRepoUrl(meta?.githubRepoUrl || null)
    if (query) setPendingMessage(query)

    // Auto-connect integrations from imported files (fire-and-forget)
    if (initialFiles && meta?.githubRepoUrl && newProjectId) {
      autoConnectFromImport(initialFiles, meta.githubRepoUrl, newProjectId)
    }

    // Auto-scan imported projects with 3+ files
    if (initialFiles && Object.keys(initialFiles).length >= 3) {
      setPendingAuditMessage(
        '[AUTO-SCAN] This project was just imported. Run a deep architectural scan: ' +
        'analyze the codebase structure, find architectural bugs, structural issues, ' +
        'and codebase errors. Do NOT change any UI or content. Focus on: ' +
        'missing dependencies, broken imports, incorrect patterns, config issues, ' +
        'type safety gaps, security vulnerabilities, and architectural inconsistencies. ' +
        'Present findings with severity ratings.'
      )
    }
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
    setDeletingProjectId(id)
    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setSavedProjects(prev => prev.filter(p => p.id !== id))
      } else {
        setErrorMessage(`Failed to delete project (HTTP ${res.status}). Please try again.`)
      }
    } catch (err) {
      console.error('Failed to delete project:', err)
      setErrorMessage('Failed to delete project. Please try again.')
    } finally {
      setDeletingProjectId(null)
    }
  }, [])

  // GitHub token is now handled server-side from JWT session — not exposed to client

  // Auth gate: show sign-in page if not authenticated
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center h-screen bg-forge-bg">
        <div className="h-5 w-5 border-2 border-forge-border border-t-forge-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return <SignInPage />
  }

  // API key gate: require BYOK before proceeding
  if (session && !session.hasApiKey) {
    return <ApiKeyGate onKeySet={() => refresh()} />
  }

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
    // Show onboarding for users with zero projects (first-time experience)
    if (!loadingProjects && savedProjects.length === 0 && !onboardingDismissed && !projectsLoadError) {
      return (
        <ErrorBoundary>
          <Onboarding
            onComplete={({ template, description }) => {
              setOnboardingDismissed(true)
              try { sessionStorage.setItem('forge_onboarding_done', '1') } catch {}
              const projectName = template || 'my-project'
              const query = description
                ? `Create a ${template} project: ${description}`
                : undefined
              handleSelectProject(projectName, undefined, undefined, query)
            }}
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
          deletingProjectId={deletingProjectId}
          loadingProjectId={loadingProjectId}
          isLoggedIn={!!session?.user}
          loadError={projectsLoadError}
          onRetryLoad={loadProjects}
          hasMoreProjects={projectsHasMore}
          onLoadMoreProjects={() => loadProjects(projectsPageRef.current + 1)}
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
        saveStatus={saveStatus}
        onManualSave={handleManualSave}
        onUpdateSettings={(settings) => {
          if (settings.name) setProjectName(settings.name)
        }}
        initialPendingMessage={pendingMessage}
        onInitialPendingMessageSent={() => setPendingMessage(null)}
        githubRepoUrl={githubRepoUrl}
      />
    </ErrorBoundary>
  )
}
