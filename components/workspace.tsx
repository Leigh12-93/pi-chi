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
import { ConsolePanel, type ConsoleEntry } from './console-panel'
import { OnboardingTour } from './onboarding-tour'
import { VersionHistory, type Snapshot } from './version-history'
import { DiffViewer } from './diff-viewer'
import { NotificationCenter, type Notification } from './notification-center'
import { FindReplacePanel } from './find-replace-panel'
import { SettingsDialog } from './settings-dialog'
import { AuditPanel, type AuditPlan } from './audit-panel'
import { DbExplorer } from './db-explorer'
import { ComponentLibrary } from './component-library'
import { MCPManager } from './mcp-manager'
import { useKeyboardShortcuts } from '@/lib/keyboard-shortcuts'
import { useWebcontainer } from '@/hooks/use-webcontainer'
import { detectFramework } from '@/lib/vercel'
import { MessageSquare, FolderTree, Code2, Eye, Loader2, Save, Rocket, Upload, GitBranch, Download, SidebarOpen, FolderInput, Keyboard, Settings2, Search, History, Terminal, Plug, Pin, PinOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { FileNode } from '@/lib/types'
import { buildTreeFromMap } from '@/lib/virtual-fs'

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
  onManualSave?: () => Promise<void>
  onUpdateSettings?: (settings: { name?: string; description?: string }) => void
  initialPendingMessage?: string | null
  onInitialPendingMessageSent?: () => void
  githubRepoUrl?: string | null
}

type MobileTab = 'chat' | 'files' | 'code' | 'preview'
type DialogType = 'push' | 'create-repo' | 'import' | null

