'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ChatPanel } from './chat-panel'
import { CodeEditor } from './code-editor'
import { FileTree } from './file-tree'
import { PreviewPanel } from './preview-panel'
import { Header } from './header'
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts'
import type { FileNode } from '@/lib/types'

// Build tree structure from flat file map
function buildTreeFromMap(files: Record<string, string>): FileNode[] {
  const root: FileNode[] = []
  const paths = Object.keys(files).sort()

  for (const path of paths) {
    const parts = path.split('/')
    let current = root
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i]
      const isFile = i === parts.length - 1
      const dirPath = parts.slice(0, i + 1).join('/')

      if (isFile) {
        current.push({ name, path, type: 'file' })
      } else {
        let dir = current.find(n => n.name === name && n.type === 'directory')
        if (!dir) {
          dir = { name, path: dirPath, type: 'directory', children: [] }
          current.push(dir)
        }
        current = dir.children!
      }
    }
  }

  // Sort: directories first, then alphabetical
  function sortNodes(nodes: FileNode[]): FileNode[] {
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
      return a.name.localeCompare(b.name)
    }).map(n => n.children ? { ...n, children: sortNodes(n.children) } : n)
  }

  return sortNodes(root)
}

interface WorkspaceProps {
  projectName: string
  projectId: string | null
  files: Record<string, string>
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileChange: (path: string, content: string) => void
  onFileDelete: (path: string) => void
  onBulkFileUpdate: (files: Record<string, string>) => void
  onSwitchProject: () => void
  githubToken?: string
}

export function Workspace({
  projectName, projectId, files, activeFile,
  onFileSelect, onFileChange, onFileDelete, onBulkFileUpdate, onSwitchProject,
  githubToken,
}: WorkspaceProps) {
  const [rightTab, setRightTab] = useState<'code' | 'preview'>('code')
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [showSidebar, setShowSidebar] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showSidebar, setShowSidebar] = useState(true)

  const fileTree = useMemo(() => buildTreeFromMap(files), [files])
  const prevFileCount = useRef(0)

  // Auto-select first meaningful file when project is scaffolded
  useEffect(() => {
    const fileKeys = Object.keys(files)
    const wasEmpty = prevFileCount.current === 0
    prevFileCount.current = fileKeys.length

    if (wasEmpty && fileKeys.length > 0 && !activeFile) {
      // Pick the main app file
      const mainFile = fileKeys.find(f => f === 'app/page.tsx')
        || fileKeys.find(f => f === 'src/App.tsx')
        || fileKeys.find(f => f.endsWith('/page.tsx'))
        || fileKeys.find(f => f.endsWith('.tsx'))
        || fileKeys[0]
      if (mainFile) {
        onFileSelect(mainFile)
        setOpenFiles([mainFile])
      }
    }
  }, [files, activeFile, onFileSelect])

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

  const handleFileRename = (oldPath: string, newPath: string) => {
    // Update open files list
    setOpenFiles(prev => prev.map(f => f === oldPath ? newPath : f))
    
    // Update active file if it was the renamed one
    if (activeFile === oldPath) {
      onFileSelect(newPath)
    }
    
    // Create new file with new path and delete old one
    if (files[oldPath]) {
      onFileChange(newPath, files[oldPath])
      onFileDelete(oldPath)
    }
  }

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 's',
      ctrlKey: true,
      action: () => {
        // Save is handled automatically by the editor
        console.log('Save shortcut triggered')
      },
      description: 'Save current file'
    },
    {
      key: 'p',
      ctrlKey: true,
      shiftKey: true,
      action: () => setRightTab(prev => prev === 'code' ? 'preview' : 'code'),
      description: 'Toggle preview'
    },
    {
      key: 'b',
      ctrlKey: true,
      action: () => setShowSidebar(prev => !prev),
      description: 'Toggle sidebar'
    },
    {
      key: 'w',
      ctrlKey: true,
      action: () => {
        if (activeFile) {
          handleCloseFile(activeFile)
        }
      },
      description: 'Close current file'
    },
  ])

  return (
    <div className="h-screen flex flex-col bg-forge-bg">
      <Header projectName={projectName} onSwitchProject={onSwitchProject} fileCount={Object.keys(files).length} />

      <PanelGroup direction="horizontal" className="flex-1">
        {/* Chat Panel */}
        <Panel defaultSize={30} minSize={20} maxSize={50}>
          <ChatPanel
            projectName={projectName}
            projectId={projectId}
            files={files}
            onFileChange={onFileChange}
            onFileDelete={onFileDelete}
            onBulkFileUpdate={onBulkFileUpdate}
            githubToken={githubToken}
          />
        </Panel>

        <PanelResizeHandle />

        {/* Right Side: File Tree + Editor/Preview */}
        <Panel defaultSize={70} minSize={40}>
          <PanelGroup direction="horizontal">
            {/* File Tree */}
            {showSidebar && (
              <>
                <Panel defaultSize={20} minSize={12} maxSize={35}>
                  <FileTree
                    files={fileTree}
                    activeFile={activeFile}
                    onFileSelect={handleFileSelect}
                    onFileDelete={onFileDelete}
                    onFileRename={handleFileRename}
                  />
                </Panel>
                <PanelResizeHandle />
              </>
            )}

            {/* Editor / Preview */}
            <Panel defaultSize={showSidebar ? 80 : 100} minSize={40}>
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

                <div className="flex-1 overflow-hidden">
                  {rightTab === 'code' ? (
                    <CodeEditor
                      path={activeFile}
                      content={activeFile ? files[activeFile] || '' : ''}
                      onSave={(path, content) => onFileChange(path, content)}
                      onChange={(content) => activeFile && onFileChange(activeFile, content)}
                    />
                  ) : (
                    <PreviewPanel files={files} />
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
