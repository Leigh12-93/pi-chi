'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ChatPanel } from './chat-panel'
import { CodeEditor } from './code-editor'
import { FileTree } from './file-tree'
import { PreviewPanel } from './preview-panel'
import { Header } from './header'
import { TaskPollingDialog } from './action-dialog'
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts'
import { MessageSquare, FolderTree, Code2, Eye, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
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

type MobileTab = 'chat' | 'files' | 'code' | 'preview'
type DialogType = 'deploy' | 'push' | 'create-repo' | null

export function Workspace({
  projectName, projectId, files, activeFile,
  onFileSelect, onFileChange, onFileDelete, onBulkFileUpdate, onSwitchProject,
  githubToken,
}: WorkspaceProps) {
  const [rightTab, setRightTab] = useState<'code' | 'preview'>('code')
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [showSidebar, setShowSidebar] = useState(true)
  const [activeDialog, setActiveDialog] = useState<DialogType>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const chatSendRef = useRef<((message: string) => void) | null>(null)

  const fileTree = useMemo(() => buildTreeFromMap(files), [files])
  const prevFileCount = useRef(0)

  // Auto-select first meaningful file when project is scaffolded
  useEffect(() => {
    const fileKeys = Object.keys(files)
    const wasEmpty = prevFileCount.current === 0
    prevFileCount.current = fileKeys.length

    if (wasEmpty && fileKeys.length > 0 && !activeFile) {
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
    setMobileTab('code')
  }

  const handleRegisterSend = useCallback((sendFn: (message: string) => void) => {
    chatSendRef.current = sendFn
  }, [])

  const handleDownload = useCallback(async () => {
    const fileEntries = Object.entries(files)
    if (fileEntries.length === 0) return

    const JSZip = (await import('jszip')).default
    const zip = new JSZip()

    for (const [path, content] of fileEntries) {
      zip.file(path, content)
    }

    const blob = await zip.generateAsync({ type: 'blob' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName || 'project'}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [files, projectName])

  const handleSave = useCallback(async () => {
    if (!projectId || Object.keys(files).length === 0) return
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      })
      setSaveStatus(res.ok ? 'saved' : 'error')
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }, [projectId, files])

  const handleAction = useCallback((action: string) => {
    switch (action) {
      case 'download':
        handleDownload()
        break
      case 'save':
        handleSave()
        break
      case 'deploy':
      case 'push':
      case 'create-repo':
        setActiveDialog(action as DialogType)
        break
    }
  }, [handleDownload, handleSave])

  const handleDialogSuccess = useCallback((result: Record<string, unknown>) => {
    // Notify the chat for history
    if (chatSendRef.current) {
      if (result.url) {
        chatSendRef.current(`[System] Operation completed successfully. URL: ${result.url}`)
      } else if (result.commitSha) {
        chatSendRef.current(`[System] Pushed to GitHub. Commit: ${String(result.commitSha).slice(0, 7)}`)
      }
    }
  }, [])

  const handleDialogFix = useCallback((errorMessage: string) => {
    if (chatSendRef.current) {
      chatSendRef.current(`The deploy failed with these build errors. Please fix them:\n\n\`\`\`\n${errorMessage}\n\`\`\``)
    }
    setMobileTab('chat')
  }, [])

  const handleCloseFile = (path: string) => {
    setOpenFiles(prev => prev.filter(f => f !== path))
    if (activeFile === path) {
      const remaining = openFiles.filter(f => f !== path)
      onFileSelect(remaining[remaining.length - 1] || '')
    }
  }

  const handleFileRename = (oldPath: string, newPath: string) => {
    setOpenFiles(prev => prev.map(f => f === oldPath ? newPath : f))
    if (activeFile === oldPath) onFileSelect(newPath)
    if (files[oldPath]) {
      onFileChange(newPath, files[oldPath])
      onFileDelete(oldPath)
    }
  }

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: 'p', ctrlKey: true, shiftKey: true, action: () => setRightTab(prev => prev === 'code' ? 'preview' : 'code'), description: 'Toggle preview' },
    { key: 'b', ctrlKey: true, action: () => setShowSidebar(prev => !prev), description: 'Toggle sidebar' },
    { key: 'w', ctrlKey: true, action: () => { if (activeFile) handleCloseFile(activeFile) }, description: 'Close current file' },
  ])

  const chatPanel = (
    <ChatPanel
      projectName={projectName}
      projectId={projectId}
      files={files}
      onFileChange={onFileChange}
      onFileDelete={onFileDelete}
      onBulkFileUpdate={onBulkFileUpdate}
      githubToken={githubToken}
      onRegisterSend={handleRegisterSend}
    />
  )

  const fileTreePanel = (
    <FileTree
      files={fileTree}
      activeFile={activeFile}
      onFileSelect={handleFileSelect}
      onFileDelete={onFileDelete}
      onFileRename={handleFileRename}
    />
  )

  const fileTabBar = (openFilesList: string[]) => (
    <div className="flex items-center overflow-x-auto">
      {openFilesList.map(f => {
        const name = f.split('/').pop() || f
        return (
          <div
            key={f}
            className={`flex items-center gap-1 px-2 py-1 text-xs rounded cursor-pointer transition-colors whitespace-nowrap ${
              activeFile === f ? 'bg-forge-surface text-forge-text' : 'text-forge-text-dim hover:text-forge-text'
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
  )

  const editorPanel = (
    <div className="h-full flex flex-col bg-forge-surface">
      <div className="flex items-center border-b border-forge-border bg-forge-panel">
        <button
          onClick={() => setRightTab('code')}
          className={`px-4 py-2 text-xs font-medium transition-colors ${
            rightTab === 'code' ? 'text-forge-accent border-b-2 border-forge-accent bg-forge-surface' : 'text-forge-text-dim hover:text-forge-text'
          }`}
        >
          Code
        </button>
        <button
          onClick={() => setRightTab('preview')}
          className={`px-4 py-2 text-xs font-medium transition-colors ${
            rightTab === 'preview' ? 'text-forge-accent border-b-2 border-forge-accent bg-forge-surface' : 'text-forge-text-dim hover:text-forge-text'
          }`}
        >
          Preview
        </button>
        {rightTab === 'code' && openFiles.length > 0 && (
          <div className="ml-2 border-l border-forge-border pl-2">
            {fileTabBar(openFiles)}
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
          <PreviewPanel files={files} projectId={projectId} />
        )}
      </div>
    </div>
  )

  const MOBILE_TABS = [
    { id: 'chat' as MobileTab, label: 'Chat', Icon: MessageSquare },
    { id: 'files' as MobileTab, label: 'Files', Icon: FolderTree },
    { id: 'code' as MobileTab, label: 'Code', Icon: Code2 },
    { id: 'preview' as MobileTab, label: 'Preview', Icon: Eye },
  ]

  return (
    <div className="h-screen flex flex-col bg-forge-bg">
      <Header
        projectName={projectName}
        onSwitchProject={onSwitchProject}
        fileCount={Object.keys(files).length}
        onAction={handleAction}
        saveStatus={saveStatus}
      />

      {/* Desktop layout */}
      <div className="flex-1 hidden md:flex overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={30} minSize={20} maxSize={50}>
            {chatPanel}
          </Panel>
          <PanelResizeHandle />
          <Panel defaultSize={70} minSize={40}>
            <PanelGroup direction="horizontal">
              {showSidebar && (
                <>
                  <Panel defaultSize={20} minSize={12} maxSize={35}>
                    {fileTreePanel}
                  </Panel>
                  <PanelResizeHandle />
                </>
              )}
              <Panel defaultSize={showSidebar ? 80 : 100} minSize={40}>
                {editorPanel}
              </Panel>
            </PanelGroup>
          </Panel>
        </PanelGroup>
      </div>

      {/* Mobile layout */}
      <div className="flex-1 flex flex-col md:hidden overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {mobileTab === 'chat' && chatPanel}
          {mobileTab === 'files' && fileTreePanel}
          {mobileTab === 'code' && (
            <div className="h-full flex flex-col bg-forge-surface">
              {openFiles.length > 0 && (
                <div className="border-b border-forge-border bg-forge-panel px-2 shrink-0">
                  {fileTabBar(openFiles)}
                </div>
              )}
              <div className="flex-1 overflow-hidden">
                <CodeEditor
                  path={activeFile}
                  content={activeFile ? files[activeFile] || '' : ''}
                  onSave={(path, content) => onFileChange(path, content)}
                  onChange={(content) => activeFile && onFileChange(activeFile, content)}
                />
              </div>
            </div>
          )}
          {mobileTab === 'preview' && <PreviewPanel files={files} projectId={projectId} />}
        </div>

        <div className="flex items-center justify-around border-t border-forge-border bg-forge-panel py-1.5 shrink-0 safe-bottom">
          {MOBILE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors min-w-[60px]',
                mobileTab === tab.id ? 'text-forge-accent bg-forge-accent/10' : 'text-forge-text-dim'
              )}
            >
              <tab.Icon className="w-4 h-4" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Deploy Dialog */}
      <TaskPollingDialog
        open={activeDialog === 'deploy'}
        onClose={() => setActiveDialog(null)}
        title="Deploy to Vercel"
        description={`Deploy "${projectName}" to Vercel. This will create a production deployment with all ${Object.keys(files).length} files.`}
        confirmLabel="Deploy"
        taskType="deploy"
        projectId={projectId}
        buildParams={() => ({
          projectName,
          files,
        })}
        onSuccess={handleDialogSuccess}
        onFix={handleDialogFix}
      />

      {/* Create Repo Dialog */}
      <TaskPollingDialog
        open={activeDialog === 'create-repo'}
        onClose={() => setActiveDialog(null)}
        title="Create GitHub Repository"
        description="Create a new GitHub repository and push all project files."
        confirmLabel="Create & Push"
        taskType="github_create"
        projectId={projectId}
        fields={[
          { name: 'repoName', label: 'Repository Name', placeholder: projectName.replace(/\s+/g, '-').toLowerCase(), required: true, defaultValue: projectName.replace(/\s+/g, '-').toLowerCase() },
          { name: 'description', label: 'Description', placeholder: 'Built with Forge' },
        ]}
        buildParams={(fieldValues) => ({
          repoName: fieldValues.repoName,
          description: fieldValues.description || 'Built with Forge',
          isPublic: false,
          files,
          githubToken,
        })}
        onSuccess={handleDialogSuccess}
        onFix={handleDialogFix}
      />

      {/* Push to GitHub Dialog */}
      <TaskPollingDialog
        open={activeDialog === 'push'}
        onClose={() => setActiveDialog(null)}
        title="Push to GitHub"
        description={`Push all ${Object.keys(files).length} files to an existing GitHub repository.`}
        confirmLabel="Push"
        taskType="github_push"
        projectId={projectId}
        fields={[
          { name: 'owner', label: 'Owner', placeholder: 'your-username', required: true },
          { name: 'repo', label: 'Repository', placeholder: 'my-project', required: true },
          { name: 'message', label: 'Commit Message', placeholder: 'Update from Forge', defaultValue: 'Update from Forge' },
        ]}
        buildParams={(fieldValues) => ({
          owner: fieldValues.owner,
          repo: fieldValues.repo,
          message: fieldValues.message || 'Update from Forge',
          files,
          githubToken,
        })}
        onSuccess={handleDialogSuccess}
        onFix={handleDialogFix}
      />
    </div>
  )
}
