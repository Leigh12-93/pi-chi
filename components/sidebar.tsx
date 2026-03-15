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
import {
  GitHubIcon, VercelIcon, SupabaseIcon, GoogleIcon,
  StripeIcon, SmsIcon, AnthropicIcon,
} from '@/components/icons'
import type { FileNode } from '@/lib/types'
import type { Snapshot } from './version-history'

export type SidebarTab = 'anthropic' | 'git' | 'deploy' | 'env' | 'db' | 'google' | 'stripe' | 'sms' | 'snapshots'

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
