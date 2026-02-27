'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { Workspace } from '@/components/workspace'
import { ProjectPicker } from '@/components/project-picker'

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
  const { data: session } = useSession()
  const [projectId, setProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState<string | null>(null)
  const [files, setFiles] = useState<Record<string, string>>({})
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSavedHash = useRef<string>('')

  // Load saved projects when session is available
  useEffect(() => {
    if ((session as any)?.githubUsername) {
      loadProjects()
    }
  }, [(session as any)?.githubUsername])

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

    const hash = JSON.stringify(files)
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
      // Loading existing project
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
    if ((session as any)?.githubUsername) {
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
    if (activeFile === path) setActiveFile(null)
  }, [activeFile])

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

  const githubToken = (session as any)?.accessToken as string | undefined

  if (!projectName) {
    return (
      <ProjectPicker
        onSelect={handleSelectProject}
        savedProjects={savedProjects}
        loadingProjects={loadingProjects}
        onDeleteProject={handleDeleteProject}
        isLoggedIn={!!(session as any)?.githubUsername}
      />
    )
  }

  return (
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
  )
}
