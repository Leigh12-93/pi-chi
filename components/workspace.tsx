'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ChatPanel } from './chat-panel'
import { CodeEditor } from './code-editor'
import { FileTree } from './file-tree'
import { PreviewPanel } from './preview-panel'
import { Header } from './header'
import { ActionDialog, TaskPollingDialog } from './action-dialog'
import { CommandPalette } from './command-palette'
import { StatusBar } from './status-bar'
import { KeyboardShortcutsOverlay } from './keyboard-shortcuts-overlay'
import { ProjectSettingsDialog } from './project-settings-dialog'
import { FileSearch } from './file-search'
import { ConsolePanel, type ConsoleEntry } from './console-panel'
import { OnboardingTour } from './onboarding-tour'
import { VersionHistory, type Snapshot } from './version-history'
import { DiffViewer } from './diff-viewer'
import { NotificationCenter, type Notification } from './notification-center'
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts'
import { MessageSquare, FolderTree, Code2, Eye, Loader2, Save, Rocket, Upload, GitBranch, Download, SidebarOpen, FolderInput, Keyboard, Settings2, Search, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
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
type DialogType = 'deploy' | 'push' | 'create-repo' | 'import' | null

export function Workspace({
  projectName, projectId, files, activeFile,
  onFileSelect, onFileChange, onFileDelete, onBulkFileUpdate, onSwitchProject,
  githubToken,
}: WorkspaceProps) {
  const [rightTab, setRightTab] = useState<'code' | 'preview' | 'split'>('code')
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [showSidebar, setShowSidebar] = useState(true)
  const [activeDialog, setActiveDialog] = useState<DialogType>(null)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showFileSearch, setShowFileSearch] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [diffState, setDiffState] = useState<{ open: boolean; path: string; oldContent: string; newContent: string } | null>(null)
  const dragCounterRef = useRef(0)
  const chatSendRef = useRef<((message: string) => void) | null>(null)

  // Only recompute tree when file PATHS change, not on content edits
  const filePathsKey = useMemo(() => Object.keys(files).sort().join('\0'), [files])
  const fileTree = useMemo(() => buildTreeFromMap(files), [filePathsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const prevFileKeysRef = useRef<Set<string>>(new Set())
  const pendingNewFilesRef = useRef<string[]>([])
  const pendingDeletedFilesRef = useRef<string[]>([])
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track file changes — auto-select first file, batch toast notifications
  useEffect(() => {
    const fileKeys = Object.keys(files)
    const currentSet = new Set(fileKeys)
    const prevSet = prevFileKeysRef.current
    const wasEmpty = prevSet.size === 0

    const newFiles = fileKeys.filter(f => !prevSet.has(f))
    const deletedFiles = [...prevSet].filter(f => !currentSet.has(f))

    prevFileKeysRef.current = currentSet

    // Auto-select first meaningful file when project is first scaffolded (immediate)
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

    // Batch toast notifications — accumulate during rapid AI writes, fire once after 2s of stability
    if (!wasEmpty && (newFiles.length > 0 || deletedFiles.length > 0)) {
      pendingNewFilesRef.current.push(...newFiles)
      pendingDeletedFilesRef.current.push(...deletedFiles)

      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
      toastTimerRef.current = setTimeout(() => {
        const created = [...new Set(pendingNewFilesRef.current)]
        const deleted = [...new Set(pendingDeletedFilesRef.current)]
        pendingNewFilesRef.current = []
        pendingDeletedFilesRef.current = []

        if (created.length > 0 && created.length <= 5) {
          toast.success(`${created.length} file${created.length > 1 ? 's' : ''} created`, {
            description: created.map(f => f.split('/').pop()).join(', '),
            duration: 2500,
          })
        } else if (created.length > 5) {
          toast.success(`${created.length} files created`, { duration: 2500 })
        }

        if (deleted.length > 0 && deleted.length <= 3) {
          toast(`${deleted.length} file${deleted.length > 1 ? 's' : ''} deleted`, {
            description: deleted.map(f => f.split('/').pop()).join(', '),
            duration: 2500,
          })
        }
      }, 2000)
    }

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [files, activeFile, onFileSelect])

  const handleFileSelect = (path: string) => {
    onFileSelect(path)
    if (!openFiles.includes(path)) {
      setOpenFiles(prev => [...prev, path])
    }
    setMobileTab('code')
  }

  const handleFileCreate = (path: string) => {
    onFileChange(path, '')
    handleFileSelect(path)
  }

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current++
    if (e.dataTransfer.types.includes('Files')) setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    dragCounterRef.current--
    if (dragCounterRef.current === 0) setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    dragCounterRef.current = 0

    const items = e.dataTransfer.files
    if (!items.length) return

    const binaryExts = new Set(['png','jpg','jpeg','gif','ico','webp','avif','bmp','svg','woff','woff2','ttf','eot','otf','mp3','mp4','wav','ogg','webm','zip','tar','gz','rar','7z','pdf','exe','dll','so','dylib','bin','dat','db','sqlite'])
    let count = 0
    let skipped = 0
    for (let i = 0; i < items.length; i++) {
      const file = items[i]
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      if (binaryExts.has(ext)) {
        skipped++
        continue
      }
      if (file.size > 500_000) {
        toast.error(`Skipped ${file.name}`, { description: 'File too large (max 500KB)' })
        continue
      }
      try {
        const text = await file.text()
        // Check for binary content (null bytes indicate non-text)
        if (text.includes('\0')) {
          skipped++
          continue
        }
        onFileChange(file.name, text)
        count++
      } catch {
        toast.error(`Failed to read ${file.name}`)
      }
    }
    if (skipped > 0) {
      toast.info(`Skipped ${skipped} binary file${skipped > 1 ? 's' : ''}`, { duration: 2000 })
    }
    if (count > 0) {
      toast.success(`${count} file${count > 1 ? 's' : ''} imported`, { duration: 2500 })
      if (count === 1) handleFileSelect(items[0].name)
    }
  }, [onFileChange, handleFileSelect])

  const handleRegisterSend = useCallback((sendFn: (message: string) => void) => {
    chatSendRef.current = sendFn
  }, [])

  const handleDownload = useCallback(async () => {
    const fileEntries = Object.entries(files)
    if (fileEntries.length === 0) {
      toast.error('No files to download')
      return
    }

    try {
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
      toast.success('Download started', { description: `${fileEntries.length} files in ${projectName}.zip` })
    } catch {
      toast.error('Download failed')
    }
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
      if (res.ok) {
        setSaveStatus('saved')
        // Create a snapshot for version history
        setSnapshots(prev => [{
          id: `snap-${Date.now()}`,
          label: `Save ${prev.length + 1}`,
          timestamp: Date.now(),
          files: { ...files },
        }, ...prev].slice(0, 50))
        toast.success('Project saved', { description: `${Object.keys(files).length} files saved` })
      } else {
        setSaveStatus('error')
        toast.error('Save failed', { description: 'Could not save to database' })
      }
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
      toast.error('Save failed', { description: 'Network error' })
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
      case 'share':
        if (projectId) {
          const url = `${window.location.origin}?project=${projectId}`
          navigator.clipboard.writeText(url)
          toast.success('Share link copied', { description: url })
        } else {
          toast.error('Save the project first to get a share link')
        }
        break
      case 'deploy':
      case 'push':
      case 'create-repo':
      case 'import':
        setActiveDialog(action as DialogType)
        break
    }
  }, [handleDownload, handleSave])

  const handleDialogSuccess = useCallback((result: Record<string, unknown>) => {
    if (result.url) {
      toast.success('Deployed successfully', {
        description: String(result.url),
        action: { label: 'Open', onClick: () => window.open(String(result.url), '_blank') },
      })
      setPendingChatMessage(`[System] Operation completed successfully. URL: ${result.url}`)
    } else if (result.commitSha) {
      toast.success('Pushed to GitHub', { description: `Commit: ${String(result.commitSha).slice(0, 7)}` })
      setPendingChatMessage(`[System] Pushed to GitHub. Commit: ${String(result.commitSha).slice(0, 7)}`)
    }
  }, [])

  const handleDialogFix = useCallback((errorMessage: string) => {
    setPendingChatMessage(`The deploy failed with these build errors. Please fix them:\n\n\`\`\`\n${errorMessage}\n\`\`\``)
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
    { key: 'k', ctrlKey: true, action: () => setShowCommandPalette(prev => !prev), description: 'Command palette' },
    { key: 'p', ctrlKey: true, shiftKey: true, action: () => setRightTab(prev => prev === 'code' ? 'split' : prev === 'split' ? 'preview' : 'code'), description: 'Cycle view mode' },
    { key: 'b', ctrlKey: true, action: () => setShowSidebar(prev => !prev), description: 'Toggle sidebar' },
    { key: 'w', ctrlKey: true, action: () => { if (activeFile) handleCloseFile(activeFile) }, description: 'Close current file' },
    { key: '/', ctrlKey: true, action: () => setShowShortcuts(prev => !prev), description: 'Keyboard shortcuts' },
    { key: 'f', ctrlKey: true, action: () => setShowFileSearch(prev => !prev), description: 'Search in files' },
  ])

  const paletteCommands = useMemo(() => [
    { id: 'save', label: 'Save Project', description: 'Save all files to database', shortcut: 'Ctrl+S', icon: Save, category: 'actions' as const, action: handleSave },
    { id: 'deploy', label: 'Deploy to Vercel', description: 'Create production deployment', icon: Rocket, category: 'actions' as const, action: () => setActiveDialog('deploy') },
    { id: 'push', label: 'Push to GitHub', description: 'Push files to a repository', icon: Upload, category: 'actions' as const, action: () => setActiveDialog('push') },
    { id: 'create-repo', label: 'Create GitHub Repo', description: 'Create a new repository', icon: GitBranch, category: 'actions' as const, action: () => setActiveDialog('create-repo') },
    { id: 'import', label: 'Import from GitHub', description: 'Import files from a GitHub repository', icon: FolderInput, category: 'actions' as const, action: () => setActiveDialog('import') },
    { id: 'download', label: 'Download as ZIP', description: 'Download all project files', icon: Download, category: 'actions' as const, action: handleDownload },
    { id: 'toggle-preview', label: 'Toggle Preview', description: 'Switch between code and preview', shortcut: 'Ctrl+Shift+P', icon: Eye, category: 'view' as const, action: () => setRightTab(prev => prev === 'code' ? 'preview' : 'code') },
    { id: 'toggle-sidebar', label: 'Toggle File Sidebar', description: 'Show or hide the file tree', shortcut: 'Ctrl+B', icon: SidebarOpen, category: 'view' as const, action: () => setShowSidebar(prev => !prev) },
    { id: 'close-file', label: 'Close Current File', shortcut: 'Ctrl+W', icon: Code2, category: 'view' as const, action: () => { if (activeFile) handleCloseFile(activeFile) } },
    { id: 'switch-project', label: 'Switch Project', description: 'Go back to project picker', icon: FolderTree, category: 'navigation' as const, action: onSwitchProject },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', description: 'View all keyboard shortcuts', shortcut: 'Ctrl+/', icon: Keyboard, category: 'view' as const, action: () => setShowShortcuts(true) },
    { id: 'settings', label: 'Project Settings', description: 'Edit project name and settings', icon: Settings2, category: 'actions' as const, action: () => setShowSettings(true) },
    { id: 'search-files', label: 'Search in Files', description: 'Search text across all project files', shortcut: 'Ctrl+F', icon: Search, category: 'navigation' as const, action: () => setShowFileSearch(true) },
    { id: 'split-view', label: 'Split View', description: 'Show code and preview side by side', icon: Code2, category: 'view' as const, action: () => setRightTab('split') },
    { id: 'version-history', label: 'Version History', description: 'View and restore previous snapshots', icon: History, category: 'navigation' as const, action: () => setShowVersionHistory(true) },
  ], [handleSave, handleDownload, activeFile, onSwitchProject]) // eslint-disable-line react-hooks/exhaustive-deps

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
      pendingMessage={pendingChatMessage}
      onPendingMessageSent={() => setPendingChatMessage(null)}
    />
  )

  const fileTreePanel = (
    <FileTree
      files={fileTree}
      activeFile={activeFile}
      onFileSelect={handleFileSelect}
      onFileDelete={onFileDelete}
      onFileRename={handleFileRename}
      onFileCreate={handleFileCreate}
      fileContents={files}
    />
  )

  const fileTabBar = (openFilesList: string[]) => (
    <div className="flex items-center overflow-x-auto gap-0.5 -webkit-overflow-scrolling-touch">
      {openFilesList.map(f => {
        const name = f.split('/').pop() || f
        const isActive = activeFile === f
        return (
          <div
            key={f}
            className={cn(
              'group flex items-center gap-1 px-3 sm:px-2.5 py-2 sm:py-1.5 text-xs rounded-md cursor-pointer transition-all whitespace-nowrap border',
              isActive
                ? 'bg-forge-surface text-forge-text border-forge-border shadow-sm'
                : 'text-forge-text-dim hover:text-forge-text border-transparent hover:bg-forge-surface/50',
            )}
            onClick={() => onFileSelect(f)}
          >
            <span>{name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleCloseFile(f) }}
              className="ml-1 p-1 sm:ml-0.5 sm:p-0 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 hover:text-forge-danger text-xs sm:text-[10px] transition-opacity"
              aria-label={`Close ${name}`}
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
          onClick={() => setRightTab('split')}
          className={`px-4 py-2 text-xs font-medium transition-colors ${
            rightTab === 'split' ? 'text-forge-accent border-b-2 border-forge-accent bg-forge-surface' : 'text-forge-text-dim hover:text-forge-text'
          }`}
        >
          Split
        </button>
        <button
          onClick={() => setRightTab('preview')}
          className={`px-4 py-2 text-xs font-medium transition-colors ${
            rightTab === 'preview' ? 'text-forge-accent border-b-2 border-forge-accent bg-forge-surface' : 'text-forge-text-dim hover:text-forge-text'
          }`}
        >
          Preview
        </button>
        {(rightTab === 'code' || rightTab === 'split') && openFiles.length > 0 && (
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
        ) : rightTab === 'split' ? (
          <PanelGroup direction="horizontal">
            <Panel defaultSize={50} minSize={30}>
              <CodeEditor
                path={activeFile}
                content={activeFile ? files[activeFile] || '' : ''}
                onSave={(path, content) => onFileChange(path, content)}
                onChange={(content) => activeFile && onFileChange(activeFile, content)}
              />
            </Panel>
            <PanelResizeHandle />
            <Panel defaultSize={50} minSize={30}>
              <PreviewPanel files={files} projectId={projectId} onFixErrors={(msg) => setPendingChatMessage(msg)} />
            </Panel>
          </PanelGroup>
        ) : (
          <PreviewPanel files={files} projectId={projectId} onFixErrors={(msg) => setPendingChatMessage(msg)} />
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
    <div
      className="h-screen flex flex-col bg-forge-bg relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-[90] bg-forge-accent/10 border-2 border-dashed border-forge-accent rounded-lg flex items-center justify-center backdrop-blur-sm animate-fade-in pointer-events-none">
          <div className="text-center">
            <Upload className="w-10 h-10 text-forge-accent mx-auto mb-2" />
            <p className="text-sm font-medium text-forge-accent">Drop files to import</p>
            <p className="text-xs text-forge-text-dim mt-1">Text files up to 500KB</p>
          </div>
        </div>
      )}
      <Header
        projectName={projectName}
        onSwitchProject={onSwitchProject}
        fileCount={Object.keys(files).length}
        onAction={handleAction}
        saveStatus={saveStatus}
        onOpenCommandPalette={() => setShowCommandPalette(true)}
        notificationSlot={
          <NotificationCenter
            notifications={notifications}
            onMarkAllRead={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
            onDismiss={(id) => setNotifications(prev => prev.filter(n => n.id !== id))}
          />
        }
      />

      {/* Desktop layout */}
      <div className="flex-1 hidden md:flex flex-col overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={30} minSize={20} maxSize={50}>
            {chatPanel}
          </Panel>
          <PanelResizeHandle />
          <Panel defaultSize={70} minSize={40}>
            <div className="h-full flex flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
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
              </div>
              <ConsolePanel
                entries={consoleEntries}
                onClear={() => setConsoleEntries([])}
                open={consoleOpen}
                onToggle={() => setConsoleOpen(prev => !prev)}
              />
              <StatusBar
                activeFile={activeFile}
                fileCount={Object.keys(files).length}
                framework={files['package.json'] ? 'Next.js' : files['index.html'] ? 'Static' : undefined}
                saveStatus={saveStatus}
              />
            </div>
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
          {mobileTab === 'preview' && <PreviewPanel files={files} projectId={projectId} onFixErrors={(msg) => { setPendingChatMessage(msg); setMobileTab('chat') }} />}
        </div>

        <div className="flex items-center justify-around border-t border-forge-border bg-forge-panel py-1.5 shrink-0 safe-bottom">
          {MOBILE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={cn(
                'flex flex-col items-center gap-0.5 px-4 py-2 rounded-xl transition-all min-w-[64px] min-h-[48px] focus:outline-none focus-visible:ring-2 focus-visible:ring-forge-accent/50 active:scale-95',
                mobileTab === tab.id
                  ? 'text-forge-accent bg-forge-accent/10 shadow-sm'
                  : 'text-forge-text-dim active:bg-forge-surface',
              )}
            >
              <tab.Icon className={cn('w-5 h-5', mobileTab === tab.id && 'scale-110')} />
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

      {/* Import from GitHub Dialog */}
      <ActionDialog
        open={activeDialog === 'import'}
        onClose={() => setActiveDialog(null)}
        title="Import from GitHub"
        description={`Import files from a GitHub repository into "${projectName}". Existing files with the same path will be overwritten.`}
        confirmLabel="Import"
        fields={[
          { name: 'owner', label: 'Owner', placeholder: 'username or org', required: true },
          { name: 'repo', label: 'Repository', placeholder: 'my-project', required: true },
          { name: 'branch', label: 'Branch', placeholder: 'main (auto-detected if empty)' },
        ]}
        onConfirm={async (fieldValues) => {
          const res = await fetch('/api/github/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              owner: fieldValues.owner,
              repo: fieldValues.repo,
              branch: fieldValues.branch || undefined,
            }),
          })
          if (!res.ok) {
            const data = await res.json()
            throw new Error(data.error || `Import failed (HTTP ${res.status})`)
          }
          const data = await res.json()
          if (data.files && Object.keys(data.files).length > 0) {
            onBulkFileUpdate({ ...files, ...data.files })
            const skippedCount = data.skipped?.length || 0
            toast.success(`Imported ${data.fileCount} files${skippedCount ? ` (${skippedCount} skipped)` : ''}`, {
              description: `From ${fieldValues.owner}/${fieldValues.repo}${data.branch ? ` (${data.branch})` : ''}`,
              duration: skippedCount ? 5000 : 3000,
            })
            if (skippedCount > 0) {
              console.warn('Skipped files during import:', data.skipped)
            }
          } else {
            throw new Error('No importable files found in repository')
          }
        }}
      />

      {/* Command Palette */}
      <CommandPalette
        open={showCommandPalette}
        onClose={() => setShowCommandPalette(false)}
        commands={paletteCommands}
      />

      {/* Keyboard Shortcuts Overlay */}
      <KeyboardShortcutsOverlay
        open={showShortcuts}
        onClose={() => setShowShortcuts(false)}
      />

      {/* File Search */}
      <FileSearch
        files={files}
        onResultClick={handleFileSelect}
        open={showFileSearch}
        onClose={() => setShowFileSearch(false)}
      />

      {/* Project Settings */}
      <ProjectSettingsDialog
        open={showSettings}
        onClose={() => setShowSettings(false)}
        projectName={projectName}
        projectId={projectId}
        framework={files['package.json'] ? 'Next.js' : files['index.html'] ? 'Static' : undefined}
        onUpdateSettings={() => {}}
      />

      {/* Version History */}
      <VersionHistory
        open={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        snapshots={snapshots}
        currentFiles={files}
        onRestore={(snapshot) => {
          onBulkFileUpdate(snapshot.files)
          toast.success('Snapshot restored', { description: snapshot.label })
        }}
        onViewDiff={(snapshotId, path) => {
          const snapshot = snapshots.find(s => s.id === snapshotId)
          if (snapshot) {
            setDiffState({
              open: true,
              path,
              oldContent: snapshot.files[path] || '',
              newContent: files[path] || '',
            })
          }
        }}
      />

      {/* Diff Viewer */}
      {diffState && (
        <DiffViewer
          open={diffState.open}
          onClose={() => setDiffState(null)}
          path={diffState.path}
          oldContent={diffState.oldContent}
          newContent={diffState.newContent}
          oldLabel="Snapshot"
          newLabel="Current"
        />
      )}

      {/* Onboarding Tour */}
      <OnboardingTour />
    </div>
  )
}
