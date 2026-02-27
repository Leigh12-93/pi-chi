'use client'

import { useState, useCallback } from 'react'
import { Workspace } from '@/components/workspace'
import { ProjectPicker } from '@/components/project-picker'
import type { FileNode } from '@/lib/types'

export default function ForgePage() {
  const [projectName, setProjectName] = useState<string | null>(null)
  // Virtual filesystem — all files stored in browser memory
  const [files, setFiles] = useState<Record<string, string>>({})
  const [activeFile, setActiveFile] = useState<string | null>(null)

  const handleSelectProject = useCallback((name: string, initialFiles?: Record<string, string>) => {
    setProjectName(name)
    setFiles(initialFiles || {})
    setActiveFile(null)
  }, [])

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

  if (!projectName) {
    return <ProjectPicker onSelect={handleSelectProject} />
  }

  return (
    <Workspace
      projectName={projectName}
      files={files}
      activeFile={activeFile}
      onFileSelect={setActiveFile}
      onFileChange={handleFileChange}
      onFileDelete={handleFileDelete}
      onBulkFileUpdate={handleBulkFileUpdate}
      onSwitchProject={() => setProjectName(null)}
    />
  )
}