export function Workspace({
  projectName, projectId, files, activeFile,
  onFileSelect, onFileChange, onFileDelete, onBulkFileUpdate, onSwitchProject,
  githubToken, autoSaveError, onManualSave, onUpdateSettings,
  initialPendingMessage, onInitialPendingMessageSent, githubRepoUrl,
}: WorkspaceProps) {
  const [rightTab, setRightTab] = useState<'code' | 'preview' | 'split' | 'terminal'>('code')
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')
  const [openFiles, setOpenFiles] = useState<string[]>([])

  const [activeDialog, setActiveDialog] = useState<DialogType>(null)
  const [showDeployPanel, setShowDeployPanel] = useState(false)
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
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [showEditorSettings, setShowEditorSettings] = useState(false)
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<'general' | 'editor' | 'api-key' | 'vercel' | 'supabase' | undefined>(undefined)
  const [diffState, setDiffState] = useState<{ open: boolean; path: string; oldContent: string; newContent: string } | null>(null)
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set())
  const [auditPlan, setAuditPlan] = useState<AuditPlan | null>(null)
  const [showDbExplorer, setShowDbExplorer] = useState(false)
  const [showComponentLibrary, setShowComponentLibrary] = useState(false)
  const [showMcpManager, setShowMcpManager] = useState(false)
  const dragCounterRef = useRef(0)
  const chatSendRef = useRef<((message: string) => void) | null>(null)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab | null>(null)
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [sidebarHovered, setSidebarHovered] = useState(false)
  const sidebarLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const sidebarVisible = sidebarPinned || sidebarHovered
  const [vercelProjectId, setVercelProjectId] = useState<string | null>(null)
  const initialFilesRef = useRef<Record<string, string>>({})
  const filesRef = useRef(files)
  filesRef.current = files

  // ─── AI edit highlight + diff tracking ──────────────────────
  const [aiEditingFiles, setAiEditingFiles] = useState<Set<string>>(new Set())
  const [fileDiffs, setFileDiffs] = useState<Map<string, { added: number; removed: number }>>(new Map())
  const aiEditTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // ─── WebContainer integration ──────────────────────────────
  const hasPackageJson = 'package.json' in files
  const wc = useWebcontainer({
    files,
    enabled: hasPackageJson && Object.keys(files).length > 0,
    onTerminalOutput: (data) => {
      setConsoleEntries(prev => [...prev.slice(-200), {
        id: `wc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: 'info' as const,
        message: data,
        timestamp: Date.now(),
      }])
    },
  })

  // Sync individual file changes to WebContainer
  const prevFilesRef = useRef<Record<string, string>>(files)
  useEffect(() => {
    if (wc.status !== 'ready') return
    const prev = prevFilesRef.current
    for (const [path, content] of Object.entries(files)) {
      if (prev[path] !== content) {
        wc.syncFile(path, content)
      }
    }
    // Handle deletions
    for (const path of Object.keys(prev)) {
      if (!(path in files)) {
        wc.deleteFile(path)
      }
    }
    prevFilesRef.current = { ...files }
  }, [files, wc.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Terminal action + audit plan event listeners ─────────
  useEffect(() => {
    const handleTerminalAction = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      // Switch to terminal tab to show the action
      setRightTab('terminal')
      // If WebContainer is ready, spawn the command
      if (wc.status === 'ready' && detail.command) {
        const parts = detail.command.split(' ')
        wc.spawn(parts[0], parts.slice(1)).catch(() => {})
      }
    }
    const handleAuditPlan = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail) setAuditPlan(detail as AuditPlan)
    }
    window.addEventListener('forge:terminal-action', handleTerminalAction)
    window.addEventListener('forge:audit-plan', handleAuditPlan)
    return () => {
      window.removeEventListener('forge:terminal-action', handleTerminalAction)
      window.removeEventListener('forge:audit-plan', handleAuditPlan)
    }
  }, [wc.status]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── AI file-edit highlight + diff tracking ──────────────────
  useEffect(() => {
    const handleFileEdited = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.paths) return
      const paths = detail.paths as string[]

      // Add paths to aiEditingFiles set (triggers pulse animation)
      setAiEditingFiles(prev => {
        const next = new Set(prev)
        paths.forEach(p => next.add(p))
        return next
      })

      // Compute line diffs for each edited file
      setFileDiffs(prev => {
        const next = new Map(prev)
        for (const path of paths) {
          const oldContent = initialFilesRef.current[path] || ''
          const newContent = filesRef.current[path] || ''
          const oldLines = oldContent.split('\n')
          const newLines = newContent.split('\n')
          const oldSet = new Set(oldLines)
          const newSet = new Set(newLines)
          const added = newLines.filter(l => !oldSet.has(l)).length
          const removed = oldLines.filter(l => !newSet.has(l)).length
          if (added > 0 || removed > 0) {
            next.set(path, { added, removed })
          }
        }
        return next
      })

      // Remove from aiEditingFiles after animation completes (1.5s)
      for (const path of paths) {
        const existing = aiEditTimersRef.current.get(path)
        if (existing) clearTimeout(existing)
        aiEditTimersRef.current.set(path, setTimeout(() => {
          setAiEditingFiles(prev => {
            const next = new Set(prev)
            next.delete(path)
            return next
          })
          aiEditTimersRef.current.delete(path)
        }, 1500))
      }
    }

    window.addEventListener('forge:file-edited', handleFileEdited)
    return () => {
      window.removeEventListener('forge:file-edited', handleFileEdited)
      // Clean up timers
      aiEditTimersRef.current.forEach(t => clearTimeout(t))
      aiEditTimersRef.current.clear()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Smart panel auto-switching state ──────────────────────
  const [aiLoading, setAiLoading] = useState(false)
  const userManualSwitchRef = useRef(false)  // true when user manually clicked a tab
  const userSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevAiLoadingRef = useRef(false)
  const fileCountAtStartRef = useRef(0)  // file count when AI started

  // Load snapshots from API on mount
  useEffect(() => {
    if (!projectId) return
    setSnapshotsLoaded(false)
    fetch(`/api/projects/${projectId}/snapshots`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setSnapshots(data.map((s: any) => ({
            id: s.id,
            label: s.description || 'Snapshot',
            timestamp: new Date(s.created_at).getTime(),
            files: {}, // Files loaded on demand when restoring
            fileCount: s.file_count,
          })))
        }
      })
      .catch(() => {})
      .finally(() => setSnapshotsLoaded(true))
  }, [projectId])

  // Forward initial pending message from parent (e.g., Quick Start query)
  useEffect(() => {
    if (initialPendingMessage) {
      setPendingChatMessage(initialPendingMessage)
      onInitialPendingMessageSent?.()
    }
  }, [initialPendingMessage, onInitialPendingMessageSent])

  // Capture initial file state on first render to track modifications
  useEffect(() => {
    if (Object.keys(initialFilesRef.current).length === 0 && Object.keys(files).length > 0) {
      initialFilesRef.current = { ...files }
    }
  }, [files])

  // Track which files have been modified from their initial state
  useEffect(() => {
    const initial = initialFilesRef.current
    const modified = new Set<string>()
    for (const [path, content] of Object.entries(files)) {
      if (!(path in initial)) {
        modified.add(path) // New file
      } else if (initial[path] !== content) {
        modified.add(path) // Changed content
      }
    }
    setModifiedFiles(modified)
  }, [files])

  // Only recompute tree when file PATHS change, not on content edits
  const filePathsKey = useMemo(() => Object.keys(files).sort().join('\0'), [files])
  const fileTree = useMemo(() => buildTreeFromMap(files), [filePathsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const prevFileKeysRef = useRef<Set<string>>(new Set())
  const pendingNewFilesRef = useRef<string[]>([])
  const pendingDeletedFilesRef = useRef<string[]>([])
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reset prevFileKeysRef on project switch to prevent phantom "new file" toasts
  useEffect(() => {
    prevFileKeysRef.current = new Set(Object.keys(files))
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Ref to avoid stale closure in handleDrop
  const handleFileSelectRef = useRef<(path: string) => void>(() => {})

  const handleFileSelect = useCallback((path: string) => {
    onFileSelect(path)
    setOpenFiles(prev => prev.includes(path) ? prev : [...prev, path])
    // Only switch to code tab if user is on files tab (manual browsing)
    // Don't switch if on chat or preview — let smart switching handle it
    setMobileTab(prev => prev === 'files' ? 'code' : prev)
  }, [onFileSelect])

  handleFileSelectRef.current = handleFileSelect

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
    let skipped = 0
    const newFiles: Record<string, string> = {}
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
        // Use webkitRelativePath for directory drops (preserves folder structure),
        // fall back to file.name for single-file drops
        const filePath = file.webkitRelativePath
          ? file.webkitRelativePath.split('/').slice(1).join('/') || file.name
          : file.name
        newFiles[filePath] = text
      } catch {
        toast.error(`Failed to read ${file.name}`)
      }
    }

    const count = Object.keys(newFiles).length

    // File count guard on bulk import
    if (count > 200) {
      console.warn(`Bulk import: ${count} files — this may be slow`)
    }

    if (skipped > 0) {
      toast.info(`Skipped ${skipped} binary file${skipped > 1 ? 's' : ''}`, { duration: 2000 })
    }
    if (count > 0) {
      // Batch state update via onBulkFileUpdate instead of individual onFileChange calls
      onBulkFileUpdate({ ...filesRef.current, ...newFiles })
      toast.success(`${count} file${count > 1 ? 's' : ''} imported`, { duration: 2500 })
      if (count === 1) handleFileSelectRef.current(Object.keys(newFiles)[0])
    }
  }, [onBulkFileUpdate])

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

  // Show toast when auto-save fails
  useEffect(() => {
    if (autoSaveError) {
      setSaveStatus('error')
      toast.error('Auto-save failed', { description: 'Changes may not be saved. Try saving manually with Ctrl+S.' })
    }
  }, [autoSaveError])

  // Warn before closing tab when auto-save has failed (unsaved changes)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (autoSaveError) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [autoSaveError])

  const handleSave = useCallback(async () => {
    if (!projectId || Object.keys(files).length === 0) return
    // Cancel pending auto-save timer and sync hash in parent
    onManualSave?.()
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      })
      if (res.ok) {
        setSaveStatus('saved')
        // Create a snapshot via API for version history
        fetch(`/api/projects/${projectId}/snapshots`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: `Save ${snapshots.length + 1}`, files }),
        }).then(r => r.json()).then(data => {
          if (data.id) {
            setSnapshots(prev => [{
              id: data.id,
              label: data.description || `Save ${prev.length + 1}`,
              timestamp: new Date(data.created_at || Date.now()).getTime(),
              files: { ...files },
            }, ...prev].slice(0, 50))
          }
        }).catch(() => {})
        toast.success('Project saved', { description: `${Object.keys(files).length} files saved` })
      } else {
        console.error(`Auto-save failed: ${res.status}`)
        setSaveStatus('error')
        toast.error('Save failed', { description: `Could not save to database (HTTP ${res.status})` })
      }
      setTimeout(() => setSaveStatus('idle'), 2000)
    } catch {
      setSaveStatus('error')
      toast.error('Save failed', { description: 'Network error' })
      setTimeout(() => setSaveStatus('idle'), 2000)
    }
  }, [projectId, files, onManualSave])

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
        // Auto-snapshot before deploy (non-blocking)
        if (projectId && Object.keys(files).length > 0) {
          fetch(`/api/projects/${projectId}/snapshots`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ description: 'Pre-deploy snapshot', files }),
          }).then(r => r.json()).then(data => {
            if (data.id) {
              setSnapshots(prev => [{
                id: data.id,
                label: 'Pre-deploy snapshot',
                timestamp: new Date(data.created_at || Date.now()).getTime(),
                files: { ...files },
              }, ...prev].slice(0, 50))
            }
          }).catch(() => {})
        }
        setShowDeployPanel(true)
        break
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

  const handleCloseFile = useCallback((path: string) => {
    setOpenFiles(prev => {
      const remaining = prev.filter(f => f !== path)
      // If closing the active file, select the last remaining file
      if (activeFile === path) {
        onFileSelect(remaining[remaining.length - 1] || '')
      }
      return remaining
    })
  }, [activeFile, onFileSelect])

  const handleReorderTabs = useCallback((from: number, to: number) => {
    setOpenFiles(prev => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }, [])

  const handleFileRename = (oldPath: string, newPath: string) => {
    setOpenFiles(prev => prev.map(f => f === oldPath ? newPath : f))
    if (activeFile === oldPath) onFileSelect(newPath)
    if (files[oldPath] !== undefined) {
      const updated = { ...files }
      updated[newPath] = updated[oldPath]
      delete updated[oldPath]
      onBulkFileUpdate(updated, { replace: true })
    }
  }

  // Keyboard shortcuts
  useKeyboardShortcuts([
    { key: 'k', ctrlKey: true, action: () => setShowCommandPalette(prev => !prev), description: 'Command palette' },
    { key: 'p', ctrlKey: true, shiftKey: true, action: () => setRightTab(prev => prev === 'code' ? 'split' : prev === 'split' ? 'preview' : 'code'), description: 'Cycle view mode' },
    { key: 'b', ctrlKey: true, action: () => setSidebarTab(prev => prev ? null : 'git'), description: 'Toggle sidebar' },
    { key: 'w', ctrlKey: true, action: () => { if (activeFile) handleCloseFile(activeFile) }, description: 'Close current file' },
    { key: '/', ctrlKey: true, action: () => setShowShortcuts(prev => !prev), description: 'Keyboard shortcuts' },
    { key: 'f', ctrlKey: true, action: () => setShowFileSearch(prev => !prev), description: 'Search in files' },
    { key: 'h', ctrlKey: true, action: () => setShowFindReplace(prev => !prev), description: 'Find & replace' },
    { key: ',', ctrlKey: true, action: () => setShowEditorSettings(prev => !prev), description: 'Editor settings' },
  ])

  // ─── Smart mobile view switching ─────────────────────────────
  // Track when files are created/modified by AI and auto-switch to preview on mobile.
  // Stays on chat if the user is actively typing or if there are errors.
  const prevFileCountRef = useRef(Object.keys(files).length)
  const mobileAutoSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const userInteractingRef = useRef(false)

  // Mark user as interacting when they explicitly switch tabs
  const handleMobileTabSwitch = useCallback((tab: MobileTab) => {
    userInteractingRef.current = true
    setMobileTab(tab)
    // Reset after 10s — so auto-switching resumes once user is idle
    setTimeout(() => { userInteractingRef.current = false }, 10000)
  }, [])

  useEffect(() => {
    const currentCount = Object.keys(files).length
    const prevCount = prevFileCountRef.current
    prevFileCountRef.current = currentCount

    // Only auto-switch on mobile when NOT in preview and files were added/modified
    if (currentCount > prevCount && currentCount >= 3 && mobileTab === 'chat' && !userInteractingRef.current) {
      // Debounce to avoid flickering during rapid AI writes
      if (mobileAutoSwitchTimerRef.current) clearTimeout(mobileAutoSwitchTimerRef.current)
      mobileAutoSwitchTimerRef.current = setTimeout(() => {
        setMobileTab('preview')
      }, 3000) // Wait 3s for AI to finish the current batch before switching
    }

    return () => {
      if (mobileAutoSwitchTimerRef.current) clearTimeout(mobileAutoSwitchTimerRef.current)
    }
  }, [files, mobileTab])

  // Auto-switch back to chat when a pending chat message is set (error fix, deploy feedback, etc.)
  useEffect(() => {
    if (pendingChatMessage && mobileTab !== 'chat') {
      setMobileTab('chat')
    }
  }, [pendingChatMessage, mobileTab])

  // ─── Smart desktop panel auto-switching ────────────────────
  // When AI starts: show code so user can watch files being written.
  // When AI finishes AND wrote files: auto-switch to preview after a short delay.
  // When preview reports ready: switch to preview.
  // All auto-switches are suppressed if user manually clicked a tab recently.

  const handleAiLoadingChange = useCallback((loading: boolean) => {
    setAiLoading(loading)
  }, [])

  // Track AI start/stop — switch to code on start, preview on finish
  useEffect(() => {
    const wasLoading = prevAiLoadingRef.current
    prevAiLoadingRef.current = aiLoading

    if (aiLoading && !wasLoading) {
      // AI just started — show code tab so user can watch files being written
      fileCountAtStartRef.current = Object.keys(files).length
      if (!userManualSwitchRef.current) {
        setRightTab('code')
      }
    }

    if (!aiLoading && wasLoading) {
      // AI just finished — if files were created/changed, switch to preview after brief delay
      const currentCount = Object.keys(files).length
      if (currentCount > fileCountAtStartRef.current && !userManualSwitchRef.current) {
        // Delay to let preview panel debounce + sandbox sync catch up
        const timer = setTimeout(() => {
          if (!userManualSwitchRef.current) {
            setRightTab('preview')
          }
        }, 1500)
        return () => clearTimeout(timer)
      }
    }
  }, [aiLoading, files])

  // Preview ready callback — auto-switch to preview
  const handlePreviewReady = useCallback(() => {
    // Only auto-switch if AI is not currently streaming (otherwise stay on code)
    if (!aiLoading && !userManualSwitchRef.current && Object.keys(files).length >= 3) {
      setRightTab('preview')
    }
  }, [aiLoading, files])

  // Cleanup manual switch timer on unmount
  useEffect(() => {
    return () => {
      if (userSwitchTimerRef.current) clearTimeout(userSwitchTimerRef.current)
    }
  }, [])

  const paletteCommands = useMemo(() => [
    { id: 'save', label: 'Save Project', description: 'Save all files to database', shortcut: 'Ctrl+S', icon: Save, category: 'actions' as const, action: handleSave },
    { id: 'deploy', label: 'Deploy to Vercel', description: 'Create production deployment', icon: Rocket, category: 'actions' as const, action: () => setShowDeployPanel(true) },
    { id: 'push', label: 'Push to GitHub', description: 'Push files to a repository', icon: Upload, category: 'actions' as const, action: () => setActiveDialog('push') },
    { id: 'create-repo', label: 'Create GitHub Repo', description: 'Create a new repository', icon: GitBranch, category: 'actions' as const, action: () => setActiveDialog('create-repo') },
    { id: 'import', label: 'Import from GitHub', description: 'Import files from a GitHub repository', icon: FolderInput, category: 'actions' as const, action: () => setActiveDialog('import') },
    { id: 'download', label: 'Download as ZIP', description: 'Download all project files', icon: Download, category: 'actions' as const, action: handleDownload },
    { id: 'toggle-preview', label: 'Toggle Preview', description: 'Switch between code and preview', shortcut: 'Ctrl+Shift+P', icon: Eye, category: 'view' as const, action: () => setRightTab(prev => prev === 'code' ? 'preview' : 'code') },
    { id: 'toggle-sidebar', label: 'Toggle Sidebar', description: 'Show or hide the sidebar', shortcut: 'Ctrl+B', icon: SidebarOpen, category: 'view' as const, action: () => setSidebarTab(prev => prev ? null : 'git') },
    { id: 'close-file', label: 'Close Current File', shortcut: 'Ctrl+W', icon: Code2, category: 'view' as const, action: () => { if (activeFile) handleCloseFile(activeFile) } },
    { id: 'switch-project', label: 'Switch Project', description: 'Go back to project picker', icon: FolderTree, category: 'navigation' as const, action: onSwitchProject },
    { id: 'shortcuts', label: 'Keyboard Shortcuts', description: 'View all keyboard shortcuts', shortcut: 'Ctrl+/', icon: Keyboard, category: 'view' as const, action: () => setShowShortcuts(true) },
    { id: 'settings', label: 'Project Settings', description: 'Edit project name and settings', icon: Settings2, category: 'actions' as const, action: () => setShowSettings(true) },
    { id: 'search-files', label: 'Search in Files', description: 'Search text across all project files', shortcut: 'Ctrl+F', icon: Search, category: 'navigation' as const, action: () => setShowFileSearch(true) },
    { id: 'split-view', label: 'Split View', description: 'Show code and preview side by side', icon: Code2, category: 'view' as const, action: () => setRightTab('split') },
    { id: 'version-history', label: 'Version History', description: 'View and restore previous snapshots', icon: History, category: 'navigation' as const, action: () => setShowVersionHistory(true) },
    { id: 'db-explorer', label: 'Database Explorer', description: 'Browse and query Forge database tables', icon: Terminal, category: 'navigation' as const, action: () => setShowDbExplorer(true) },
    { id: 'component-library', label: 'Component Library', description: 'Browse pre-built components to add', icon: FolderTree, category: 'navigation' as const, action: () => setShowComponentLibrary(true) },
    { id: 'mcp-servers', label: 'MCP Servers', description: 'Manage external MCP server connections', icon: Plug, category: 'actions' as const, action: () => setShowMcpManager(true) },
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
      activeFile={activeFile}
      onLoadingChange={handleAiLoadingChange}
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
      modifiedFiles={modifiedFiles}
      aiEditingFiles={aiEditingFiles}
      fileDiffs={fileDiffs}
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
              'group relative flex items-center gap-1 px-3 sm:px-2.5 py-2 sm:py-1.5 text-xs rounded-md cursor-pointer transition-all whitespace-nowrap border',
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
              &times;
            </button>
            {isActive && (
              <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-forge-accent rounded-full" />
            )}
          </div>
        )
      })}
    </div>
  )

  const editorPanel = (
    <div className="h-full flex flex-col bg-forge-surface">
      <div className="flex items-center border-b border-forge-border bg-forge-panel">
        {(['code', 'split', 'preview', 'terminal'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => {
              setRightTab(tab)
              // Mark as manual switch — prevents auto-switching for 15s
              userManualSwitchRef.current = true
              if (userSwitchTimerRef.current) clearTimeout(userSwitchTimerRef.current)
              userSwitchTimerRef.current = setTimeout(() => { userManualSwitchRef.current = false }, 15000)
            }}
            className={`relative px-4 py-2 text-xs font-medium transition-colors ${
              rightTab === tab ? 'text-forge-accent bg-forge-surface' : 'text-forge-text-dim hover:text-forge-text'
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
            {rightTab === tab && (
              <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-forge-accent rounded-full transition-all" />
            )}
          </button>
        ))}
        {(rightTab === 'code' || rightTab === 'split') && openFiles.length > 0 && (
          <div className="flex-1 min-w-0 ml-2 border-l border-forge-border">
            <EditorTabs
              openFiles={openFiles}
              activeFile={activeFile}
              onFileSelect={onFileSelect}
              onCloseFile={handleCloseFile}
              onReorder={handleReorderTabs}
              modifiedFiles={modifiedFiles}
            />
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
              <PreviewPanel files={files} projectId={projectId} onFixErrors={(msg) => setPendingChatMessage(msg)} onCapturePreview={(msg) => setPendingChatMessage(msg)} onPreviewReady={handlePreviewReady} wcPreviewUrl={wc.previewUrl} />
            </Panel>
          </PanelGroup>
        ) : rightTab === 'terminal' ? (
          <TerminalPanel
            getShellProcess={wc.getShellProcess}
            wcReady={wc.status === 'ready'}
          />
        ) : (
          <PreviewPanel files={files} projectId={projectId} onFixErrors={(msg) => setPendingChatMessage(msg)} onCapturePreview={(msg) => setPendingChatMessage(msg)} onPreviewReady={handlePreviewReady} wcPreviewUrl={wc.previewUrl} />
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
        githubRepoUrl={githubRepoUrl}
      />

      {/* Desktop layout: Chat | Editor — Sidebar slides in from left on hover */}
      <div className="flex-1 hidden md:flex overflow-hidden relative">

        {/* Hover trigger zone — thin strip on left edge */}
        {!sidebarVisible && (
          <div
            className="absolute left-0 top-0 bottom-0 w-2 z-40"
            onMouseEnter={() => {
              if (sidebarLeaveTimer.current) { clearTimeout(sidebarLeaveTimer.current); sidebarLeaveTimer.current = null }
              setSidebarHovered(true)
            }}
          />
        )}

        {/* Sidebar tray — slides in from left, contains ActivityBar + content */}
        {sidebarVisible && (
          <div
            className={cn(
              'absolute left-0 top-0 bottom-0 z-30 flex shadow-xl sidebar-tray',
              !sidebarPinned && 'sidebar-unpinned',
            )}
            onMouseEnter={() => {
              if (sidebarLeaveTimer.current) { clearTimeout(sidebarLeaveTimer.current); sidebarLeaveTimer.current = null }
              setSidebarHovered(true)
            }}
            onMouseLeave={() => {
              if (!sidebarPinned) {
                sidebarLeaveTimer.current = setTimeout(() => setSidebarHovered(false), 300)
              }
            }}
          >
            <ActivityBar activeTab={sidebarTab} onTabChange={(tab) => {
              setSidebarTab(tab)
              // Clicking a tab pins the sidebar open
              if (tab) setSidebarPinned(true)
            }} />

            {sidebarTab && (
              <div className="w-[260px] bg-forge-panel border-r border-forge-border flex flex-col overflow-hidden">
                {/* Pin/unpin header */}
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-forge-border shrink-0">
                  <span className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">
                    {sidebarTab ? sidebarTab.charAt(0).toUpperCase() + sidebarTab.slice(1) : ''}
                  </span>
                  <button
                    onClick={() => {
                      if (sidebarPinned) {
                        setSidebarPinned(false)
                        setSidebarHovered(false)
                      } else {
                        setSidebarPinned(true)
                      }
                    }}
                    title={sidebarPinned ? 'Unpin sidebar' : 'Pin sidebar'}
                    className="p-1 rounded text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
                  >
                    {sidebarPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <SidebarContent
              activeTab={sidebarTab}
              fileTree={fileTree}
              activeFile={activeFile}
              onFileSelect={handleFileSelect}
              onFileDelete={onFileDelete}
              onFileRename={handleFileRename}
              onFileCreate={handleFileCreate}
              fileContents={files}
              modifiedFiles={modifiedFiles}
              aiEditingFiles={aiEditingFiles}
              fileDiffs={fileDiffs}
              githubRepoUrl={githubRepoUrl || null}
              projectId={projectId}
              vercelProjectId={vercelProjectId}
              onAction={handleAction}
              onFileChange={onFileChange}
              onOpenDbExplorer={() => setShowDbExplorer(true)}
              onOpenSettings={() => { setSettingsDefaultTab('supabase'); setShowEditorSettings(true) }}
              onRepoConnected={(url) => toast.success('Repository connected', { description: url.replace('https://github.com/', '') })}
              onVercelConnected={(id) => { setVercelProjectId(id); toast.success('Vercel project connected') }}
              snapshots={snapshots}
              onOpenVersionHistory={() => setShowVersionHistory(true)}
              onRestoreSnapshot={async (snap) => {
                // If snapshot has files loaded, use them directly; otherwise fetch from API
                if (Object.keys(snap.files).length > 0) {
                  onBulkFileUpdate(snap.files, { replace: true })
                  toast.success('Snapshot restored', { description: snap.label })
                } else if (projectId) {
                  try {
                    const res = await fetch(`/api/projects/${projectId}/snapshots/${snap.id}`)
                    const data = await res.json()
                    if (data.files) {
                      onBulkFileUpdate(data.files, { replace: true })
                      toast.success('Snapshot restored', { description: snap.label })
                    } else {
                      toast.error('Failed to load snapshot files')
                    }
                  } catch {
                    toast.error('Failed to restore snapshot')
                  }
                }
              }}
              onCreateSnapshot={async () => {
                if (!projectId) return
                try {
                  const res = await fetch(`/api/projects/${projectId}/snapshots`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      description: `Snapshot ${snapshots.length + 1}`,
                      files,
                    }),
                  })
                  const data = await res.json()
                  if (res.ok) {
                    setSnapshots(prev => [{
                      id: data.id || `snap-${Date.now()}`,
                      label: data.description || `Snapshot ${prev.length + 1}`,
                      timestamp: new Date(data.created_at || Date.now()).getTime(),
                      files: { ...files },
                    }, ...prev].slice(0, 50))
                    toast.success('Snapshot created')
                  } else {
                    toast.error('Failed to create snapshot')
                  }
                } catch {
                  toast.error('Failed to create snapshot')
                }
              }}
            />
                </div>
              </div>
            )}
          </div>
        )}

        <PanelGroup direction="horizontal" autoSaveId="forge-workspace-v3">
          <Panel defaultSize={25} minSize={15} maxSize={45}>
            {chatPanel}
          </Panel>
          <PanelResizeHandle />
          <Panel defaultSize={15} minSize={8} maxSize={25}>
            <div className="h-full overflow-y-auto bg-forge-panel border-r border-forge-border">
              <FileTree
                files={fileTree}
                activeFile={activeFile}
                onFileSelect={handleFileSelect}
                onFileDelete={onFileDelete}
                onFileRename={handleFileRename}
                onFileCreate={handleFileCreate}
                fileContents={files}
                modifiedFiles={modifiedFiles}
                aiEditingFiles={aiEditingFiles}
                fileDiffs={fileDiffs}
              />
            </div>
          </Panel>
          <PanelResizeHandle />
          <Panel defaultSize={60} minSize={30}>
            <div className="h-full flex flex-col overflow-hidden">
              <div className="flex-1 overflow-hidden">
                {editorPanel}
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
                framework={detectFramework(files)}
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
          {mobileTab === 'preview' && <PreviewPanel files={files} projectId={projectId} onFixErrors={(msg) => { setPendingChatMessage(msg) }} onCapturePreview={(msg) => { setPendingChatMessage(msg) }} onPreviewReady={handlePreviewReady} wcPreviewUrl={wc.previewUrl} />}
        </div>

        <div className="flex items-center justify-around border-t border-forge-border bg-forge-panel py-1.5 shrink-0 safe-bottom">
          {MOBILE_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => handleMobileTabSwitch(tab.id)}
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

      {/* Deploy Panel (non-blocking floating) */}
      {showDeployPanel && (
        <DeployPanel
          projectId={projectId}
          files={files}
          projectName={projectName}
          onClose={() => setShowDeployPanel(false)}
          onSuccess={handleDialogSuccess}
          onFix={handleDialogFix}
          onFilesFixed={(fixedFiles) => {
            // Sync auto-fixed files back into the workspace
            const updated = { ...files, ...fixedFiles }
            onBulkFileUpdate(updated)
          }}
        />
      )}

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
            const failedCount = data.failedFiles?.length || 0
            const warnings: string[] = []
            if (skippedCount > 0) warnings.push(`${skippedCount} skipped`)
            if (failedCount > 0) warnings.push(`${failedCount} failed to fetch`)
            toast.success(`Imported ${data.fileCount} files${warnings.length ? ` (${warnings.join(', ')})` : ''}`, {
              description: `From ${fieldValues.owner}/${fieldValues.repo}${data.branch ? ` (${data.branch})` : ''}`,
              duration: (skippedCount || failedCount) ? 5000 : 3000,
            })
            if (failedCount > 0) {
              toast.warning(`${failedCount} file${failedCount > 1 ? 's' : ''} failed to import`, {
                description: data.failedFiles.slice(0, 5).join(', ') + (failedCount > 5 ? ` +${failedCount - 5} more` : ''),
                duration: 6000,
              })
            }
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
        framework={detectFramework(files)}
        onUpdateSettings={onUpdateSettings || (() => {})}
      />

      {/* Version History */}
      <VersionHistory
        open={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        snapshots={snapshots}
        currentFiles={files}
        onRestore={(snapshot) => {
          onBulkFileUpdate(snapshot.files, { replace: true })
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

      {/* Find & Replace */}
      <FindReplacePanel
        open={showFindReplace}
        onClose={() => setShowFindReplace(false)}
        files={files}
        onReplace={onFileChange}
        activeFile={activeFile}
      />

      {/* Editor Settings */}
      <SettingsDialog
        open={showEditorSettings}
        onClose={() => { setShowEditorSettings(false); setSettingsDefaultTab(undefined) }}
        defaultTab={settingsDefaultTab}
      />

      {/* Audit Panel — shown as overlay when audit plan is active */}
      {auditPlan && (
        <div className="fixed bottom-16 right-4 z-40 w-[420px] max-h-[70vh] animate-slide-up">
          <AuditPanel
            plan={auditPlan}
            onApprove={() => {
              chatSendRef.current?.('[AUDIT APPROVED]')
              setAuditPlan(prev => prev ? { ...prev, status: 'in_progress' } : null)
            }}
            onReplan={(feedback) => {
              chatSendRef.current?.(`[REPLAN] feedback: ${feedback}`)
              setAuditPlan(null)
            }}
            onDismiss={() => setAuditPlan(null)}
          />
        </div>
      )}

      {/* DB Explorer Dialog */}
      {showDbExplorer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowDbExplorer(false)}>
          <div className="w-[900px] h-[600px] max-w-[95vw] max-h-[85vh] rounded-2xl border border-forge-border shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <DbExplorer />
          </div>
        </div>
      )}

      {/* Component Library Dialog */}
      {showComponentLibrary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in" onClick={() => setShowComponentLibrary(false)}>
          <div className="w-[500px] h-[600px] max-w-[95vw] max-h-[85vh] rounded-2xl border border-forge-border shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <ComponentLibrary
              onInsert={(code) => {
                chatSendRef.current?.(code)
                setShowComponentLibrary(false)
              }}
            />
          </div>
        </div>
      )}

      {/* MCP Server Manager */}
      <MCPManager isOpen={showMcpManager} onClose={() => setShowMcpManager(false)} />

      {/* Onboarding Tour */}
      <OnboardingTour />
    </div>
  )
}
