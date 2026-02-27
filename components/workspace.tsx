'use client'

import { useState } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ChatPanel } from './chat-panel'
import { CodeEditor } from './code-editor'
import { FileTree } from './file-tree'
import { PreviewPanel } from './preview-panel'
import { Header } from './header'
import type { Project, FileNode } from '@/lib/types'

interface WorkspaceProps {
  project: Project
  files: FileNode[]
  activeFile: string | null
  fileContents: Record<string, string>
  onFileSelect: (path: string) => void
  onFilesChanged: () => void
  onSwitchProject: () => void
  onFileContentUpdate: (path: string, content: string) => void
}

export function Workspace({
  project, files, activeFile, fileContents,
  onFileSelect, onFilesChanged, onSwitchProject, onFileContentUpdate,
}: WorkspaceProps) {
  const [rightTab, setRightTab] = useState<'code' | 'preview'>('code')
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const handleFileSelect = (path: string) => {
    onFileSelect(path)
    if (!openFiles.includes(path)) {
      setOpenFiles(prev => [...prev, path])
    }
  }

  const handleCloseFile = (path: string) => {
    setOpenFiles(prev => prev.filter(f => f !== path))
    if (activeFile === path) {
      const remaining = openFiles.filter(f => f !== path)
      onFileSelect(remaining[remaining.length - 1] || '')
    }
  }

  const handleSaveFile = async (path: string, content: string) => {
    try {
      await fetch('/api/files', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: project.name, path, content }),
      })
      onFileContentUpdate(path, content)
    } catch { /* ignore */ }
  }

  return (
    <div className="h-screen flex flex-col bg-forge-bg">
      <Header
        project={project}
        onSwitchProject={onSwitchProject}
        previewUrl={previewUrl}
      />

      <PanelGroup direction="horizontal" className="flex-1">
        {/* Chat Panel */}
        <Panel defaultSize={30} minSize={20} maxSize={50}>
          <ChatPanel
            projectName={project.name}
            onFilesChanged={onFilesChanged}
          />
        </Panel>

        <PanelResizeHandle />

        {/* Right Side: File Tree + Editor/Preview */}
        <Panel defaultSize={70} minSize={40}>
          <PanelGroup direction="horizontal">
            {/* File Tree */}
            <Panel defaultSize={20} minSize={12} maxSize={35}>
              <FileTree
                files={files}
                activeFile={activeFile}
                onFileSelect={handleFileSelect}
              />
            </Panel>

            <PanelResizeHandle />

            {/* Editor / Preview */}
            <Panel defaultSize={80} minSize={40}>
              <div className="h-full flex flex-col bg-forge-surface">
                {/* Tab bar */}
                <div className="flex items-center border-b border-forge-border bg-forge-panel">
                  <button
                    onClick={() => setRightTab('code')}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                      rightTab === 'code'
                        ? 'text-forge-accent border-b-2 border-forge-accent bg-forge-surface'
                        : 'text-forge-text-dim hover:text-forge-text'
                    }`}
                  >
                    Code
                  </button>
                  <button
                    onClick={() => setRightTab('preview')}
                    className={`px-4 py-2 text-xs font-medium transition-colors ${
                      rightTab === 'preview'
                        ? 'text-forge-accent border-b-2 border-forge-accent bg-forge-surface'
                        : 'text-forge-text-dim hover:text-forge-text'
                    }`}
                  >
                    Preview
                  </button>

                  {/* Open file tabs */}
                  {rightTab === 'code' && openFiles.length > 0 && (
                    <div className="flex items-center ml-2 border-l border-forge-border pl-2 overflow-x-auto">
                      {openFiles.map(f => {
                        const name = f.split('/').pop() || f
                        return (
                          <div
                            key={f}
                            className={`flex items-center gap-1 px-2 py-1 text-xs rounded cursor-pointer transition-colors ${
                              activeFile === f
                                ? 'bg-forge-surface text-forge-text'
                                : 'text-forge-text-dim hover:text-forge-text'
                            }`}
                            onClick={() => onFileSelect(f)}
                          >
                            <span>{name}</span>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleCloseFile(f) }}
                              className="ml-1 hover:text-forge-danger text-[10px]"
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden">
                  {rightTab === 'code' ? (
                    <CodeEditor
                      path={activeFile}
                      content={activeFile ? fileContents[activeFile] || '' : ''}
                      onSave={handleSaveFile}
                      onChange={(content) => activeFile && onFileContentUpdate(activeFile, content)}
                    />
                  ) : (
                    <PreviewPanel
                      projectName={project.name}
                      url={previewUrl}
                      onUrlChange={setPreviewUrl}
                    />
                  )}
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
      </PanelGroup>
    </div>
  )
}
