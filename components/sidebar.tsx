'use client'

import { Key, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { GitPanel } from './sidebar/git-panel'
import { DeployPanel } from './sidebar/deploy-panel'
import { EnvPanel } from './sidebar/env-panel'
import { DbPanel } from './sidebar/db-panel'
import { GooglePanel } from './sidebar/google-panel'
import { SnapshotsPanel } from './sidebar/snapshots-panel'
import { AnthropicPanel } from './sidebar/anthropic-panel'
import { StripePanel } from './sidebar/stripe-panel'
import { SmsPanel } from './sidebar/sms-panel'
import type { FileNode } from '@/lib/types'
import type { Snapshot } from './version-history'

export type SidebarTab = 'anthropic' | 'git' | 'deploy' | 'env' | 'db' | 'google' | 'stripe' | 'sms' | 'snapshots'

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 98 96" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" />
    </svg>
  )
}

function VercelIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 76 65" fill="currentColor">
      <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
    </svg>
  )
}

function SupabaseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 109 113" fill="none">
      <path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627H99.1935C108.384 40.0627 113.529 50.7625 107.765 57.7278L63.7076 110.284Z" fill="url(#sb-a)"/>
      <path d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627H99.1935C108.384 40.0627 113.529 50.7625 107.765 57.7278L63.7076 110.284Z" fill="url(#sb-b)" fillOpacity="0.2"/>
      <path d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.04075L54.4849 72.2922H9.83113C0.640828 72.2922 -4.50388 61.5765 1.26003 54.6251L45.317 2.07103Z" fill="#3ECF8E"/>
      <defs>
        <linearGradient id="sb-a" x1="53.9738" y1="54.974" x2="94.1635" y2="71.8295" gradientUnits="userSpaceOnUse">
          <stop stopColor="#249361"/><stop offset="1" stopColor="#3ECF8E"/>
        </linearGradient>
        <linearGradient id="sb-b" x1="36.1558" y1="30.578" x2="54.4844" y2="65.0806" gradientUnits="userSpaceOnUse">
          <stop/><stop offset="1" stopOpacity="0"/>
        </linearGradient>
      </defs>
    </svg>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function StripeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 28 28" fill="currentColor">
      <path d="M13.111 11.217c0-1.09.893-1.51 2.374-1.51 2.123 0 4.806.643 6.929 1.79V5.396c-2.318-.92-4.606-1.283-6.929-1.283C10.68 4.113 7.5 6.72 7.5 11.465c0 7.371 10.15 6.198 10.15 9.375 0 1.29-1.123 1.71-2.693 1.71-2.33 0-5.313-.96-7.677-2.254v6.064c2.614 1.112 5.254 1.586 7.677 1.586 4.943 0 8.342-2.45 8.342-7.254-.03-7.952-10.188-6.543-10.188-9.475z" />
    </svg>
  )
}

function SmsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12zM7 9h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2z" />
    </svg>
  )
}

function AnthropicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 46 32" fill="currentColor">
      <path d="M32.73 0h-6.73L13.27 32h6.73L32.73 0ZM13.27 0 0 32h6.9l2.73-6.72h13.82l2.73 6.72h6.9L19.81 0h-6.54Zm.63 19.52 4.18-10.28 4.19 10.28H13.9Z" />
    </svg>
  )
}

type TabIcon = React.FC<{ className?: string }>

export const TABS: { id: SidebarTab; icon: TabIcon; label: string; activeColor?: string; activeBg?: string }[] = [
  { id: 'anthropic', icon: AnthropicIcon, label: 'Anthropic', activeColor: 'text-[#D4A574]', activeBg: 'bg-[#D4A574]/10' },
  { id: 'git', icon: GitHubIcon, label: 'GitHub', activeColor: 'text-white', activeBg: 'bg-white/10' },
  { id: 'deploy', icon: VercelIcon, label: 'Vercel', activeColor: 'text-white', activeBg: 'bg-white/10' },
  { id: 'env', icon: Key, label: 'Environment', activeColor: 'text-amber-400', activeBg: 'bg-amber-500/10' },
  { id: 'db', icon: SupabaseIcon, label: 'Supabase', activeColor: 'text-emerald-400', activeBg: 'bg-emerald-500/10' },
  { id: 'google', icon: GoogleIcon, label: 'Google', activeBg: 'bg-blue-500/10' },
  { id: 'stripe', icon: StripeIcon, label: 'Stripe', activeColor: 'text-[#635BFF]', activeBg: 'bg-[#635BFF]/10' },
  { id: 'sms', icon: SmsIcon, label: 'AussieSMS', activeColor: 'text-cyan-400', activeBg: 'bg-cyan-500/10' },
  { id: 'snapshots', icon: History, label: 'Snapshots', activeColor: 'text-purple-400', activeBg: 'bg-purple-500/10' },
]

interface ActivityBarProps {
  activeTab: SidebarTab | null
  onTabChange: (tab: SidebarTab | null) => void
}

