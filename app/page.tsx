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
  const [autoSaveError, setAutoSaveError] = useState(false)
  const [projectsLoadError, setProjectsLoadError] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [restoringProject, setRestoringProject] = useState(false)

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
              lastSavedHash.current = JSON.stringify(data.files || {})
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

  // Auto-clear error message after 5 seconds
  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(null), 5000)
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

  const handleSelectProject = useCallback(async (name: string, id?: string, initialFiles?: Record<string, string>) => {
    if (id) {
      try {
        const res = await fetch(`/api/projects/${id}`)
        if (res.ok) {
          const data = await res.json()
          setProjectId(data.id)
          setProjectName(data.name)
          setFiles(data.files || {})
          lastSavedHash.current = JSON.stringify(data.files || {})
          setActiveFile(null)
          return
        }
        console.error('Failed to load project:', res.status)
        setErrorMessage(`Failed to load project (${res.status}). Starting fresh.`)
      } catch (err) {
        console.error('Failed to load project:', err)
        setErrorMessage('Failed to load project. Starting fresh.')
      }
    }

    // Creating new project
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
        }
      } catch (err) {
        console.error('Failed to create project:', err)
        setErrorMessage('Failed to save project to cloud. Working in local-only mode.')
      }
    }

    setProjectName(name)
    setFiles(initialFiles || {})
    setActiveFile(null)
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

  const handleBulkFileUpdate = useCallback((newFiles: Record<string, string>) => {
    setFiles(prev => ({ ...prev, ...newFiles }))
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

  const githubToken = session?.accessToken

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
        githubToken={githubToken}
        autoSaveError={autoSaveError}
        onUpdateSettings={(settings) => {
          if (settings.name) setProjectName(settings.name)
        }}
      />
    </ErrorBoundary>
  )
}
