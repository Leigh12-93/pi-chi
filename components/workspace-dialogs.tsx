'use client'

import { lazy, Suspense } from 'react'
import { toast } from 'sonner'
import type { WorkspaceStateReturn } from '@/hooks/use-workspace-state'
import type { Snapshot } from '@/components/version-history'
import { detectFramework } from '@/lib/vercel'

// ─── Lazy-loaded dialog components ─────────────────────────────
// These are only loaded when first opened, reducing initial bundle size.

const CommandPalette = lazy(() => import('./command-palette').then(m => ({ default: m.CommandPalette })))
const KeyboardShortcutsOverlay = lazy(() => import('./keyboard-shortcuts-overlay').then(m => ({ default: m.KeyboardShortcutsOverlay })))
const FileSearch = lazy(() => import('./file-search').then(m => ({ default: m.FileSearch })))
const ProjectSettingsDialog = lazy(() => import('./project-settings-dialog').then(m => ({ default: m.ProjectSettingsDialog })))
const VersionHistory = lazy(() => import('./version-history').then(m => ({ default: m.VersionHistory })))
const DiffViewer = lazy(() => import('./diff-viewer').then(m => ({ default: m.DiffViewer })))
const FindReplacePanel = lazy(() => import('./find-replace-panel').then(m => ({ default: m.FindReplacePanel })))
const SettingsDialog = lazy(() => import('./settings-dialog').then(m => ({ default: m.SettingsDialog })))
const AuditPanel = lazy(() => import('./audit-panel').then(m => ({ default: m.AuditPanel })))
const DbExplorer = lazy(() => import('./db-explorer').then(m => ({ default: m.DbExplorer })))
const ComponentLibrary = lazy(() => import('./component-library').then(m => ({ default: m.ComponentLibrary })))
const MCPManager = lazy(() => import('./mcp-manager').then(m => ({ default: m.MCPManager })))

interface WorkspaceDialogsProps {
  state: WorkspaceStateReturn
  files: Record<string, string>
  projectName: string
  projectId: string | null
  activeFile: string | null
  onFileChange: (path: string, content: string) => void
  onBulkFileUpdate: (files: Record<string, string>, opts?: { replace?: boolean }) => void
  onUpdateSettings?: (settings: { name?: string; description?: string }) => void
  onFileSelect: (path: string) => void
  paletteCommands: Array<{
    id: string
    label: string
    description?: string
    shortcut?: string
    icon: React.ComponentType<{ className?: string }>
    category: 'actions' | 'view' | 'navigation'
    action: () => void
  }>
  snapshots: Snapshot[]
}

/**
 * All workspace overlay dialogs, lazy-loaded behind Suspense boundaries.
 * Each dialog is only imported when its corresponding show* flag is true.
 */
