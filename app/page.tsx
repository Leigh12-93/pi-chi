'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from '@/components/session-provider'
import { AgentShell } from '@/components/agent-shell'
import { ErrorBoundary } from '@/components/error-boundary'
import { LandingPage } from '@/components/landing/landing-page'
import { ApiKeyGate } from '@/components/api-key-gate'
import { hashFileMapDeep } from '@/lib/utils'
import { toast } from 'sonner'

import { useConcurrentTabGuard } from '@/hooks/use-concurrent-tab-guard'
import { useProjectRestore } from '@/hooks/use-project-restore'
import { useProjectPersistence } from '@/hooks/use-project-persistence'
import { useOfflineSync } from '@/hooks/use-offline-sync'

export default function PiChiPage() {
  const { session, status, refresh } = useSession()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [files, setFiles] = useState<Record<string, string>>({})
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const agentInitRef = useRef(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pendingMessage, setPendingMessage] = useState<string | null>(null)
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null)
  const [vercelUrl, setVercelUrl] = useState<string | null>(null)
  const [currentBranch, setCurrentBranch] = useState<string>('main')

  // Extracted hooks
  const { concurrentTabWarning, setConcurrentTabWarning } = useConcurrentTabGuard(projectId)

  const { restoringProject, setRestoringProject, restoredRef } = useProjectRestore(
    useCallback((result, hash) => {
      setProjectId(result.projectId)
      setProjectName(result.projectName)
      setFiles(result.files)
      if (result.activeFile) setActiveFile(result.activeFile)
      setGithubRepoUrl(result.githubRepoUrl)
      setVercelUrl(result.vercelUrl)
      persistence.setLastSavedHash(hash)
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
  )

  const persistence = useProjectPersistence(projectId, projectName, files, activeFile)

  const reconnectHandler = useCallback(() => {
    if (projectId && Object.keys(files).length > 0) {
      const hash = hashFileMapDeep(files)
      if (hash !== persistence.lastSavedHash.current) {
        persistence.handleManualSave()
      }
    }
  }, [projectId, files, persistence.handleManualSave]) // eslint-disable-line react-hooks/exhaustive-deps

  const { isOffline } = useOfflineSync(reconnectHandler)

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

  // Longer timeout for persistent warnings (local-only mode)
  useEffect(() => {
    if (errorMessage) {
      const isLocalOnlyWarning = errorMessage.includes('local-only')
      const t = setTimeout(() => setErrorMessage(null), isLocalOnlyWarning ? 15000 : 5000)
      return () => clearTimeout(t)
    }
  }, [errorMessage])

  // Handle browser back button — reset to re-init agent project
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      if (projectName) {
        e.preventDefault()
        setProjectName(null)
        setProjectId(null)
        setFiles({})
        setActiveFile(null)
        agentInitRef.current = false
      }
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [projectName])

  // Auto-create or restore the agent project
  useEffect(() => {
    if (!session?.githubUsername || agentInitRef.current) return
    if (restoredRef.current && projectName) return
    if (projectName) return
    agentInitRef.current = true

    async function initAgentProject() {
      setRestoringProject(true)
      try {
        const res = await fetch('/api/projects?page=1&limit=1')
        if (res.ok) {
          const data = await res.json()
          const projects = data.projects || data
          if (projects.length > 0) {
            const proj = projects[0]
            const detailRes = await fetch(`/api/projects/${proj.id}`)
            if (detailRes.ok) {
              const detail = await detailRes.json()
              setProjectId(detail.id)
              setProjectName(detail.name)
              setFiles(detail.files || {})
              setGithubRepoUrl(detail.github_repo_url || null)
              setVercelUrl(detail.vercel_url || null)
              persistence.setLastSavedHash(hashFileMapDeep(detail.files || {}))
              setRestoringProject(false)
              return
            }
          }
        }

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
  }, [session?.githubUsername, projectName]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Landing page disabled for kiosk mode
  if (false) {
    return <LandingPage />
  }

  // API key gate disabled for kiosk mode
  if (false) {
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
          setProjectName(null)
          setProjectId(null)
          setFiles({})
          setActiveFile(null)
        }}
        autoSaveError={persistence.autoSaveError}
        saveStatus={persistence.saveStatus}
        onManualSave={persistence.handleManualSave}
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
