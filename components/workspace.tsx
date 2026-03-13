'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ChatPanel } from './chat-panel'
import { CodeEditor } from './code-editor'
import { EditorTabs } from './editor-tabs'
import { FileTree } from './file-tree'
import { ActivityBar, SidebarContent, TABS as SIDEBAR_TABS } from './sidebar'
import { PreviewPanel } from './preview-panel'
import { TerminalPanel } from './terminal-panel'
import { Header } from './header'
import { ActionDialog, TaskPollingDialog } from './action-dialog'
import { DeployPanel } from './deploy-panel'
import { CommandPalette } from './command-palette'
import { StatusBar } from './status-bar'
import { KeyboardShortcutsOverlay } from './keyboard-shortcuts-overlay'
import { ProjectSettingsDialog } from './project-settings-dialog'
import { FileSearch } from './file-search'
import { ConsolePanel } from './console-panel'
import { OnboardingTour } from './onboarding-tour'
import { VersionHistory } from './version-history'
import { DiffViewer } from './diff-viewer'
import { NotificationCenter } from './notification-center'
import { FindReplacePanel } from './find-replace-panel'
import { PanelErrorBoundary } from './error-boundary'
import { SettingsDialog } from './settings-dialog'
import { AuditPanel } from './audit-panel'
import { DbExplorer } from './db-explorer'
import { ComponentLibrary } from './component-library'
import { MCPManager } from './mcp-manager'
import { PWAInstallPrompt } from './pwa-install-prompt'
import { OfflineIndicator } from './offline-indicator'
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts'
import { useSwipe } from '@/hooks/use-swipe'
import { useWebcontainer } from '@/hooks/use-webcontainer'
import { useWorkspaceState, type MobileTab } from '@/hooks/use-workspace-state'
import { useWorkspaceActions } from '@/hooks/use-workspace-actions'
import { useWorkspaceEffects } from '@/hooks/use-workspace-effects'
import { detectFramework } from '@/lib/vercel'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, FolderTree, Code2, Eye, Save, Rocket, Upload, GitBranch, Download, ChevronDown,
  SidebarOpen, FolderInput, Keyboard, Settings2, Search, History, Terminal, Plug, Pin, PinOff, Menu,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface WorkspaceProps {
  projectName: string
  projectId: string | null
  files: Record<string, string>
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileChange: (path: string, content: string) => void
  onFileDelete: (path: string) => void
  onBulkFileUpdate: (files: Record<string, string>, opts?: { replace?: boolean }) => void
  onSwitchProject: () => void
  githubToken?: string
  autoSaveError?: boolean
  saveStatus?: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  onManualSave?: () => Promise<void>
  onUpdateSettings?: (settings: { name?: string; description?: string }) => void
  initialPendingMessage?: string | null
  onInitialPendingMessageSent?: () => void
  githubRepoUrl?: string | null
  onGithubRepoUrlChange?: (url: string | null) => void
  githubUsername?: string
  vercelUrl?: string | null
  onVercelUrlChange?: (url: string | null) => void
  currentBranch?: string
  onBranchChange?: (branch: string) => void
}

