'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from '@/components/session-provider'
import { Workspace } from '@/components/workspace'
import { ProjectPicker } from '@/components/project-picker'
import { ErrorBoundary } from '@/components/error-boundary'
import { LandingPage } from '@/components/landing/landing-page'
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

export default function PiChiPage() {
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
  const [duplicatingProjectId, setDuplicatingProjectId] = useState<string | null>(null)
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null)
  const [vercelUrl, setVercelUrl] = useState<string | null>(null)
  const [currentBranch, setCurrentBranch] = useState<string>('main')
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try { return sessionStorage.getItem('pi_onboarding_done') === '1' } catch { return false }
  })
  // pendingAuditMessage removed — auto-scan disabled, user triggers manually

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

  // Auto-audit dispatch removed — user triggers audits manually

  /** After importing from GitHub, auto-detect and connect integrations (fire-and-forget) */
  const autoConnectFromImport = useCallback(async (importedFiles: Record<string, string>, repoUrl: string, newProjectId: string, onFilesUpdate?: (files: Record<string, string>) => void) => {
    // Parse all env vars from project files
    const envFileNames = ['.env.local', '.env', '.env.development', '.env.production']
    const envVars: Record<string, string> = {}
    for (const envFile of envFileNames) {
      const content = importedFiles[envFile]
      if (!content) continue
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
        const eqIdx = trimmed.indexOf('=')
        const k = trimmed.slice(0, eqIdx).trim()
        const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
        if (k && v && !envVars[k]) envVars[k] = v
      }
    }

    // 1. Auto-detect Supabase credentials
    let sbUrl = ''
    let sbKey = ''
    for (const [k, v] of Object.entries(envVars)) {
      if (k.includes('SUPABASE') && k.includes('URL') && v.startsWith('https://')) sbUrl = v
      if (k.includes('SUPABASE') && (k.includes('SERVICE_ROLE') || k.includes('ANON')) && v.startsWith('ey')) {
        if (k.includes('SERVICE_ROLE') || !sbKey) sbKey = v
      }
    }
    if (sbUrl && sbKey) {
      try { await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ supabaseUrl: sbUrl, supabaseKey: sbKey, skipValidation: true }) }) } catch (e) { console.warn('[pi:env-detect] Failed to auto-save Supabase creds:', e) }
    }

    // 2. Auto-detect Anthropic API key
    const anthropicKey = envVars['ANTHROPIC_API_KEY']
    if (anthropicKey?.startsWith('sk-ant-')) {
      try { await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ apiKey: anthropicKey, skipValidation: true }) }) } catch (e) { console.warn('[pi:env-detect] Failed to auto-save Anthropic key:', e) }
    }

    // 3. Auto-detect Vercel/deploy token
    const vercelToken = envVars['PI_DEPLOY_TOKEN'] || envVars['VERCEL_TOKEN']
    if (vercelToken) {
      try { await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vercelToken, skipValidation: true }) }) } catch (e) { console.warn('[pi:env-detect] Failed to auto-save Vercel token:', e) }
    }

    // 4. Auto-detect Google API key
    const googleKey = envVars['GOOGLE_API_KEY'] || envVars['NEXT_PUBLIC_GOOGLE_API_KEY']
    if (googleKey?.startsWith('AIza')) {
      try { await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ googleApiKey: googleKey }) }) } catch (e) { console.warn('[pi:env-detect] Failed to auto-save Google key:', e) }
    }

    // 5b. Auto-detect Stripe credentials
    const stripeSecretKey = envVars['STRIPE_SECRET_KEY'] || envVars['STRIPE_SK']
    const stripePublishableKey = envVars['STRIPE_PUBLISHABLE_KEY'] || envVars['NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'] || envVars['REACT_APP_STRIPE_PUBLISHABLE_KEY']
    const stripeWebhookSecret = envVars['STRIPE_WEBHOOK_SECRET']
    if (stripeSecretKey?.startsWith('sk_live_') || stripeSecretKey?.startsWith('sk_test_')) {
      const stripeBody: Record<string, string> = { stripeSecretKey, skipValidation: 'true' } as any
      if (stripePublishableKey?.startsWith('pk_')) stripeBody.stripePublishableKey = stripePublishableKey
      if (stripeWebhookSecret?.startsWith('whsec_')) stripeBody.stripeWebhookSecret = stripeWebhookSecret
      try { await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(stripeBody) }) } catch (e) { console.warn('[pi:env-detect] Failed to auto-save Stripe creds:', e) }
    }

    // 6. Auto-save all env vars to global env var store (merge, don't overwrite)
    if (Object.keys(envVars).length > 0) {
      try {
        const existingRes = await fetch('/api/settings/env-export')
        const existingData = existingRes.ok ? await existingRes.json() : { variables: [] }
        const existingVars: Array<{ key: string; value: string }> = existingData.variables || []
        const existingKeys = new Set(existingVars.map((v: { key: string }) => v.key))
        const newVars = Object.entries(envVars)
          .filter(([k]) => !existingKeys.has(k))
          .map(([key, value]) => ({ key, value }))
        if (newVars.length > 0) {
          const merged = [...existingVars, ...newVars]
          await fetch('/api/settings/env-export', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ variables: merged }),
          })
        }
      } catch (e) { console.warn('[pi:env-detect] Failed to save global env vars:', e) }
    }

    // 5. Auto-detect Vercel project linked to this GitHub repo + import its env vars
    try {
      const res = await fetch('/api/vercel/projects')
      if (res.ok) {
        const data = await res.json()
        const projects = Array.isArray(data) ? data : data.projects || []
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
          // Import Vercel env vars into .env.local
          try {
            const envRes = await fetch(`/api/vercel/env?projectId=${match.id}`)
            if (envRes.ok) {
              const vercelEnvs = await envRes.json()
              if (Array.isArray(vercelEnvs) && vercelEnvs.length > 0) {
                const existing = importedFiles['.env.local'] || ''
                const existingKeys = new Set(
                  existing.split('\n').filter(l => !l.startsWith('#') && l.includes('=')).map(l => l.split('=')[0].trim())
                )
                const newVars = vercelEnvs
                  .filter((e: any) => e.value && !existingKeys.has(e.key))
                  .map((e: any) => `${e.key}=${e.value}`)
                if (newVars.length > 0) {
                  const updatedEnv = [existing.trim(), '# Vercel Environment Variables', ...newVars].filter(Boolean).join('\n') + '\n'
                  onFilesUpdate?.({ '.env.local': updatedEnv })
                }
              }
            }
          } catch (e) { console.warn('[pi:env-detect] Failed to import Vercel env vars:', e) }
        }
      }
    } catch (e) { console.warn('[pi:env-detect] Failed to detect Vercel project:', e) }

    // 7. Auto-inject saved global env vars into .env.local for vars the project needs but are empty/missing
    try {
      const globalRes = await fetch('/api/settings/env-export')
      if (globalRes.ok) {
        const globalData = await globalRes.json()
        const savedVars: Array<{ key: string; value: string }> = globalData.variables || []
        if (savedVars.length > 0) {
          const injected: string[] = []
          for (const sv of savedVars) {
            // Check if this key exists in ANY env file
            const existsWithValue = Object.values(importedFiles).some(content => {
              if (!content) return false
              return content.split('\n').some(line => {
                const t = line.trim()
                if (t.startsWith('#') || !t.includes('=')) return false
                const k = t.slice(0, t.indexOf('=')).trim()
                const v = t.slice(t.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
                return k === sv.key && v.length > 0
              })
            })
            if (!existsWithValue) {
              // Check if key is referenced in code (import.meta.env, process.env)
              const isReferenced = Object.entries(importedFiles).some(([path, content]) => {
                if (path.startsWith('.env') || !content) return false
                return content.includes(`process.env.${sv.key}`) || content.includes(`import.meta.env.${sv.key}`) || content.includes(`env.${sv.key}`)
              })
              if (isReferenced) {
                injected.push(`${sv.key}=${sv.value}`)
              }
            }
          }
          if (injected.length > 0) {
            const existing = importedFiles['.env.local'] || ''
            const updated = [existing.trim(), '# Auto-injected from saved env vars', ...injected].filter(Boolean).join('\n') + '\n'
            onFilesUpdate?.({ '.env.local': updated })
          }
        }
      }
    } catch (e) { console.warn('[pi:env-detect] Failed to inject global env vars:', e) }
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
          setVercelUrl(data.vercel_url || null)
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
      autoConnectFromImport(initialFiles, meta.githubRepoUrl, newProjectId, handleBulkFileUpdate)
    }

    // Auto-scan on import disabled — user triggers audits manually via chat
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

  const handleDuplicateProject = useCallback(async (id: string) => {
    setDuplicatingProjectId(id)
    try {
      const res = await fetch(`/api/projects/${id}/duplicate`, { method: 'POST' })
      if (res.ok) {
        const newProject = await res.json()
        setSavedProjects(prev => [newProject, ...prev])
        toast.success(`Duplicated as "${newProject.name}"`)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error || `Failed to duplicate project (HTTP ${res.status})`)
      }
    } catch (err) {
      console.error('Failed to duplicate project:', err)
      toast.error('Failed to duplicate project. Please try again.')
    } finally {
      setDuplicatingProjectId(null)
    }
  }, [])

  // GitHub token is now handled server-side from JWT session — not exposed to client

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
              try { sessionStorage.setItem('pi_onboarding_done', '1') } catch (e) { console.warn('[pi:sessionStorage] Failed to persist onboarding state:', e) }
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
          onDuplicateProject={handleDuplicateProject}
          deletingProjectId={deletingProjectId}
          duplicatingProjectId={duplicatingProjectId}
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
