'use client'

import { useState, useCallback, useEffect } from 'react'
import { Header } from '@/components/header'
import { cn } from '@/lib/utils'
import { AgentDashboard } from '@/components/agent-dashboard'
import { Workspace } from '@/components/workspace'
import { RadioPanel } from '@/components/agent/radio-panel'
import { RadioLibrary } from '@/components/agent/radio-library'
import { usePiTerminal } from '@/hooks/use-pi-terminal'
import type { AppMode } from '@/lib/agent-types'

/* ─── Props ─────────────────────────────────────── */

interface AgentShellProps {
  // Project state
  projectName: string
  projectId: string | null
  files: Record<string, string>
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileChange: (path: string, content: string) => void
  onFileDelete: (path: string) => void
  onBulkFileUpdate: (files: Record<string, string>, opts?: { replace?: boolean }) => void

  // Project management
  onSwitchProject: () => void

  // Save
  saveStatus?: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
  autoSaveError?: boolean
  onManualSave?: () => Promise<void>
  onUpdateSettings?: (settings: { name?: string; description?: string }) => void

  // Chat
  pendingMessage?: string | null
  onPendingMessageSent?: () => void

  // GitHub
  githubToken?: string
  githubRepoUrl?: string | null
  onGithubRepoUrlChange?: (url: string | null) => void
  githubUsername?: string

  // Vercel
  vercelUrl?: string | null
  onVercelUrlChange?: (url: string | null) => void

  // Branch
  currentBranch?: string
  onBranchChange?: (branch: string) => void
}

/* ─── Component ─────────────────────────────────── */

export function AgentShell(props: AgentShellProps) {
  const {
    projectName, projectId, files, activeFile,
    onFileSelect, onFileChange, onFileDelete, onBulkFileUpdate,
    onSwitchProject, saveStatus, autoSaveError, onManualSave, onUpdateSettings,
    pendingMessage, onPendingMessageSent,
    githubToken, githubRepoUrl, onGithubRepoUrlChange, githubUsername,
    vercelUrl, onVercelUrlChange, currentBranch, onBranchChange,
  } = props

  const [mode, setMode] = useState<AppMode>('agent')

  // Full-screen terminal via shared hook
  const fullTerminal = usePiTerminal({
    isVisible: mode === 'terminal',
    banner: [
      '\x1b[36m  Pi-Chi Full Terminal\x1b[0m',
      '\x1b[90m  Press Ctrl+1 to return to Agent view.\x1b[0m',
      '',
    ],
    promptColor: '\x1b[32m',
  })

  // Keyboard shortcuts: Ctrl+1/2/3 to switch modes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.key === '1') { e.preventDefault(); setMode('agent') }
        else if (e.key === '2') { e.preventDefault(); setMode('ide') }
        else if (e.key === '3') { e.preventDefault(); setMode('terminal') }
        else if (e.key === '4') { e.preventDefault(); setMode('radio') }
        else if (e.key === '5') { e.preventDefault(); setMode('library') }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleSwitchProject = useCallback(() => {
    setMode('agent')
    onSwitchProject()
  }, [onSwitchProject])

  return (
    <div className="h-screen-dynamic flex flex-col bg-pi-bg">
      <div className={cn(mode === 'agent' ? 'hidden md:block' : '')}>
        <Header
          projectName={projectName}
          onSwitchProject={handleSwitchProject}
          fileCount={Object.keys(files).length}
          saveStatus={saveStatus === 'pending' ? 'saving' : saveStatus === 'error' ? 'error' : saveStatus === 'saved' ? 'saved' : 'idle'}
          mode={mode}
          onModeChange={setMode}
          githubRepoUrl={githubRepoUrl}
          vercelUrl={vercelUrl}
          currentBranch={currentBranch}
          onBranchChange={onBranchChange}
        />
      </div>

      {/* Agent Mode */}
      {mode === 'agent' && (
        <div className="flex-1 overflow-hidden">
          <AgentDashboard
            projectName={projectName}
            projectId={projectId}
            files={files}
            activeFile={activeFile}
            onFileSelect={onFileSelect}
            onFileChange={onFileChange}
            onFileDelete={onFileDelete}
            onBulkFileUpdate={onBulkFileUpdate}
            githubToken={githubToken}
            pendingMessage={pendingMessage}
            onPendingMessageSent={onPendingMessageSent}
          />
        </div>
      )}

      {/* IDE Mode */}
      {mode === 'ide' && (
        <div className="flex-1 overflow-hidden">
          <Workspace
            projectName={projectName}
            projectId={projectId}
            files={files}
            activeFile={activeFile}
            onFileSelect={onFileSelect}
            onFileChange={onFileChange}
            onFileDelete={onFileDelete}
            onBulkFileUpdate={onBulkFileUpdate}
            onSwitchProject={handleSwitchProject}
            githubToken={githubToken}
            autoSaveError={autoSaveError}
            saveStatus={saveStatus}
            onManualSave={onManualSave}
            onUpdateSettings={onUpdateSettings}
            initialPendingMessage={pendingMessage}
            onInitialPendingMessageSent={onPendingMessageSent}
            githubRepoUrl={githubRepoUrl}
            onGithubRepoUrlChange={onGithubRepoUrlChange}
            githubUsername={githubUsername}
            vercelUrl={vercelUrl}
            onVercelUrlChange={onVercelUrlChange}
            currentBranch={currentBranch}
            onBranchChange={onBranchChange}
          />
        </div>
      )}

      {/* Full-screen Terminal Mode */}
      {mode === 'terminal' && (
        <div className="flex-1 bg-[#0a0a0f] overflow-hidden">
          <div ref={fullTerminal.containerRef} className="h-full p-2" />
        </div>
      )}

      {/* Radio Mode */}
      {mode === 'radio' && (
        <div className="flex-1 overflow-hidden">
          <RadioPanel fullPage />
        </div>
      )}

      {/* Library Mode */}
      {mode === 'library' && (
        <div className="flex-1 overflow-hidden">
          <RadioLibrary />
        </div>
      )}
    </div>
  )
}
