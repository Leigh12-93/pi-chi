'use client'

import { useState, forwardRef, useImperativeHandle } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import { FolderTree, GitBranch, Rocket, Key, Database, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FileTree } from './file-tree'
import { GitPanel } from './sidebar/git-panel'
import { DeployPanel } from './sidebar/deploy-panel'
import { EnvPanel } from './sidebar/env-panel'
import { DbPanel } from './sidebar/db-panel'
import { SnapshotsPanel } from './sidebar/snapshots-panel'
import type { FileNode } from '@/lib/types'
import type { Snapshot } from './version-history'

type SidebarTab = 'files' | 'git' | 'deploy' | 'env' | 'db' | 'snapshots'

const TABS: { id: SidebarTab; icon: typeof FolderTree; label: string }[] = [
  { id: 'files', icon: FolderTree, label: 'Files' },
  { id: 'git', icon: GitBranch, label: 'Git' },
  { id: 'deploy', icon: Rocket, label: 'Deploy' },
  { id: 'env', icon: Key, label: 'Environment' },
  { id: 'db', icon: Database, label: 'Database' },
  { id: 'snapshots', icon: History, label: 'Snapshots' },
]

export interface SidebarRef {
  toggle: () => void
}

interface SidebarProps {
  fileTree: FileNode[]
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileDelete?: (path: string) => void
  onFileRename?: (oldPath: string, newPath: string) => void
  onFileCreate?: (path: string) => void
  fileContents: Record<string, string>
  modifiedFiles: Set<string>
  githubRepoUrl: string | null
  onAction: (action: string) => void
  projectId: string | null
  onFileChange: (path: string, content: string) => void
  onOpenDbExplorer: () => void
  snapshots: Snapshot[]
  onOpenVersionHistory: () => void
  onRestoreSnapshot: (snap: Snapshot) => void
  onCreateSnapshot: () => void
  children: React.ReactNode
}

export const Sidebar = forwardRef<SidebarRef, SidebarProps>(function Sidebar(
  {
    fileTree, activeFile, onFileSelect, onFileDelete, onFileRename, onFileCreate,
    fileContents, modifiedFiles, githubRepoUrl, onAction, projectId,
    onFileChange, onOpenDbExplorer, snapshots, onOpenVersionHistory,
    onRestoreSnapshot, onCreateSnapshot, children,
  },
  ref,
) {
  const [activeTab, setActiveTab] = useState<SidebarTab | null>('files')

  useImperativeHandle(ref, () => ({
    toggle: () => setActiveTab(prev => prev ? null : 'files'),
  }))

  const handleTabClick = (tab: SidebarTab) => {
    setActiveTab(prev => prev === tab ? null : tab)
  }

  return (
    <div className="h-full flex">
      {/* Activity Bar — always visible, 44px */}
      <div className="w-11 shrink-0 bg-forge-panel border-r border-forge-border flex flex-col items-center pt-2 gap-0.5">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
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

      {/* Content Panel + Editor */}
      <PanelGroup direction="horizontal" autoSaveId="forge-sidebar-panels">
        {activeTab && (
          <>
            <Panel defaultSize={20} minSize={12} maxSize={35}>
              <div className="h-full overflow-y-auto bg-forge-panel animate-sidebar-in">
                {activeTab === 'files' && (
                  <FileTree
                    files={fileTree}
                    activeFile={activeFile}
                    onFileSelect={onFileSelect}
                    onFileDelete={onFileDelete}
                    onFileRename={onFileRename}
                    onFileCreate={onFileCreate}
                    fileContents={fileContents}
                    modifiedFiles={modifiedFiles}
                  />
                )}
                {activeTab === 'git' && (
                  <GitPanel githubRepoUrl={githubRepoUrl} onAction={onAction} />
                )}
                {activeTab === 'deploy' && (
                  <DeployPanel onAction={onAction} />
                )}
                {activeTab === 'env' && (
                  <EnvPanel fileContents={fileContents} onFileChange={onFileChange} />
                )}
                {activeTab === 'db' && (
                  <DbPanel onOpenDbExplorer={onOpenDbExplorer} />
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
            </Panel>
            <PanelResizeHandle />
          </>
        )}
        <Panel defaultSize={activeTab ? 80 : 100} minSize={40}>
          {children}
        </Panel>
      </PanelGroup>
    </div>
  )
})
