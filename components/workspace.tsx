'use client'

import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { ChatPanel } from './chat-panel'
import { CodeEditor } from './code-editor'
import { EditorTabs } from './editor-tabs'
import { FileTree } from './file-tree'
import { ActivityBar, SidebarContent, type SidebarTab } from './sidebar'
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
import { PanelErrorBoundary } from './panel-error-boundary'
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
  MessageSquare, FolderTree, Code2, Eye, Save, Rocket, Upload, GitBranch, Download,
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
}

export function Workspace(props: WorkspaceProps) {
  const {
    projectName, projectId, files, activeFile,
    onFileSelect, onFileChange, onFileDelete, onBulkFileUpdate, onSwitchProject,
    githubToken, autoSaveError, saveStatus: parentSaveStatus, onManualSave, onUpdateSettings,
    initialPendingMessage, onInitialPendingMessageSent, githubRepoUrl,
    onGithubRepoUrlChange, githubUsername,
  } = props

  // ─── Hooks ───────────────────────────────────────────────
  const state = useWorkspaceState(files, projectId)
  const saveStatus = (parentSaveStatus && parentSaveStatus !== 'idle') ? parentSaveStatus : state.localSaveStatus

  const actions = useWorkspaceActions({
    state, files, projectId, projectName, activeFile,
    onFileSelect, onFileChange, onFileDelete, onBulkFileUpdate, onManualSave, githubToken,
    githubRepoUrl: githubRepoUrl || null, onGithubRepoUrlChange,
  })

  // ─── Session cost (for Anthropic sidebar panel) ─────────
  const [sessionCost, setSessionCost] = useState<{ cost: number; inputTokens: number; outputTokens: number }>({ cost: 0, inputTokens: 0, outputTokens: 0 })
  const handleSessionCostChange = useCallback((cost: { cost: number; inputTokens: number; outputTokens: number }) => {
    setSessionCost(cost)
  }, [])

  // ─── WebContainer ────────────────────────────────────────
  const wc = useWebcontainer({
    files,
    enabled: state.hasPackageJson && Object.keys(files).length > 0,
    onTerminalOutput: (data) => {
      state.setConsoleEntries(prev => [...prev.slice(-200), {
        id: `wc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'info' as const,
        message: data,
        timestamp: Date.now(),
      }])
    },
  })

  // Sync file changes to WebContainer
  const prevFilesRef = state.filesRef
  // This is handled inline since it needs wc reference
  // (moved to an effect below)

  useWorkspaceEffects({
    state, actions, files, projectId, activeFile, onFileSelect,
    autoSaveError, initialPendingMessage, onInitialPendingMessageSent,
    wcStatus: wc.status, wcSpawn: wc.spawn,
  })

  // ─── WebContainer file sync (needs wc instance) ──────────
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


  // ─── Keyboard shortcuts ──────────────────────────────────
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

  // ─── Swipe gestures ──────────────────────────────────────
  const MOBILE_TAB_ORDER: MobileTab[] = ['chat', 'editor', 'preview']
  const mobileSwipe = useSwipe({
    onSwipeLeft: () => state.setMobileTab(prev => { const idx = MOBILE_TAB_ORDER.indexOf(prev); return MOBILE_TAB_ORDER[Math.min(idx + 1, MOBILE_TAB_ORDER.length - 1)] }),
    onSwipeRight: () => state.setMobileTab(prev => { const idx = MOBILE_TAB_ORDER.indexOf(prev); return MOBILE_TAB_ORDER[Math.max(idx - 1, 0)] }),
  })

  // ─── Command palette ────────────────────────────────────
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
    { id: 'db-explorer', label: 'Database Explorer', description: 'Browse and query Forge database tables', icon: Terminal, category: 'navigation' as const, action: () => state.setShowDbExplorer(true) },
    { id: 'component-library', label: 'Component Library', description: 'Browse pre-built components to add', icon: FolderTree, category: 'navigation' as const, action: () => state.setShowComponentLibrary(true) },
    { id: 'mcp-servers', label: 'MCP Servers', description: 'Manage external MCP server connections', icon: Plug, category: 'actions' as const, action: () => state.setShowMcpManager(true) },
  ], [actions.handleSave, actions.handleDownload, activeFile, onSwitchProject]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Sidebar content props (shared between desktop & mobile) ──
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
  }

  // ─── Shared panel elements ───────────────────────────────
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
      />
    </PanelErrorBoundary>
  )

  const fileTreePanel = (
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
  )

  const MOBILE_TABS = [
    { id: 'chat' as MobileTab, label: 'Chat', Icon: MessageSquare },
    { id: 'editor' as MobileTab, label: 'Editor', Icon: Code2 },
    { id: 'preview' as MobileTab, label: 'Preview', Icon: Eye },
    { id: 'menu' as MobileTab, label: 'Menu', Icon: Menu },
  ]

  return (
    <div
      className="h-screen-dynamic flex flex-col bg-forge-bg relative"
      onDragEnter={actions.handleDragEnter}
      onDragLeave={actions.handleDragLeave}
      onDragOver={actions.handleDragOver}
      onDrop={actions.handleDrop}
    >
      {/* Drag overlay */}
      {state.isDragging && (
        <div className="absolute inset-0 z-[90] bg-forge-accent/10 border-2 border-dashed border-forge-accent rounded-lg flex items-center justify-center backdrop-blur-sm animate-fade-in drag-overlay-pulse pointer-events-none">
          <div className="text-center">
            <Upload className="w-10 h-10 text-forge-accent mx-auto mb-2 upload-float" />
            <p className="text-sm font-medium text-forge-accent">Drop files to import</p>
            <p className="text-xs text-forge-text-dim mt-1">Text files up to 500KB</p>
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
      />

      {/* ═══ Desktop layout ═══ */}
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
              <div className="w-[260px] bg-forge-panel border-r border-forge-border flex flex-col overflow-hidden">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-forge-border shrink-0">
                  <span className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">
                    {state.sidebarTab.charAt(0).toUpperCase() + state.sidebarTab.slice(1)}
                  </span>
                  <button
                    onClick={() => { if (state.sidebarPinned) { state.setSidebarPinned(false); state.setSidebarHovered(false) } else { state.setSidebarPinned(true) } }}
                    title={state.sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
                    className="p-1 rounded text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-all"
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

        <PanelGroup direction="horizontal" autoSaveId="forge-workspace-v3">
          <Panel defaultSize={25} minSize={15} maxSize={45}>
            {chatPanel}
          </Panel>
          <PanelResizeHandle className="w-3 bg-transparent hover:bg-forge-accent/10 active:bg-forge-accent/20 transition-colors relative flex items-center justify-center cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:-translate-x-1/2 after:w-px after:bg-forge-border">
            <div className="resize-grip-dots"><span /><span /><span /></div>
          </PanelResizeHandle>
          <Panel defaultSize={15} minSize={8} maxSize={25}>
            <div className="h-full overflow-y-auto bg-forge-panel border-r border-forge-border">
              {fileTreePanel}
            </div>
          </Panel>
          <PanelResizeHandle className="w-3 bg-transparent hover:bg-forge-accent/10 active:bg-forge-accent/20 transition-colors relative flex items-center justify-center cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:-translate-x-1/2 after:w-px after:bg-forge-border">
            <div className="resize-grip-dots"><span /><span /><span /></div>
          </PanelResizeHandle>
          <Panel defaultSize={60} minSize={30}>
            <div className="h-full flex flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                {/* Editor panel with tabs */}
                <div className="h-full flex flex-col bg-forge-surface">
                  <div className="flex items-center border-b border-forge-border bg-forge-panel">
                    {(['code', 'split', 'preview', 'terminal'] as const).map(tab => (
                      <button
                        key={tab}
                        onClick={() => {
                          state.setRightTab(tab)
                          state.userManualSwitchRef.current = true
                          if (state.userSwitchTimerRef.current) clearTimeout(state.userSwitchTimerRef.current)
                          state.userSwitchTimerRef.current = setTimeout(() => { state.userManualSwitchRef.current = false }, 15000)
                        }}
                        className={`relative px-4 py-2 text-xs font-medium transition-all duration-150 ${
                          state.rightTab === tab ? 'text-forge-accent bg-forge-surface' : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface/50'
                        }`}
                      >
                        {tab.charAt(0).toUpperCase() + tab.slice(1)}
                        {state.rightTab === tab && (
                          <motion.span layoutId="right-tab-indicator" className="absolute bottom-0 left-1 right-1 h-0.5 bg-forge-accent rounded-full" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                        )}
                      </button>
                    ))}
                    {(state.rightTab === 'code' || state.rightTab === 'split') && state.openFiles.length > 0 && (
                      <div className="flex-1 min-w-0 ml-2 border-l border-forge-border">
                        <EditorTabs openFiles={state.openFiles} activeFile={activeFile} onFileSelect={onFileSelect} onCloseFile={actions.handleCloseFile} onReorder={actions.handleReorderTabs} modifiedFiles={state.modifiedFiles} />
                      </div>
                    )}
                  </div>
                  <div id="main-content" role="main" className="flex-1 overflow-hidden relative">
                    {(state.rightTab === 'code' || state.rightTab === 'split') && (
                      <div className={cn('h-full', state.rightTab === 'split' && 'absolute inset-0 right-1/2 border-r border-forge-border z-10')}>
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
                        <TerminalPanel getShellProcess={wc.getShellProcess} wcReady={wc.status === 'ready'} />
                      </PanelErrorBoundary>
                    )}
                    <div className={cn(
                      'absolute inset-0',
                      state.rightTab === 'preview' && 'z-10',
                      state.rightTab === 'split' && 'z-10 left-1/2',
                      (state.rightTab === 'code' || state.rightTab === 'terminal') && '-z-10 invisible pointer-events-none',
                    )}>
                      <PanelErrorBoundary name="Preview">
                        <PreviewPanel files={files} projectId={projectId} onFixErrors={(msg) => state.setPendingChatMessage(msg)} onCapturePreview={(msg) => state.setPendingChatMessage(msg)} onPreviewReady={actions.handlePreviewReady} wcPreviewUrl={wc.previewUrl} />
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

      {/* ═══ Mobile layout ═══ */}
      <div className="flex-1 flex flex-col md:hidden overflow-hidden">
        <OfflineIndicator />
        <div className="flex-1 overflow-hidden rounded-t-2xl" onTouchStart={mobileSwipe.onTouchStart} onTouchEnd={mobileSwipe.onTouchEnd}>
          {state.mobileTab === 'chat' && chatPanel}
          {state.mobileTab === 'editor' && (
            <div className="h-full flex flex-col bg-forge-surface">
              {state.openFiles.length > 0 && (
                <div className="flex items-center border-b border-forge-border bg-forge-panel shrink-0">
                  <button
                    onClick={() => state.setMobileEditorShowTree(prev => !prev)}
                    className={cn('p-2.5 transition-colors shrink-0 border-r border-forge-border', state.mobileEditorShowTree ? 'text-forge-accent bg-forge-accent/10' : 'text-forge-text-dim')}
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
                            className={cn('group relative flex items-center gap-1 px-3 sm:px-2.5 py-2 sm:py-1.5 text-xs rounded-md cursor-pointer transition-all whitespace-nowrap border', isActive ? 'bg-forge-surface text-forge-text border-forge-border shadow-sm' : 'text-forge-text-dim hover:text-forge-text border-transparent hover:bg-forge-surface/50')}
                            onClick={() => onFileSelect(f)}
                          >
                            <span>{name}</span>
                            <button onClick={(e) => { e.stopPropagation(); actions.handleCloseFile(f) }} className="ml-1 p-1 sm:ml-0.5 sm:p-0 opacity-60 sm:opacity-0 sm:group-hover:opacity-100 hover:text-forge-danger text-xs sm:text-[10px] transition-opacity">&times;</button>
                            {isActive && <motion.span layoutId="file-tab-indicator" className="absolute bottom-0 left-1 right-1 h-0.5 bg-forge-accent rounded-full" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
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
                    <motion.div initial={{ width: 0, opacity: 0 }} animate={{ width: 220, opacity: 1 }} exit={{ width: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="shrink-0 border-r border-forge-border overflow-hidden bg-forge-panel">
                      <div className="w-[220px] h-full overflow-y-auto">{fileTreePanel}</div>
                    </motion.div>
                  )}
                </AnimatePresence>
                <div className="flex-1 overflow-hidden">
                  {activeFile ? (
                    <CodeEditor path={activeFile} content={activeFile ? files[activeFile] || '' : ''} previousContent={activeFile ? state.initialFilesRef.current[activeFile] : undefined} onSave={(path, content) => onFileChange(path, content)} onChange={(content) => activeFile && onFileChange(activeFile, content)} />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-forge-text-dim gap-2">
                      <FolderTree className="w-8 h-8 opacity-40" />
                      <span className="text-sm">Select a file to edit</span>
                      <button onClick={() => state.setMobileEditorShowTree(true)} className="mt-1 px-3 py-1.5 text-xs bg-forge-surface border border-forge-border rounded-lg hover:bg-forge-surface-hover transition-colors">Open file tree</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          {state.mobileTab === 'preview' && <PreviewPanel files={files} projectId={projectId} onFixErrors={(msg) => state.setPendingChatMessage(msg)} onCapturePreview={(msg) => state.setPendingChatMessage(msg)} onPreviewReady={actions.handlePreviewReady} wcPreviewUrl={wc.previewUrl} />}
          {state.mobileTab === 'menu' && (
            <div className="h-full flex flex-col bg-forge-panel overflow-y-auto">
              <div className="px-4 py-3 border-b border-forge-border"><h2 className="text-sm font-medium text-forge-text">Menu</h2></div>
              <div className="p-3 space-y-1">
                <button onClick={() => { state.setShowSettings(true); actions.handleMobileTabSwitch('chat') }} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-forge-text rounded-lg hover:bg-forge-surface transition-colors"><Settings2 className="w-4 h-4 text-forge-text-dim" /> Project Settings</button>
                <button onClick={() => { state.setShowFileSearch(true); actions.handleMobileTabSwitch('editor') }} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-forge-text rounded-lg hover:bg-forge-surface transition-colors"><Search className="w-4 h-4 text-forge-text-dim" /> Search Files</button>
                <button onClick={() => state.setShowVersionHistory(true)} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-forge-text rounded-lg hover:bg-forge-surface transition-colors"><History className="w-4 h-4 text-forge-text-dim" /> Version History</button>
                <button onClick={() => { state.setShowDeployPanel(true); actions.handleMobileTabSwitch('chat') }} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-forge-text rounded-lg hover:bg-forge-surface transition-colors"><Rocket className="w-4 h-4 text-forge-text-dim" /> Deploy</button>
                <button onClick={() => state.setShowEditorSettings(true)} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-forge-text rounded-lg hover:bg-forge-surface transition-colors"><Keyboard className="w-4 h-4 text-forge-text-dim" /> Editor Settings</button>
                <button onClick={() => state.setShowMcpManager(true)} className="flex items-center gap-3 w-full px-3 py-2.5 text-sm text-forge-text rounded-lg hover:bg-forge-surface transition-colors"><Plug className="w-4 h-4 text-forge-text-dim" /> MCP Servers</button>
              </div>
              <div className="px-4 py-2 border-t border-forge-border"><span className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">Integrations</span></div>
              <div className="flex-1 overflow-y-auto">
                <SidebarContent activeTab={state.sidebarTab || 'git'} {...sidebarContentProps} />
                <div className="flex items-center gap-1 p-3 border-t border-forge-border">
                  {(['anthropic', 'git', 'deploy', 'env', 'db', 'snapshots'] as SidebarTab[]).map(tab => (
                    <button key={tab} onClick={() => state.setSidebarTab(tab)} className={cn('px-2.5 py-1.5 text-[11px] rounded-lg transition-colors capitalize', (state.sidebarTab || 'git') === tab ? 'bg-forge-surface text-forge-text font-medium' : 'text-forge-text-dim hover:text-forge-text')}>{tab}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Mobile tab bar */}
        <div className="flex items-center justify-around border-t border-forge-border/60 bg-forge-panel/80 backdrop-blur-md py-2 pb-3 shrink-0 safe-bottom">
          {MOBILE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => { navigator.vibrate?.(5); actions.handleMobileTabSwitch(tab.id) }}
              aria-label={tab.label}
              className={cn('relative flex flex-col items-center gap-0.5 px-5 py-2 rounded-xl transition-all min-w-[68px] min-h-[50px] focus:outline-none focus-visible:ring-2 focus-visible:ring-forge-accent/50 active:scale-95', state.mobileTab === tab.id ? 'text-forge-accent' : 'text-forge-text-dim active:bg-forge-surface')}
            >
              {state.mobileTab === tab.id && <motion.div layoutId="mobile-tab-bg" className="absolute inset-0 bg-forge-accent/10 rounded-xl shadow-sm" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
              <div className="relative">
                <tab.Icon className={cn('w-5 h-5 transition-transform duration-200', state.mobileTab === tab.id && 'scale-110')} />
                {tab.id === 'preview' && wc.previewUrl && state.mobileTab !== 'preview' && <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-forge-accent animate-pulse-dot" />}
              </div>
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
        <PWAInstallPrompt />
      </div>

      {/* ═══ Dialogs & Overlays ═══ */}
      {state.showDeployPanel && (
        <DeployPanel projectId={projectId} files={files} projectName={projectName} onClose={() => state.setShowDeployPanel(false)} onSuccess={actions.handleDialogSuccess} onFix={actions.handleDialogFix} onFilesFixed={(fixedFiles) => onBulkFileUpdate({ ...files, ...fixedFiles })} />
      )}
      <TaskPollingDialog open={state.activeDialog === 'create-repo'} onClose={() => state.setActiveDialog(null)} title="Create GitHub Repository" description="Create a new GitHub repository and push all project files." confirmLabel="Create & Push" taskType="github_create" projectId={projectId}
        fields={[
          { name: 'repoName', label: 'Repository Name', placeholder: projectName.replace(/\s+/g, '-').toLowerCase(), required: true, defaultValue: projectName.replace(/\s+/g, '-').toLowerCase() },
          { name: 'description', label: 'Description', placeholder: 'Built with Forge' },
        ]}
        buildParams={(fv) => ({ repoName: fv.repoName, description: fv.description || 'Built with Forge', isPublic: false, files, githubToken })}
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
            { name: 'message', label: 'Commit Message', placeholder: 'Update from Forge', defaultValue: 'Update from Forge' },
          ]
        })()}
        buildParams={(fv) => ({ owner: fv.owner, repo: fv.repo, message: fv.message || 'Update from Forge', files, githubToken })}
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
          <div className="w-[900px] h-[600px] max-w-[95vw] max-h-[85vh] rounded-2xl border border-forge-border shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}><DbExplorer /></div>
        </div>
      )}
      {state.showComponentLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => state.setShowComponentLibrary(false)}>
          <div className="w-[500px] h-[600px] max-w-[95vw] max-h-[85vh] rounded-2xl border border-forge-border shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <ComponentLibrary onInsert={(code) => { state.chatSendRef.current?.(code); state.setShowComponentLibrary(false) }} />
          </div>
        </div>
      )}
      <MCPManager isOpen={state.showMcpManager} onClose={() => state.setShowMcpManager(false)} />
      <OnboardingTour />
    </div>
  )
}