export function ActivityBar({ activeTab, onTabChange }: ActivityBarProps) {
  const handleClick = (tab: SidebarTab) => {
    onTabChange(activeTab === tab ? null : tab)
  }

  return (
    <div className="group/actbar w-11 hover:w-40 shrink-0 h-full bg-pi-panel border-r border-pi-border flex flex-col pt-2 gap-0.5 transition-[width] duration-200 ease-out overflow-hidden" role="tablist" aria-label="Sidebar panels" aria-orientation="vertical">
      {TABS.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-label={tab.label}
          onClick={() => handleClick(tab.id)}
          title={tab.label}
          className={cn(
            'relative mx-1 h-9 flex items-center gap-2.5 px-2 rounded-lg transition-colors whitespace-nowrap',
            activeTab === tab.id
              ? cn(tab.activeColor || 'text-pi-accent', tab.activeBg || 'bg-pi-accent/10')
              : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface',
          )}
        >
          <tab.icon className="w-[18px] h-[18px] shrink-0" />
          <span className="text-xs font-medium opacity-0 group-hover/actbar:opacity-100 transition-opacity duration-200">{tab.label}</span>
          {activeTab === tab.id && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-pi-accent rounded-r-full transition-all duration-200 shadow-[2px_0_8px_-1px_rgba(99,102,241,0.3)]" />
          )}
        </button>
      ))}
    </div>
  )
}

interface SidebarContentProps {
  activeTab: SidebarTab
  fileTree: FileNode[]
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileDelete?: (path: string) => void
  onFileRename?: (oldPath: string, newPath: string) => void
  onFileCreate?: (path: string) => void
  fileContents: Record<string, string>
  modifiedFiles: Set<string>
  aiEditingFiles?: Set<string>
  fileDiffs?: Map<string, { added: number; removed: number }>
  githubRepoUrl: string | null
  projectId: string | null
  vercelProjectId?: string | null
  onAction: (action: string) => void
  onFileChange: (path: string, content: string) => void
  onOpenDbExplorer: () => void
  onOpenSettings?: () => void
  onRepoConnected?: (url: string) => void
  onRepoDisconnected?: () => void
  onBulkFileUpdate?: (files: Record<string, string>, opts?: { replace?: boolean }) => void
  onVercelConnected?: (id: string) => void
  snapshots: Snapshot[]
  onOpenVersionHistory: () => void
  onRestoreSnapshot: (snap: Snapshot) => void
  onCreateSnapshot: () => void
  onOpenMcpManager?: () => void
  sessionCost?: { cost: number; inputTokens: number; outputTokens: number }
  currentBranch?: string
  onBranchChange?: (branch: string) => void
}

export function SidebarContent({
  activeTab, fileTree: _fileTree, activeFile: _activeFile, onFileSelect: _onFileSelect, onFileDelete: _onFileDelete, onFileRename: _onFileRename,
  onFileCreate: _onFileCreate, fileContents, modifiedFiles, aiEditingFiles: _aiEditingFiles, fileDiffs: _fileDiffs,
  githubRepoUrl, projectId, vercelProjectId, onAction, onFileChange,
  onOpenDbExplorer, onOpenSettings, onRepoConnected, onRepoDisconnected, onBulkFileUpdate, onVercelConnected, snapshots,
  onOpenVersionHistory, onRestoreSnapshot, onCreateSnapshot, onOpenMcpManager, sessionCost,
  currentBranch, onBranchChange,
}: SidebarContentProps) {
  return (
    <div className="h-full overflow-y-auto bg-pi-panel animate-sidebar-in">
      {activeTab === 'anthropic' && (
        <AnthropicPanel onOpenSettings={onOpenSettings} onOpenMcpManager={onOpenMcpManager} sessionCost={sessionCost} fileContents={fileContents} />
      )}
      {activeTab === 'git' && (
        <GitPanel githubRepoUrl={githubRepoUrl} projectId={projectId} onAction={onAction} onRepoConnected={onRepoConnected} onRepoDisconnected={onRepoDisconnected} files={fileContents} onBulkFileUpdate={onBulkFileUpdate} modifiedFiles={modifiedFiles} currentBranch={currentBranch} onBranchChange={onBranchChange} />
      )}
      {activeTab === 'deploy' && (
        <DeployPanel onAction={onAction} projectId={projectId} vercelProjectId={vercelProjectId} onVercelConnected={onVercelConnected} onOpenSettings={onOpenSettings} fileContents={fileContents} />
      )}
      {activeTab === 'env' && (
        <EnvPanel fileContents={fileContents} onFileChange={onFileChange} vercelProjectId={vercelProjectId} />
      )}
      {activeTab === 'db' && (
        <DbPanel fileContents={fileContents} onOpenDbExplorer={onOpenDbExplorer} onOpenSettings={onOpenSettings} />
      )}
      {activeTab === 'google' && (
        <GooglePanel fileContents={fileContents} onFileChange={onFileChange} />
      )}
      {activeTab === 'stripe' && (
        <StripePanel fileContents={fileContents} onFileChange={onFileChange} />
      )}
      {activeTab === 'sms' && (
        <SmsPanel fileContents={fileContents} onFileChange={onFileChange} />
      )}
      {activeTab === 'snapshots' && (
        <SnapshotsPanel
          snapshots={snapshots}
          onRestoreSnapshot={onRestoreSnapshot}
          onOpenVersionHistory={onOpenVersionHistory}
          onCreateSnapshot={onCreateSnapshot}
          currentFiles={fileContents}
        />
      )}
    </div>
  )
}
