'use client'

import { useState, useRef, useMemo } from 'react'
import type { ConsoleEntry } from '@/components/console-panel'
import type { Notification } from '@/components/notification-center'
import type { Snapshot } from '@/components/version-history'
import type { AuditPlan } from '@/components/audit-panel'
import type { SidebarTab } from '@/components/sidebar'
import { buildTreeFromMap } from '@/lib/virtual-fs'

export type MobileTab = 'chat' | 'editor' | 'preview' | 'menu'
export type DialogType = 'push' | 'create-repo' | 'import' | null

export function useWorkspaceState(files: Record<string, string>, _projectId: string | null) {
  // Panel & view state
  const [rightTab, setRightTab] = useState<'code' | 'preview' | 'split' | 'terminal'>('code')
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')
  const [mobileEditorShowTree, setMobileEditorShowTree] = useState(false)
  const [openFiles, setOpenFiles] = useState<string[]>([])

  // Dialog & overlay state
  const [activeDialog, setActiveDialog] = useState<DialogType>(null)
  const [showDeployPanel, setShowDeployPanel] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showFileSearch, setShowFileSearch] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showFindReplace, setShowFindReplace] = useState(false)
  const [showEditorSettings, setShowEditorSettings] = useState(false)
  const [showDbExplorer, setShowDbExplorer] = useState(false)
  const [showComponentLibrary, setShowComponentLibrary] = useState(false)
  const [showMcpManager, setShowMcpManager] = useState(false)
  const [settingsDefaultTab, setSettingsDefaultTab] = useState<'general' | 'editor' | 'api-key' | 'vercel' | 'supabase' | undefined>(undefined)

  // Save & project state
  const [localSaveStatus, setLocalSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [pendingChatMessage, setPendingChatMessage] = useState<string | null>(null)
  const [vercelProjectId, setVercelProjectId] = useState<string | null>(null)

  // Drag & drop state
  const [isDragging, setIsDragging] = useState(false)
  const dragCounterRef = useRef(0)

  // Console & notifications
  const [consoleOpen, setConsoleOpen] = useState(false)
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])

  // Snapshots
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false)

  // Diff & file tracking state
  const [diffState, setDiffState] = useState<{ open: boolean; path: string; oldContent: string; newContent: string } | null>(null)
  const [modifiedFiles, setModifiedFiles] = useState<Set<string>>(new Set())
  const [auditPlan, setAuditPlan] = useState<AuditPlan | null>(null)

  // Sidebar state
  const [sidebarTab, setSidebarTab] = useState<SidebarTab | null>(null)
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [sidebarHovered, setSidebarHovered] = useState(false)
  const sidebarLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // AI state
  const [aiEditingFiles, setAiEditingFiles] = useState<Set<string>>(new Set())
  const [fileDiffs, setFileDiffs] = useState<Map<string, { added: number; removed: number }>>(new Map())
  const [aiLoading, setAiLoading] = useState(false)

  // Refs
  const chatSendRef = useRef<((message: string) => void) | null>(null)
  const initialFilesRef = useRef<Record<string, string>>({})
  const filesRef = useRef(files)
  filesRef.current = files
  const aiEditTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const aiAutoTabRef = useRef<string | null>(null)
  const userManualSwitchRef = useRef(false)
  const userSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevAiLoadingRef = useRef(false)
  const fileCountAtStartRef = useRef(0)
  const prevFileKeysRef = useRef<Set<string>>(new Set())
  const pendingNewFilesRef = useRef<string[]>([])
  const pendingDeletedFilesRef = useRef<string[]>([])
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleFileSelectRef = useRef<(path: string) => void>(() => {})
  const userInteractingRef = useRef(false)

  // Derived values
  const sidebarVisible = sidebarPinned || sidebarHovered
  const hasPackageJson = 'package.json' in files

  // Only recompute tree when file PATHS change, not on content edits
  const filePathsKey = useMemo(() => Object.keys(files).sort().join('\0'), [files])
  const fileTree = useMemo(() => buildTreeFromMap(files), [filePathsKey]) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Panel & view
    rightTab, setRightTab, mobileTab, setMobileTab, mobileEditorShowTree, setMobileEditorShowTree,
    openFiles, setOpenFiles,
    // Dialogs & overlays
    activeDialog, setActiveDialog, showDeployPanel, setShowDeployPanel,
    showCommandPalette, setShowCommandPalette, showShortcuts, setShowShortcuts,
    showSettings, setShowSettings, showFileSearch, setShowFileSearch,
    showVersionHistory, setShowVersionHistory, showFindReplace, setShowFindReplace,
    showEditorSettings, setShowEditorSettings, showDbExplorer, setShowDbExplorer,
    showComponentLibrary, setShowComponentLibrary, showMcpManager, setShowMcpManager,
    settingsDefaultTab, setSettingsDefaultTab,
    // Save & project
    localSaveStatus, setLocalSaveStatus, pendingChatMessage, setPendingChatMessage,
    vercelProjectId, setVercelProjectId,
    // Drag & drop
    isDragging, setIsDragging, dragCounterRef,
    // Console & notifications
    consoleOpen, setConsoleOpen, consoleEntries, setConsoleEntries,
    notifications, setNotifications,
    // Snapshots
    snapshots, setSnapshots, snapshotsLoaded, setSnapshotsLoaded,
    // Diff & file tracking
    diffState, setDiffState, modifiedFiles, setModifiedFiles, auditPlan, setAuditPlan,
    // Sidebar
    sidebarTab, setSidebarTab, sidebarPinned, setSidebarPinned,
    sidebarHovered, setSidebarHovered, sidebarLeaveTimer,
    // AI
    aiEditingFiles, setAiEditingFiles, fileDiffs, setFileDiffs, aiLoading, setAiLoading,
    // Refs
    chatSendRef, initialFilesRef, filesRef, aiEditTimersRef, aiAutoTabRef,
    userManualSwitchRef, userSwitchTimerRef, prevAiLoadingRef, fileCountAtStartRef,
    prevFileKeysRef, pendingNewFilesRef, pendingDeletedFilesRef, toastTimerRef,
    handleFileSelectRef, userInteractingRef,
    // Derived
    sidebarVisible, hasPackageJson, fileTree,
  }
}

export type WorkspaceStateReturn = ReturnType<typeof useWorkspaceState>