export function Workspace(props: WorkspaceProps) {
  const {
    projectName, projectId, files, activeFile,
    onFileSelect, onFileChange, onFileDelete, onBulkFileUpdate, onSwitchProject,
    githubToken, autoSaveError, saveStatus: parentSaveStatus, onManualSave, onUpdateSettings,
    initialPendingMessage, onInitialPendingMessageSent, githubRepoUrl,
    onGithubRepoUrlChange, githubUsername,
    vercelUrl, onVercelUrlChange, currentBranch, onBranchChange,
  } = props

  const state = useWorkspaceState(files, projectId)
  const saveStatus = (parentSaveStatus && parentSaveStatus !== 'idle') ? parentSaveStatus : state.localSaveStatus

  const actions = useWorkspaceActions({
    state, files, projectId, projectName, activeFile,
    onFileSelect, onFileChange, onFileDelete, onBulkFileUpdate, onManualSave, githubToken,
    githubRepoUrl: githubRepoUrl || null, onGithubRepoUrlChange, onVercelUrlChange,
  })

  const [sessionCost, setSessionCost] = useState<{ cost: number; inputTokens: number; outputTokens: number }>({ cost: 0, inputTokens: 0, outputTokens: 0 })
  const handleSessionCostChange = useCallback((cost: { cost: number; inputTokens: number; outputTokens: number }) => {
    setSessionCost(cost)
  }, [])

  const wc = useWebcontainer({
    files,
    enabled: state.hasPackageJson && Object.keys(files).length > 0,
    onTerminalOutput: (data) => {
      // Strip ANSI escape codes and filter noise
      const clean = data
        .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')  // ANSI sequences
        .replace(/\x1b\[\?[0-9]*[a-z]/g, '')     // Private mode sequences
        .replace(/\r/g, '')                        // Carriage returns
        .trim()
      // Skip empty lines, lone spinner chars, cursor movements
      if (!clean || /^[|/\\-]$/.test(clean)) return
      const type = /error|ERR!|ENOENT|EACCES|failed/i.test(clean) ? 'error' as const
        : /warn|WARN/i.test(clean) ? 'warn' as const
        : 'info' as const
      state.setConsoleEntries(prev => [...prev.slice(-200), {
        id: `wc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        message: clean,
        timestamp: Date.now(),
      }])
    },
  })

  // Forward preview console entries (v0 sandbox logs) to workspace ConsolePanel
  const handlePreviewConsoleEntry = useCallback((entry: { type: 'info' | 'error' | 'warn' | 'success'; message: string }) => {
    const clean = entry.message.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').trim()
    if (!clean || /^[|/\\-]$/.test(clean)) return
    state.setConsoleEntries(prev => [...prev.slice(-200), {
      id: `preview-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type: entry.type,
      message: clean,
      timestamp: Date.now(),
    }])
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync file changes to WebContainer
  // This is handled inline since it needs wc reference
  // (moved to an effect below)

  useWorkspaceEffects({
    state, actions, files, projectId, activeFile, onFileSelect,
    autoSaveError, initialPendingMessage, onInitialPendingMessageSent,
    wcStatus: wc.status, wcSpawn: wc.spawn,
  })

  const prevWcFilesRef = useRef<Record<string, string>>(files)
  useEffect(() => {
    if (wc.status !== 'ready') return
    const prev = prevWcFilesRef.current
    for (const [path, content] of Object.entries(files)) {
      if (prev[path] !== content) wc.syncFile(path, content)
    }
    for (const path of Object.keys(prev)) {
      if (!(path in files)) wc.deleteFile(path)
    }
    prevWcFilesRef.current = { ...files }
  }, [files, wc.status]) // eslint-disable-line react-hooks/exhaustive-deps


  useKeyboardShortcuts([
    { key: 'k', ctrlKey: true, action: () => state.setShowCommandPalette(prev => !prev), description: 'Command palette' },
    { key: 'p', ctrlKey: true, shiftKey: true, action: () => state.setRightTab(prev => prev === 'code' ? 'split' : prev === 'split' ? 'preview' : 'code'), description: 'Cycle view mode' },
    { key: 'b', ctrlKey: true, action: () => state.setSidebarTab(prev => prev ? null : 'git'), description: 'Toggle sidebar' },
    { key: 'w', ctrlKey: true, action: () => { if (activeFile) actions.handleCloseFile(activeFile) }, description: 'Close current file' },
    { key: '/', ctrlKey: true, action: () => state.setShowShortcuts(prev => !prev), description: 'Keyboard shortcuts' },
    { key: 'f', ctrlKey: true, action: () => state.setShowFileSearch(prev => !prev), description: 'Search in files' },
    { key: 'h', ctrlKey: true, action: () => state.setShowFindReplace(prev => !prev), description: 'Find & replace' },
    { key: ',', ctrlKey: true, action: () => state.setShowEditorSettings(prev => !prev), description: 'Editor settings' },
  ])

  const MOBILE_TAB_ORDER: MobileTab[] = ['chat', 'editor', 'preview']
  const mobileSwipe = useSwipe({
    onSwipeLeft: () => state.setMobileTab(prev => { const idx = MOBILE_TAB_ORDER.indexOf(prev); return MOBILE_TAB_ORDER[Math.min(idx + 1, MOBILE_TAB_ORDER.length - 1)] }),
    onSwipeRight: () => state.setMobileTab(prev => { const idx = MOBILE_TAB_ORDER.indexOf(prev); return MOBILE_TAB_ORDER[Math.max(idx - 1, 0)] }),
  })

  const paletteCommands = useMemo(() => [
    { id: 'save', label: 'Save Project', description: 'Save all files to database', shortcut: 'Ctrl+S', icon: Save, category: 'actions' as const, action: actions.handleSave },
    { id: 'deploy', label: 'Deploy to Vercel', description: 'Create production deployment', icon: Rocket, category: 'actions' as const, action: () => state.setShowDeployPanel(true) },
    { id: 'push', label: 'Push to GitHub', description: 'Push files to a repository', icon: Upload, category: 'actions' as const, action: () => state.setActiveDialog('push') },
    { id: 'create-repo', label: 'Create GitHub Repo', description: 'Create a new repository', icon: GitBranch, category: 'actions' as const, action: () => state.setActiveDialog('create-repo') },
    { id: 'import', label: 'Import from GitHub', description: 'Import files from a GitHub repository', icon: FolderInput, category: 'actions' as const, action: () => state.setActiveDialog('import') },
    { id: 'download', label: 'Download as ZIP', description: 'Download all project files', icon: Download, category: 'actions' as const, action: actions.handleDownload },
    { id: 'toggle-preview', label: 'Toggle Preview', description: 'Switch between code and preview', shortcut: 'Ctrl+Shift+P', icon: Eye, category: 'view' as const, action: () => state.setRightTab(prev => prev === 'code' ? 'preview' : 'code') },
    { id: 'toggle-sidebar', label: 'Toggle Sidebar', description: 'Show or hide the sidebar', shortcut: 'Ctrl+B', icon: SidebarOpen, category: 'view' as const, action: () => state.setSidebarTab(prev => prev ? null : 'git') },
    { id: 'close-file', label: 'Close Current File', shortcut: 'Ctrl+W', icon: Code2, category: 'view' as const, action: () => { if (activeFile) actions.handleCloseFile(activeFile) } },
    { id: 'switch-project', label: 'Switch Project', description: 'Go back to project picker', icon: FolderTree, category: 'navigation' as const, action: onSwitchProject },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', description: 'View all keyboard shortcuts', shortcut: 'Ctrl+/', icon: Keyboard, category: 'view' as const, action: () => state.setShowShortcuts(true) },
    { id: 'settings', label: 'Project Settings', description: 'Edit project name and settings', icon: Settings2, category: 'actions' as const, action: () => state.setShowSettings(true) },
    { id: 'search-files', label: 'Search in Files', description: 'Search text across all project files', shortcut: 'Ctrl+F', icon: Search, category: 'navigation' as const, action: () => state.setShowFileSearch(true) },
    { id: 'split-view', label: 'Split View', description: 'Show code and preview side by side', icon: Code2, category: 'view' as const, action: () => state.setRightTab('split') },
    { id: 'version-history', label: 'Version History', description: 'View and restore previous snapshots', icon: History, category: 'navigation' as const, action: () => state.setShowVersionHistory(true) },
    { id: 'db-explorer', label: 'Database Explorer', description: 'Browse and query Pi-Chi database tables', icon: Terminal, category: 'navigation' as const, action: () => state.setShowDbExplorer(true) },
    { id: 'component-library', label: 'Component Library', description: 'Browse pre-built components to add', icon: FolderTree, category: 'navigation' as const, action: () => state.setShowComponentLibrary(true) },
    { id: 'mcp-servers', label: 'MCP Servers', description: 'Manage external MCP server connections', icon: Plug, category: 'actions' as const, action: () => state.setShowMcpManager(true) },
  ], [actions.handleSave, actions.handleDownload, activeFile, onSwitchProject]) // eslint-disable-line react-hooks/exhaustive-deps

  const sidebarContentProps = {
    fileTree: state.fileTree,
    activeFile,
    onFileSelect: actions.handleFileSelect,
    onFileDelete,
    onFileRename: actions.handleFileRename,
    onFileCreate: actions.handleFileCreate,
    fileContents: files,
    modifiedFiles: state.modifiedFiles,
    aiEditingFiles: state.aiEditingFiles,
    fileDiffs: state.fileDiffs,
    githubRepoUrl: githubRepoUrl || null,
    projectId,
    vercelProjectId: state.vercelProjectId,
    onAction: actions.handleAction,
    onFileChange,
    onOpenDbExplorer: () => state.setShowDbExplorer(true),
    onOpenSettings: () => { state.setSettingsDefaultTab('supabase'); state.setShowEditorSettings(true) },
    onRepoConnected: async (url: string) => {
      if (projectId) {
        try {
          const res = await fetch(`/api/projects/${projectId}/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ github_repo_url: url }),
          })
          if (!res.ok) {
            toast.error('Failed to connect repository')
            return
          }
        } catch {
          toast.error('Failed to connect repository')
          return
        }
      }
      onGithubRepoUrlChange?.(url)
      toast.success('Repository connected', { description: url.replace('https://github.com/', '') })
    },
    onRepoDisconnected: () => { onGithubRepoUrlChange?.(null) },
    onBulkFileUpdate,
    onVercelConnected: (id: string) => { state.setVercelProjectId(id); toast.success('Vercel project connected') },
    snapshots: state.snapshots,
    onOpenVersionHistory: () => state.setShowVersionHistory(true),
    onRestoreSnapshot: actions.handleRestoreSnapshot,
    onCreateSnapshot: actions.handleCreateSnapshot,
    onOpenMcpManager: () => state.setShowMcpManager(true),
    sessionCost,
    currentBranch,
    onBranchChange,
  }

  const chatPanel = (
    <PanelErrorBoundary name="Chat">
      <ChatPanel
        projectName={projectName}
        projectId={projectId}
        files={files}
        onFileChange={onFileChange}
        onFileDelete={onFileDelete}
        onBulkFileUpdate={onBulkFileUpdate}
        githubToken={githubToken}
        onRegisterSend={actions.handleRegisterSend}
        pendingMessage={state.pendingChatMessage}
        onPendingMessageSent={() => state.setPendingChatMessage(null)}
        activeFile={activeFile}
        onLoadingChange={actions.handleAiLoadingChange}
        onSessionCostChange={handleSessionCostChange}
        onFileSelect={onFileSelect}
      />
    </PanelErrorBoundary>
  )

  const fileTreePanel = (
    <PanelErrorBoundary name="Files">
      <FileTree
        files={state.fileTree}
        activeFile={activeFile}
        onFileSelect={actions.handleFileSelect}
        onFileDelete={onFileDelete}
        onFileRename={actions.handleFileRename}
        onFileCreate={actions.handleFileCreate}
        fileContents={files}
        modifiedFiles={state.modifiedFiles}
        aiEditingFiles={state.aiEditingFiles}
        fileDiffs={state.fileDiffs}
      />
    </PanelErrorBoundary>
  )

  const MOBILE_TABS = [
    { id: 'chat' as MobileTab, label: 'Chat', Icon: MessageSquare },
    { id: 'editor' as MobileTab, label: 'Editor', Icon: Code2 },
    { id: 'preview' as MobileTab, label: 'Preview', Icon: Eye },
    { id: 'menu' as MobileTab, label: 'Menu', Icon: Menu },
  ]

  return (
    <div
      className="h-screen-dynamic flex flex-col bg-pi-bg relative"
      onDragEnter={actions.handleDragEnter}
      onDragLeave={actions.handleDragLeave}
      onDragOver={actions.handleDragOver}
      onDrop={actions.handleDrop}
    >
      {/* Drag overlay */}
      {state.isDragging && (
        <div className="absolute inset-0 z-[90] bg-pi-accent/10 border-2 border-dashed border-pi-accent rounded-lg flex items-center justify-center backdrop-blur-sm animate-fade-in drag-overlay-pulse pointer-events-none">
          <div className="text-center">
            <Upload className="w-10 h-10 text-pi-accent mx-auto mb-2 upload-float" />
            <p className="text-sm font-medium text-pi-accent">Drop files to import</p>
            <p className="text-xs text-pi-text-dim mt-1">Text files up to 500KB</p>
          </div>
        </div>
      )}

      <Header
        projectName={projectName}
        onSwitchProject={onSwitchProject}
        fileCount={Object.keys(files).length}
        onAction={actions.handleAction}
        saveStatus={saveStatus === 'pending' ? 'idle' : saveStatus}
        onOpenCommandPalette={() => state.setShowCommandPalette(true)}
        notificationSlot={
          <NotificationCenter
            notifications={state.notifications}
            onMarkAllRead={() => state.setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
            onDismiss={(id) => state.setNotifications(prev => prev.filter(n => n.id !== id))}
          />
        }
        githubRepoUrl={githubRepoUrl}
        vercelUrl={vercelUrl}
        currentBranch={currentBranch}
        onBranchChange={onBranchChange}
      />

      <div className="flex-1 hidden md:flex overflow-hidden relative">
        {/* Hover trigger zone */}
        {!state.sidebarVisible && (
          <div
            className="absolute left-0 top-0 bottom-0 w-2 z-40"
            onMouseEnter={() => {
              if (state.sidebarLeaveTimer.current) { clearTimeout(state.sidebarLeaveTimer.current); state.sidebarLeaveTimer.current = null }
              state.setSidebarHovered(true)
            }}
          />
        )}

        {/* Sidebar tray */}
        {state.sidebarVisible && (
          <div
            className={cn('absolute left-0 top-0 bottom-0 z-30 flex shadow-xl sidebar-tray', !state.sidebarPinned && 'sidebar-unpinned')}
            onMouseEnter={() => {
              if (state.sidebarLeaveTimer.current) { clearTimeout(state.sidebarLeaveTimer.current); state.sidebarLeaveTimer.current = null }
              state.setSidebarHovered(true)
            }}
            onMouseLeave={() => {
              if (!state.sidebarPinned) {
                state.sidebarLeaveTimer.current = setTimeout(() => state.setSidebarHovered(false), 300)
              }
            }}
          >
            <ActivityBar activeTab={state.sidebarTab} onTabChange={(tab) => {
              if (tab === state.sidebarTab) {
                state.setSidebarTab(null); state.setSidebarPinned(false); state.setSidebarHovered(false)
              } else {
                state.setSidebarTab(tab)
              }
            }} />
            {state.sidebarTab && (
              <div className="w-[260px] bg-pi-panel border-r border-pi-border flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-pi-border shrink-0">
                  <span className="text-[10px] uppercase tracking-wider text-pi-text-dim font-medium">
                    {state.sidebarTab.charAt(0).toUpperCase() + state.sidebarTab.slice(1)}
                  </span>
                  <button
                    onClick={() => { if (state.sidebarPinned) { state.setSidebarPinned(false); state.setSidebarHovered(false) } else { state.setSidebarPinned(true) } }}
                    title={state.sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
                    aria-label={state.sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
                    className="p-1 rounded text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-all"
                  >
                    {state.sidebarPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5 rotate-45" />}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <SidebarContent activeTab={state.sidebarTab} {...sidebarContentProps} />
                </div>
              </div>
            )}
          </div>
        )}

        <PanelGroup direction="horizontal" autoSaveId="pi-workspace-v3">
          <Panel defaultSize={25} minSize={15} maxSize={45}>
            {chatPanel}
          </Panel>
          <PanelResizeHandle className="w-3 bg-transparent hover:bg-pi-accent/10 active:bg-pi-accent/20 transition-colors relative flex items-center justify-center cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:-translate-x-1/2 after:w-px after:bg-pi-border">
            <div className="resize-grip-dots"><span /><span /><span /></div>
          </PanelResizeHandle>
          <Panel defaultSize={15} minSize={8} maxSize={25}>
            <div className="h-full overflow-y-auto bg-pi-panel border-r border-pi-border">
              {fileTreePanel}
            </div>
          </Panel>
          <PanelResizeHandle className="w-3 bg-transparent hover:bg-pi-accent/10 active:bg-pi-accent/20 transition-colors relative flex items-center justify-center cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:-translate-x-1/2 after:w-px after:bg-pi-border">
            <div className="resize-grip-dots"><span /><span /><span /></div>
          </PanelResizeHandle>
          <Panel defaultSize={60} minSize={30}>
            <div className="h-full flex flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                {/* Editor panel with tabs */}
                <div className="h-full flex flex-col bg-pi-surface">
                  <div className="flex items-center border-b border-pi-border bg-pi-panel" role="tablist" aria-label="Editor view mode">
                    {(['code', 'split', 'preview', 'terminal'] as const).map(tab => (
                      <button
                        key={tab}
                        role="tab"
                        aria-selected={state.rightTab === tab}
                        aria-controls={tab === state.rightTab ? 'main-content' : undefined}
                        onClick={() => {
                          state.setRightTab(tab)
                          state.userManualSwitchRef.current = true
                          if (state.userSwitchTimerRef.current) clearTimeout(state.userSwitchTimerRef.current)
                          state.userSwitchTimerRef.current = setTimeout(() => { state.userManualSwitchRef.current = false }, 15000)
                        }}
                        className={`relative px-4 py-2 text-xs font-medium transition-all duration-150 ${
                          state.rightTab === tab ? 'text-pi-accent bg-pi-surface' : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface/50'
                        }`}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        {state.rightTab === tab && (
                          <motion.span layoutId="right-tab-indicator" className="absolute bottom-0 left-1 right-1 h-0.5 bg-pi-accent rounded-full" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                        )}
                      </button>
                    ))}
                    {(state.rightTab === 'code' || state.rightTab === 'split') && state.openFiles.length > 0 && (
                      <div className="flex-1 min-w-0 ml-2 border-l border-pi-border">
                        <EditorTabs openFiles={state.openFiles} activeFile={activeFile} onFileSelect={onFileSelect} onCloseFile={actions.handleCloseFile} onReorder={actions.handleReorderTabs} modifiedFiles={state.modifiedFiles} />
                      </div>
                    )}
                  </div>
                  <div id="main-content" role="tabpanel" aria-label={state.rightTab.charAt(0).toUpperCase() + state.rightTab.slice(1) + ' panel'} className="flex-1 overflow-hidden relative">
                    {(state.rightTab === 'code' || state.rightTab === 'split') && (
                      <div className={cn('h-full', state.rightTab === 'split' && 'absolute inset-0 right-1/2 border-r border-pi-border z-10')}>
                        <PanelErrorBoundary name="Code Editor">
                          <CodeEditor
                            path={activeFile}
                            content={activeFile ? files[activeFile] || '' : ''}
                            previousContent={activeFile ? state.initialFilesRef.current[activeFile] : undefined}
                            onSave={(path, content) => onFileChange(path, content)}
                            onChange={(content) => activeFile && onFileChange(activeFile, content)}
                            isAiWorking={state.aiLoading}
                          />
                        </PanelErrorBoundary>
                      </div>
                    )}
                    {state.rightTab === 'terminal' && (
                      <PanelErrorBoundary name="Terminal">
                        <TerminalPanel getShellProcess={wc.getShellProcess} wcReady={wc.status !== 'idle' && wc.status !== 'booting' && wc.status !== 'mounting'} />
                      </PanelErrorBoundary>
                    )}
                    <div className={cn(
                      'absolute inset-0',
                      state.rightTab === 'preview' && 'z-10',
                      state.rightTab === 'split' && 'z-10 left-1/2',
                      (state.rightTab === 'code' || state.rightTab === 'terminal') && '-z-10 invisible pointer-events-none',
                    )}>
                      <PanelErrorBoundary name="Preview">
                        <PreviewPanel files={files} projectId={projectId} onFixErrors={(msg) => state.setPendingChatMessage(msg)} onCapturePreview={(msg) => state.setPendingChatMessage(msg)} onPreviewReady={actions.handlePreviewReady} wcPreviewUrl={wc.previewUrl} onFileSelect={onFileSelect} onConsoleEntry={handlePreviewConsoleEntry} />
                      </PanelErrorBoundary>
                    </div>
                  </div>
                </div>
              </div>
              <ConsolePanel entries={state.consoleEntries} onClear={() => state.setConsoleEntries([])} open={state.consoleOpen} onToggle={() => state.setConsoleOpen(prev => !prev)} />
              <StatusBar activeFile={activeFile} fileCount={Object.keys(files).length} framework={detectFramework(files)} saveStatus={saveStatus} />
            </div>
          </Panel>
        </PanelGroup>
      </div>

      <div className="flex-1 flex flex-col md:hidden overflow-hidden">
        <OfflineIndicator />
        <div className="flex-1 overflow-hidden rounded-t-2xl" onTouchStart={mobileSwipe.onTouchStart} onTouchEnd={mobileSwipe.onTouchEnd}>
          {state.mobileTab === 'chat' && chatPanel}
          {state.mobileTab === 'editor' && (
            <div className="h-full flex flex-col bg-pi-surface">
              {state.openFiles.length > 0 && (
                <div className="flex items-center border-b border-pi-border bg-pi-panel shrink-0">
                  <button
                    onClick={() => state.setMobileEditorShowTree(prev => !prev)}
                    aria-label={state.mobileEditorShowTree ? 'Hide file tree' : 'Show file tree'}
                    aria-expanded={state.mobileEditorShowTree}
                    className={cn('p-2.5 transition-colors shrink-0 border-r border-pi-border', state.mobileEditorShowTree ? 'text-pi-accent bg-pi-accent/10' : 'text-pi-text-dim')}
                  >
                    <FolderTree className="w-4 h-4" />
                  </button>
                  <div className="flex-1 overflow-x-auto px-1" data-swipe-ignore>
                    <div className="flex items-center overflow-x-auto gap-0.5 -webkit-overflow-scrolling-touch">
                      {state.openFiles.map(f => {
                        const name = f.split('/').pop() || f
                        const isActive = activeFile === f
                        return (
                          <div
                            key={f}
                            className={cn('group relative flex items-center gap-1 px-3 sm:px-2.5 py-2 sm:py-1.5 text-xs rounded-md cursor-pointer transition-all whitespace-nowrap border', isActive ? 'bg-pi-surface text-pi-text border-pi-border shadow-sm' : 'text-pi-text-dim hover:text-pi-text border-transparent hover:bg-pi-surface/50')}
                            onClick={() => onFileSelect(f)}
                          >
                            <span>{name}</span>
                            <button onClick={(e) => { e.stopPropagation(); actions.handleCloseFile(f) }} className="ml-1 p-1 sm:ml-0.5 sm:p-0 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 hover:text-pi-danger text-xs sm:text-[10px] transition-opacity">&times;</button>
                            {isActive && <motion.span layoutId="file-tab-indicator" className="absolute bottom-0 left-1 right-1 h-0.5 bg-pi-accent rounded-full" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )}
              <div className="flex-1 flex overflow-hidden">
                <AnimatePresence>
                  {state.mobileEditorShowTree && (
                    <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 220, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="shrink-0 border-r border-pi-border overflow-hidden bg-pi-panel">
                      <div className="w-[220px] h-full overflow-y-auto">{fileTreePanel}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex-1 overflow-hidden">
                  {activeFile ? (
                    <CodeEditor path={activeFile} content={activeFile ? files[activeFile] || '' : ''} previousContent={activeFile ? state.initialFilesRef.current[activeFile] : undefined} onSave={(path, content) => onFileChange(path, content)} onChange={(content) => activeFile && onFileChange(activeFile, content)} />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-pi-text-dim gap-2">
                      <FolderTree className="w-8 h-8 opacity-40" />
                      <span className="text-sm">Select a file to edit</span>
                      <button onClick={() => state.setMobileEditorShowTree(true)} className="mt-1 px-3 py-1.5 text-xs bg-pi-surface border border-pi-border rounded-lg hover:bg-pi-surface-hover transition-colors">Open file tree</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {state.mobileTab === 'preview' && <PreviewPanel files={files} projectId={projectId} onFixErrors={(msg) => state.setPendingChatMessage(msg)} onCapturePreview={(msg) => state.setPendingChatMessage(msg)} onPreviewReady={actions.handlePreviewReady} wcPreviewUrl={wc.previewUrl} onFileSelect={onFileSelect} onConsoleEntry={handlePreviewConsoleEntry} />}
          {state.mobileTab === 'menu' && (
            <div className="h-full flex flex-col bg-pi-panel">
              {/* If a sidebar panel is open, show it with a back button */}
              {state.sidebarTab ? (
                <>
                  <div className="flex items-center gap-2 px-3 py-2.5 border-b border-pi-border shrink-0">
                    <button onClick={() => state.setSidebarTab(null)} aria-label="Back to menu" className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-pi-text-dim hover:text-pi-text active:bg-pi-surface rounded-lg transition-colors min-h-[36px]">
                      <ChevronDown className="w-4 h-4 rotate-90" />
                      <span>Back</span>
                    </button>
                    <span className="text-xs font-medium text-pi-text">{SIDEBAR_TABS.find(t => t.id === state.sidebarTab)?.label}</span>
                  </div>
                  <div className="flex-1 overflow-y-auto">
                    <SidebarContent activeTab={state.sidebarTab} {...sidebarContentProps} />
                  </div>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto">
                  <div className="px-4 py-3 border-b border-pi-border"><h2 className="text-sm font-medium text-pi-text">Menu</h2></div>

                  {/* Quick actions */}
                  <div className="p-3 space-y-0.5">
                    <button onClick={() => { state.setShowSettings(true); actions.handleMobileTabSwitch('chat') }} className="flex items-center gap-3 w-full px-3 py-3 text-sm text-pi-text rounded-xl hover:bg-pi-surface active:bg-pi-surface/80 transition-colors"><Settings2 className="w-5 h-5 text-pi-text-dim" /> Project Settings</button>
                    <button onClick={() => { state.setShowFileSearch(true); actions.handleMobileTabSwitch('editor') }} className="flex items-center gap-3 w-full px-3 py-3 text-sm text-pi-text rounded-xl hover:bg-pi-surface active:bg-pi-surface/80 transition-colors"><Search className="w-5 h-5 text-pi-text-dim" /> Search Files</button>
                    <button onClick={() => state.setShowVersionHistory(true)} className="flex items-center gap-3 w-full px-3 py-3 text-sm text-pi-text rounded-xl hover:bg-pi-surface active:bg-pi-surface/80 transition-colors"><History className="w-5 h-5 text-pi-text-dim" /> Version History</button>
                    <button onClick={() => { state.setShowDeployPanel(true); actions.handleMobileTabSwitch('chat') }} className="flex items-center gap-3 w-full px-3 py-3 text-sm text-pi-text rounded-xl hover:bg-pi-surface active:bg-pi-surface/80 transition-colors"><Rocket className="w-5 h-5 text-pi-text-dim" /> Deploy</button>
                    <button onClick={() => state.setShowEditorSettings(true)} className="flex items-center gap-3 w-full px-3 py-3 text-sm text-pi-text rounded-xl hover:bg-pi-surface active:bg-pi-surface/80 transition-colors"><Keyboard className="w-5 h-5 text-pi-text-dim" /> Editor Settings</button>
                    <button onClick={() => state.setShowMcpManager(true)} className="flex items-center gap-3 w-full px-3 py-3 text-sm text-pi-text rounded-xl hover:bg-pi-surface active:bg-pi-surface/80 transition-colors"><Plug className="w-5 h-5 text-pi-text-dim" /> MCP Servers</button>
                  </div>

                  {/* Integrations grid */}
                  <div className="px-4 py-2 border-t border-pi-border">
                    <span className="text-[10px] uppercase tracking-wider text-pi-text-dim font-medium">Integrations</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 px-3 pb-4">
                    {SIDEBAR_TABS.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => state.setSidebarTab(tab.id)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border transition-all active:scale-95 min-h-[72px]',
                          'border-pi-border/50 bg-pi-surface/30 hover:bg-pi-surface active:bg-pi-surface/80',
                        )}
                      >
                        <tab.icon className={cn('w-6 h-6', tab.activeColor || 'text-pi-text-dim')} />
                        <span className="text-[10px] font-medium text-pi-text leading-tight text-center">{tab.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile tab bar */}
        <div className="flex items-center justify-around border-t border-pi-border/60 bg-pi-panel/80 backdrop-blur-md py-2 pb-3 shrink-0 safe-bottom" role="tablist" aria-label="Mobile navigation">
          {MOBILE_TABS.map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={state.mobileTab === tab.id}
              onClick={() => { navigator.vibrate?.(5); actions.handleMobileTabSwitch(tab.id) }}
              aria-label={tab.label}
              className={cn('relative flex flex-col items-center gap-0.5 px-5 py-2 rounded-xl transition-all min-w-[68px] min-h-[50px] focus:outline-none focus-visible:ring-2 focus-visible:ring-pi-accent/50 active:scale-95', state.mobileTab === tab.id ? 'text-pi-accent' : 'text-pi-text-dim active:bg-pi-surface')}
            >
              {state.mobileTab === tab.id && <motion.div layoutId="mobile-tab-bg" className="absolute inset-0 bg-pi-accent/10 rounded-xl shadow-sm" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
              <div className="relative">
                <tab.Icon className={cn('w-5 h-5 transition-transform duration-200', state.mobileTab === tab.id && 'scale-110')} />
                {tab.id === 'preview' && wc.previewUrl && state.mobileTab !== 'preview' && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-pi-accent animate-pulse-dot" />}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
        <PWAInstallPrompt />
      </div>

      {state.showDeployPanel && (
        <DeployPanel projectId={projectId} files={files} projectName={projectName} onClose={() => state.setShowDeployPanel(false)} onSuccess={actions.handleDialogSuccess} onFix={actions.handleDialogFix} onFilesFixed={(fixedFiles) => onBulkFileUpdate({ ...files, ...fixedFiles })} />
      )}
      <TaskPollingDialog open={state.activeDialog === 'create-repo'} onClose={() => state.setActiveDialog(null)} title="Create GitHub Repository" description="Create a new GitHub repository and push all project files." confirmLabel="Create & Push" taskType="github_create" projectId={projectId}
        fields={[
          { name: 'repoName', label: 'Repository Name', placeholder: projectName.replace(/\s+/g, '-').toLowerCase(), required: true, defaultValue: projectName.replace(/\s+/g, '-').toLowerCase() },
          { name: 'description', label: 'Description', placeholder: 'Built with Pi-Chi' },
        ]}
        buildParams={(fv) => ({ repoName: fv.repoName, description: fv.description || 'Built with Pi-Chi', isPublic: false, files, githubToken })}
        onSuccess={actions.handleDialogSuccess} onFix={actions.handleDialogFix}
      />
      <TaskPollingDialog open={state.activeDialog === 'push'} onClose={() => state.setActiveDialog(null)} title="Push to GitHub" description={`Push all ${Object.keys(files).length} files to an existing GitHub repository.`} confirmLabel="Push" taskType="github_push" projectId={projectId}
        fields={(() => {
          const parts = githubRepoUrl?.replace('https://github.com/', '').split('/') || []
          const connectedOwner = parts[0] || ''
          const connectedRepo = parts[1] || ''
          return [
            { name: 'owner', label: 'Owner', placeholder: 'your-username', required: true, defaultValue: connectedOwner },
            { name: 'repo', label: 'Repository', placeholder: 'my-project', required: true, defaultValue: connectedRepo },
            { name: 'branch', label: 'Branch', placeholder: 'main', defaultValue: currentBranch || 'main' },
            { name: 'message', label: 'Commit Message', placeholder: 'Update from Pi-Chi', defaultValue: 'Update from Pi-Chi' },
          ]
        })()}
        buildParams={(fv) => ({ owner: fv.owner, repo: fv.repo, branch: fv.branch || currentBranch || 'main', message: fv.message || 'Update from Pi-Chi', files, githubToken })}
        onSuccess={actions.handleDialogSuccess} onFix={actions.handleDialogFix}
      />
      <ActionDialog open={state.activeDialog === 'import'} onClose={() => state.setActiveDialog(null)} title="Import from GitHub" description={`Import files from a GitHub repository into "${projectName}". Existing files with the same path will be overwritten.`} confirmLabel="Import"
        fields={[
          { name: 'owner', label: 'Owner', placeholder: 'username or org', required: true, defaultValue: githubUsername || '' },
          { name: 'repo', label: 'Repository', placeholder: 'my-project', required: true },
          { name: 'branch', label: 'Branch', placeholder: 'main (auto-detected if empty)' },
        ]}
        onConfirm={async (fv) => {
          const res = await fetch('/api/github/import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ owner: fv.owner, repo: fv.repo, branch: fv.branch || undefined }) })
          if (!res.ok) { const data = await res.json(); throw new Error(data.error || `Import failed (HTTP ${res.status})`) }
          const data = await res.json()
          if (data.files && Object.keys(data.files).length > 0) {
            onBulkFileUpdate({ ...files, ...data.files })
            const skippedCount = data.skipped?.length || 0; const failedCount = data.failedFiles?.length || 0
            const warnings: string[] = []; if (skippedCount > 0) warnings.push(`${skippedCount} skipped`); if (failedCount > 0) warnings.push(`${failedCount} failed to fetch`)
            toast.success(`Imported ${data.fileCount} files${warnings.length ? ` (${warnings.join(', ')})` : ''}`, { description: `From ${fv.owner}/${fv.repo}${data.branch ? ` (${data.branch})` : ''}`, duration: (skippedCount || failedCount) ? 5000 : 3000 })
            if (failedCount > 0) toast.warning(`${failedCount} file${failedCount > 1 ? 's' : ''} failed to import`, { description: data.failedFiles.slice(0, 5).join(', ') + (failedCount > 5 ? ` +${failedCount - 5} more` : ''), duration: 6000 })
          } else throw new Error('No importable files found in repository')
        }}
      />
      <CommandPalette open={state.showCommandPalette} onClose={() => state.setShowCommandPalette(false)} commands={paletteCommands} />
      <KeyboardShortcutsOverlay open={state.showShortcuts} onClose={() => state.setShowShortcuts(false)} />
      <FileSearch files={files} onResultClick={actions.handleFileSelect} open={state.showFileSearch} onClose={() => state.setShowFileSearch(false)} />
      <ProjectSettingsDialog open={state.showSettings} onClose={() => state.setShowSettings(false)} projectName={projectName} projectId={projectId} framework={detectFramework(files)} onUpdateSettings={onUpdateSettings || (() => {})} />
      <VersionHistory open={state.showVersionHistory} onClose={() => state.setShowVersionHistory(false)} snapshots={state.snapshots} currentFiles={files}
        onRestore={(snap) => { onBulkFileUpdate(snap.files, { replace: true }); toast.success('Snapshot restored', { description: snap.label }) }}
        onViewDiff={(snapshotId, path) => { const snap = state.snapshots.find(s => s.id === snapshotId); if (snap) state.setDiffState({ open: true, path, oldContent: snap.files[path] || '', newContent: files[path] || '' }) }}
      />
      {state.diffState && <DiffViewer open={state.diffState.open} onClose={() => state.setDiffState(null)} path={state.diffState.path} oldContent={state.diffState.oldContent} newContent={state.diffState.newContent} oldLabel="Snapshot" newLabel="Current" />}
      <FindReplacePanel open={state.showFindReplace} onClose={() => state.setShowFindReplace(false)} files={files} onReplace={onFileChange} activeFile={activeFile} />
      <SettingsDialog open={state.showEditorSettings} onClose={() => { state.setShowEditorSettings(false); state.setSettingsDefaultTab(undefined) }} defaultTab={state.settingsDefaultTab} />
      {state.auditPlan && (
        <div className="fixed bottom-16 right-4 z-40 w-[420px] max-h-[70vh] animate-slide-up">
          <AuditPanel plan={state.auditPlan} onApprove={() => { state.chatSendRef.current?.('[AUDIT APPROVED]'); state.setAuditPlan(prev => prev ? { ...prev, status: 'in_progress' } : null) }} onReplan={(fb) => { state.chatSendRef.current?.(`[REPLAN] feedback: ${fb}`); state.setAuditPlan(null) }} onDismiss={() => state.setAuditPlan(null)} />
        </div>
      )}
      {state.showDbExplorer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => state.setShowDbExplorer(false)}>
          <div className="w-[900px] h-[600px] max-w-[95vw] max-h-[85vh] rounded-2xl border border-pi-border shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}><DbExplorer /></div>
        </div>
      )}
      {state.showComponentLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => state.setShowComponentLibrary(false)}>
          <div className="w-[500px] h-[600px] max-w-[95vw] max-h-[85vh] rounded-2xl border border-pi-border shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <ComponentLibrary onInsert={(code) => { state.chatSendRef.current?.(code); state.setShowComponentLibrary(false) }} />
          </div>
        </div>
      )}
      <MCPManager isOpen={state.showMcpManager} onClose={() => state.setShowMcpManager(false)} />
      <OnboardingTour />
    </div>
  )
}
