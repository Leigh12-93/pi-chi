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

  // Restore project from sessionStorage on mount (survives refresh)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      const stored = sessionStorage.getItem('forge_active_project')
      if (!stored) return
      const { id, name } = JSON.parse(stored)
      if (id && name) {
        // Load the saved project from API
        fetch(`/api/projects/${id}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data) {
              setProjectId(data.id)
              setProjectName(data.name)
              setFiles(data.files || {})
              lastSavedHash.current = JSON.stringify(data.files || {})
            } else {
              // Project was deleted — clear storage
              sessionStorage.removeItem('forge_active_project')
            }
          })
          .catch(() => sessionStorage.removeItem('forge_active_project'))
      } else if (name) {
        // Unsaved project — just restore the name (files are lost on refresh)
        setProjectName(name)
      }
    } catch { /* ignore corrupt storage */ }
  }, [])

  // Persist active project to sessionStorage
  useEffect(() => {
    if (projectName) {
      sessionStorage.setItem('forge_active_project', JSON.stringify({ id: projectId, name: projectName }))
    } else {
      sessionStorage.removeItem('forge_active_project')
    }
  }, [projectId, projectName])

  // Load saved projects when session is available
  useEffect(() => {
    if (session?.githubUsername) {
      loadProjects()
    }
  }, [session?.githubUsername])

  const loadProjects = async () => {
    setLoadingProjects(true)
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        setSavedProjects(data)
      }
    } catch (err) {
      console.error('Failed to load projects:', err)
    } finally {
      setLoadingProjects(false)
    }
  }

  // Auto-save when files change (debounced 5 seconds)
  useEffect(() => {
    if (!projectId || Object.keys(files).length === 0) return

    const hash = hashFileMapDeep(files)
    if (hash === lastSavedHash.current) return

    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/projects/${projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files }),
        })
        lastSavedHash.current = hash
      } catch (err) {
        console.error('Auto-save failed:', err)
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
      } catch (err) {
        console.error('Failed to load project:', err)
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
    }
  }, [])

  const githubToken = session?.accessToken

  if (!projectName) {
    return (
      <ErrorBoundary>
        <ProjectPicker
          onSelect={handleSelectProject}
          savedProjects={savedProjects}
          loadingProjects={loadingProjects}
          onDeleteProject={handleDeleteProject}
          isLoggedIn={!!session?.user}
        />
      </ErrorBoundary>
    )
  }

  return (
    <ErrorBoundary>
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
      />
    </ErrorBoundary>
  )
}
