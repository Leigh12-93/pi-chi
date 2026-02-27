'use client'

import { useState, useCallback, useEffect } from 'react'
import { Workspace } from '@/components/workspace'
import { ProjectPicker } from '@/components/project-picker'
import type { Project, FileNode } from '@/lib/types'

export default function ForgePage() {
  const [project, setProject] = useState<Project | null>(null)
  const [files, setFiles] = useState<FileNode[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [showPicker, setShowPicker] = useState(true)

  const loadFiles = useCallback(async (projectName: string) => {
    try {
      const res = await fetch(`/api/files?project=${encodeURIComponent(projectName)}`)
      if (res.ok) {
        const data = await res.json()
        setFiles(data.files || [])
      }
    } catch { /* ignore */ }
  }, [])

  const loadFileContent = useCallback(async (projectName: string, filePath: string) => {
    try {
      const res = await fetch(`/api/files/read?project=${encodeURIComponent(projectName)}&path=${encodeURIComponent(filePath)}`)
      if (res.ok) {
        const data = await res.json()
        setFileContents(prev => ({ ...prev, [filePath]: data.content }))
      }
    } catch { /* ignore */ }
  }, [])

  const handleSelectProject = useCallback((p: Project) => {
    setProject(p)
    setShowPicker(false)
    setActiveFile(null)
    setFileContents({})
    loadFiles(p.name)
  }, [loadFiles])

  const handleFileSelect = useCallback((path: string) => {
    setActiveFile(path)
    if (project && !fileContents[path]) {
      loadFileContent(project.name, path)
    }
  }, [project, fileContents, loadFileContent])

  const handleFilesChanged = useCallback(() => {
    if (project) loadFiles(project.name)
  }, [project, loadFiles])

  // Poll for file changes while project is active
  useEffect(() => {
    if (!project) return
    const interval = setInterval(() => loadFiles(project.name), 3000)
    return () => clearInterval(interval)
  }, [project, loadFiles])

  if (showPicker) {
    return (
      <ProjectPicker
        onSelect={handleSelectProject}
        onCreateNew={(name) => {
          handleSelectProject({ name, path: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        }}
      />
    )
  }

  return (
    <Workspace
      project={project!}
      files={files}
      activeFile={activeFile}
      fileContents={fileContents}
      onFileSelect={handleFileSelect}
      onFilesChanged={handleFilesChanged}
      onSwitchProject={() => setShowPicker(true)}
      onFileContentUpdate={(path, content) => {
        setFileContents(prev => ({ ...prev, [path]: content }))
      }}
    />
  )
}