export function WorkspaceDialogs({
  state, files, projectName, projectId, activeFile,
  onFileChange, onBulkFileUpdate, onUpdateSettings, onFileSelect,
  paletteCommands, snapshots,
}: WorkspaceDialogsProps) {
  return (
    <>
      {state.showCommandPalette && (
        <Suspense fallback={null}>
          <CommandPalette
            open={state.showCommandPalette}
            onClose={() => state.setShowCommandPalette(false)}
            commands={paletteCommands as any}
          />
        </Suspense>
      )}

      {state.showShortcuts && (
        <Suspense fallback={null}>
          <KeyboardShortcutsOverlay
            open={state.showShortcuts}
            onClose={() => state.setShowShortcuts(false)}
          />
        </Suspense>
      )}

      {state.showFileSearch && (
        <Suspense fallback={null}>
          <FileSearch
            files={files}
            onResultClick={onFileSelect}
            open={state.showFileSearch}
            onClose={() => state.setShowFileSearch(false)}
          />
        </Suspense>
      )}

      {state.showSettings && (
        <Suspense fallback={null}>
          <ProjectSettingsDialog
            open={state.showSettings}
            onClose={() => state.setShowSettings(false)}
            projectName={projectName}
            projectId={projectId}
            framework={detectFramework(files)}
            onUpdateSettings={onUpdateSettings || (() => {})}
          />
        </Suspense>
      )}

      {state.showVersionHistory && (
        <Suspense fallback={null}>
          <VersionHistory
            open={state.showVersionHistory}
            onClose={() => state.setShowVersionHistory(false)}
            snapshots={snapshots}
            currentFiles={files}
            onRestore={(snap) => {
              onBulkFileUpdate(snap.files, { replace: true })
              toast.success('Snapshot restored', { description: snap.label })
            }}
            onViewDiff={(snapshotId, path) => {
              const snap = snapshots.find(s => s.id === snapshotId)
              if (snap) {
                state.setDiffState({
                  open: true,
                  path,
                  oldContent: snap.files[path] || '',
                  newContent: files[path] || '',
                })
              }
            }}
          />
        </Suspense>
      )}

      {state.diffState && (
        <Suspense fallback={null}>
          <DiffViewer
            open={state.diffState.open}
            onClose={() => state.setDiffState(null)}
            path={state.diffState.path}
            oldContent={state.diffState.oldContent}
            newContent={state.diffState.newContent}
            oldLabel="Snapshot"
            newLabel="Current"
          />
        </Suspense>
      )}

      {state.showFindReplace && (
        <Suspense fallback={null}>
          <FindReplacePanel
            open={state.showFindReplace}
            onClose={() => state.setShowFindReplace(false)}
            files={files}
            onReplace={onFileChange}
            activeFile={activeFile}
          />
        </Suspense>
      )}

      {state.showEditorSettings && (
        <Suspense fallback={null}>
          <SettingsDialog
            open={state.showEditorSettings}
            onClose={() => {
              state.setShowEditorSettings(false)
              state.setSettingsDefaultTab(undefined)
            }}
            defaultTab={state.settingsDefaultTab}
          />
        </Suspense>
      )}

      {state.auditPlan && (
        <div className="fixed bottom-16 right-4 z-40 w-[420px] max-h-[70vh] animate-slide-up">
          <Suspense fallback={null}>
            <AuditPanel
              plan={state.auditPlan}
              onApprove={() => {
                state.chatSendRef.current?.('[AUDIT APPROVED]')
                state.setAuditPlan(prev => prev ? { ...prev, status: 'in_progress' } : null)
              }}
              onReplan={(fb) => {
                state.chatSendRef.current?.(`[REPLAN] feedback: ${fb}`)
                state.setAuditPlan(null)
              }}
              onDismiss={() => state.setAuditPlan(null)}
            />
          </Suspense>
        </div>
      )}

      {state.showDbExplorer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => state.setShowDbExplorer(false)}
        >
          <div
            className="w-[900px] h-[600px] max-w-[95vw] max-h-[85vh] rounded-2xl border border-pi-border shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <Suspense fallback={<div className="h-full flex items-center justify-center text-pi-text-dim text-sm">Loading...</div>}>
              <DbExplorer />
            </Suspense>
          </div>
        </div>
      )}

      {state.showComponentLibrary && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => state.setShowComponentLibrary(false)}
        >
          <div
            className="w-[500px] h-[600px] max-w-[95vw] max-h-[85vh] rounded-2xl border border-pi-border shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <Suspense fallback={<div className="h-full flex items-center justify-center text-pi-text-dim text-sm">Loading...</div>}>
              <ComponentLibrary
                onInsert={(code) => {
                  state.chatSendRef.current?.(code)
                  state.setShowComponentLibrary(false)
                }}
              />
            </Suspense>
          </div>
        </div>
      )}

      {state.showMcpManager && (
        <Suspense fallback={null}>
          <MCPManager
            isOpen={state.showMcpManager}
            onClose={() => state.setShowMcpManager(false)}
          />
        </Suspense>
      )}

    </>
  )
}
