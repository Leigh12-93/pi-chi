'use client'

import { Key, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FileTree } from './file-tree'
import { GitPanel } from './sidebar/git-panel'
import { DeployPanel } from './sidebar/deploy-panel'
import { EnvPanel } from './sidebar/env-panel'
import { DbPanel } from './sidebar/db-panel'
import { SnapshotsPanel } from './sidebar/snapshots-panel'
import type { FileNode } from '@/lib/types'
import type { Snapshot } from './version-history'

export type SidebarTab = 'git' | 'deploy' | 'env' | 'db' | 'snapshots'

// ─── Brand SVG icons for sidebar ────────────────────────────────

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

type TabIcon = React.FC<{ className?: string }>

const TABS: { id: SidebarTab; icon: TabIcon; label: string }[] = [
  { id: 'git', icon: GitHubIcon, label: 'GitHub' },
  { id: 'deploy', icon: VercelIcon, label: 'Vercel' },
  { id: 'env', icon: Key, label: 'Environment' },
  { id: 'db', icon: SupabaseIcon, label: 'Supabase' },
  { id: 'snapshots', icon: History, label: 'Snapshots' },
]

// ─── Activity Bar (44px icon strip) ─────────────────────────────

interface ActivityBarProps {
  activeTab: SidebarTab | null
  onTabChange: (tab: SidebarTab | null) => void
}

export function ActivityBar({ activeTab, onTabChange }: ActivityBarProps) {
  const handleClick = (tab: SidebarTab) => {
    onTabChange(activeTab === tab ? null : tab)
  }

  return (
    <div className="w-11 shrink-0 h-full bg-forge-panel border-r border-forge-border flex flex-col items-center pt-2 gap-0.5" role="tablist" aria-label="Sidebar panels" aria-orientation="vertical">
      {TABS.map(tab => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-label={tab.label}
          onClick={() => handleClick(tab.id)}
          title={tab.label}
          className={cn(
            'relative w-9 h-9 flex items-center justify-center rounded-lg transition-colors',
            activeTab === tab.id
              ? 'text-forge-accent bg-forge-accent/10'
              : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface',
          )}
        >
          <tab.icon className="w-[18px] h-[18px]" />
          {activeTab === tab.id && (
            <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-forge-accent rounded-r-full" />
          )}
        </button>
      ))}
    </div>
  )
}

// ─── Sidebar Content Panel ──────────────────────────────────────

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
  onVercelConnected?: (id: string) => void
  snapshots: Snapshot[]
  onOpenVersionHistory: () => void
  onRestoreSnapshot: (snap: Snapshot) => void
  onCreateSnapshot: () => void
}

export function SidebarContent({
  activeTab, fileTree, activeFile, onFileSelect, onFileDelete, onFileRename,
  onFileCreate, fileContents, modifiedFiles, aiEditingFiles, fileDiffs,
  githubRepoUrl, projectId, vercelProjectId, onAction, onFileChange,
  onOpenDbExplorer, onOpenSettings, onRepoConnected, onVercelConnected, snapshots,
  onOpenVersionHistory, onRestoreSnapshot, onCreateSnapshot,
}: SidebarContentProps) {
  return (
    <div className="h-full overflow-y-auto bg-forge-panel animate-sidebar-in">
      {activeTab === 'git' && (
        <GitPanel githubRepoUrl={githubRepoUrl} projectId={projectId} onAction={onAction} onRepoConnected={onRepoConnected} />
      )}
      {activeTab === 'deploy' && (
        <DeployPanel onAction={onAction} projectId={projectId} vercelProjectId={vercelProjectId} onVercelConnected={onVercelConnected} onOpenSettings={onOpenSettings} />
      )}
      {activeTab === 'env' && (
        <EnvPanel fileContents={fileContents} onFileChange={onFileChange} vercelProjectId={vercelProjectId} />
      )}
      {activeTab === 'db' && (
        <DbPanel fileContents={fileContents} onOpenDbExplorer={onOpenDbExplorer} onOpenSettings={onOpenSettings} />
      )}
      {activeTab === 'snapshots' && (
        <SnapshotsPanel
          snapshots={snapshots}
          onRestoreSnapshot={onRestoreSnapshot}
          onOpenVersionHistory={onOpenVersionHistory}
          onCreateSnapshot={onCreateSnapshot}
        />
      )}
    </div>
  )
}
