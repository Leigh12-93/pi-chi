'use client'

import { useSession } from '@/components/session-provider'
import {
  Hammer, FolderOpen, FileText, Github, LogOut,
  Rocket, Upload, Save, GitBranch,
} from 'lucide-react'

interface HeaderProps {
  projectName: string
  onSwitchProject: () => void
  fileCount: number
  onAction?: (action: string) => void
}

export function Header({ projectName, onSwitchProject, fileCount, onAction }: HeaderProps) {
  const { session, status } = useSession()

  const actions = [
    { id: 'save', icon: Save, label: 'Save', tip: 'Save project to database', color: 'hover:text-green-600' },
    { id: 'deploy', icon: Rocket, label: 'Deploy', tip: 'Deploy to Vercel', color: 'hover:text-blue-600' },
    { id: 'push', icon: Upload, label: 'Push', tip: 'Push to GitHub', color: 'hover:text-purple-600' },
    { id: 'create-repo', icon: GitBranch, label: 'New Repo', tip: 'Create GitHub repo', color: 'hover:text-orange-600' },
  ]

  return (
    <header className="h-11 flex items-center justify-between px-2 sm:px-4 border-b border-forge-border bg-forge-panel shrink-0">
      {/* Left: Logo + Project */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <Hammer className="w-4 h-4 text-forge-accent" />
          <span className="font-bold text-sm text-forge-text hidden sm:inline">Forge</span>
        </div>
        <div className="w-px h-4 bg-forge-border hidden sm:block" />
        <button
          onClick={onSwitchProject}
          className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 text-xs text-forge-text-dim hover:text-forge-text hover:bg-forge-surface rounded transition-colors min-w-0"
        >
          <FolderOpen className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate max-w-[80px] sm:max-w-none">{projectName}</span>
        </button>
        {fileCount > 0 && (
          <span className="text-[10px] text-forge-text-dim items-center gap-1 hidden sm:flex">
            <FileText className="w-3 h-3" />
            {fileCount} files
          </span>
        )}
      </div>

      {/* Center: Action Buttons */}
      <div className="flex items-center gap-0.5 sm:gap-1">
        {actions.map(action => (
          <button
            key={action.id}
            onClick={() => onAction?.(action.id)}
            className={`flex items-center gap-1.5 p-1.5 sm:px-2.5 sm:py-1.5 text-[11px] font-medium text-forge-text-dim ${action.color} hover:bg-forge-surface rounded transition-all`}
            title={action.tip}
          >
            <action.icon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{action.label}</span>
          </button>
        ))}
      </div>

      {/* Right: Auth */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <span className="text-[10px] text-forge-text-dim hidden lg:inline">Claude Sonnet 4</span>

        {status === 'loading' ? (
          <div className="w-6 h-6 rounded-full bg-forge-surface animate-pulse" />
        ) : session?.user ? (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="items-center gap-1.5 px-2 py-1 rounded bg-forge-surface text-[10px] text-forge-text-dim hidden sm:flex">
              <Github className="w-3 h-3" />
              <span>{session.githubUsername || session.user.name}</span>
            </div>
            {session.user.image && (
              <img src={session.user.image} alt="" className="w-6 h-6 rounded-full border border-forge-border" />
            )}
            <a href="/api/auth/logout" className="p-1 text-forge-text-dim hover:text-forge-danger transition-colors" title="Sign out">
              <LogOut className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <a href="/api/auth/login" className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded bg-forge-surface hover:bg-forge-accent/20 text-xs text-forge-text-dim hover:text-forge-text transition-colors">
            <Github className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign in</span>
          </a>
        )}
      </div>
    </header>
  )
}
