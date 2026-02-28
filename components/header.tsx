'use client'

import { useSession } from '@/components/session-provider'
import {
  Hammer, FolderOpen, FileText, Github, LogOut,
  Rocket, Upload, Save, GitBranch, Download, FolderInput,
  Loader2, Check, Search, ChevronRight, Sun, Moon, Share2,
} from 'lucide-react'
import { useTheme } from '@/components/theme-provider'
import { cn } from '@/lib/utils'

interface HeaderProps {
  projectName: string
  onSwitchProject: () => void
  fileCount: number
  onAction?: (action: string) => void
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  onOpenCommandPalette?: () => void
  notificationSlot?: React.ReactNode
}

const actions = [
  { id: 'save', icon: Save, label: 'Save', tip: 'Save project to database' },
  { id: 'deploy', icon: Rocket, label: 'Deploy', tip: 'Deploy to Vercel' },
  { id: 'push', icon: Upload, label: 'Push', tip: 'Push to GitHub' },
  { id: 'create-repo', icon: GitBranch, label: 'New Repo', tip: 'Create GitHub repo' },
  { id: 'import', icon: FolderInput, label: 'Import', tip: 'Import from GitHub repo' },
  { id: 'download', icon: Download, label: 'Download', tip: 'Download project as ZIP' },
  { id: 'share', icon: Share2, label: 'Share', tip: 'Copy share link' },
]

export function Header({ projectName, onSwitchProject, fileCount, onAction, saveStatus = 'idle', onOpenCommandPalette, notificationSlot }: HeaderProps) {
  const { session, status } = useSession()
  const { theme, toggleTheme } = useTheme()

  const getSaveIcon = () => {
    if (saveStatus === 'saving') return <Loader2 className="w-3.5 h-3.5 animate-spin" />
    if (saveStatus === 'saved') return <Check className="w-3.5 h-3.5 text-green-600" />
    return null
  }

  return (
    <header className="h-12 sm:h-11 flex items-center justify-between px-2 sm:px-4 border-b border-forge-border bg-forge-panel shrink-0">
      {/* Left: Logo + Project */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onSwitchProject}
          className="flex items-center gap-1.5 sm:gap-2 shrink-0 hover:opacity-80 transition-opacity"
          aria-label="Back to projects"
          title="Back to projects"
        >
          <Hammer className="w-4 h-4 text-forge-accent" />
          <span className="font-bold text-sm text-forge-text hidden sm:inline">Forge</span>
        </button>
        <ChevronRight className="w-3 h-3 text-forge-text-dim hidden sm:block" />
        <button
          onClick={onSwitchProject}
          className="flex items-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 text-xs text-forge-text-dim hover:text-forge-text hover:bg-forge-surface rounded transition-colors min-w-0"
        >
          <FolderOpen className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate max-w-[120px] sm:max-w-none">{projectName}</span>
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
        {actions.map(action => {
          const saveIcon = action.id === 'save' ? getSaveIcon() : null
          return (
            <button
              key={action.id}
              onClick={() => onAction?.(action.id)}
              disabled={action.id === 'save' && saveStatus === 'saving'}
              className={cn(
                'flex items-center gap-1.5 p-2.5 sm:px-2.5 sm:py-1.5 text-xs sm:text-[11px] font-medium text-forge-text-dim hover:text-forge-accent hover:bg-forge-surface rounded transition-colors',
                action.id === 'save' && saveStatus === 'saving' && 'opacity-50 cursor-not-allowed',
                action.id === 'save' && saveStatus === 'saved' && 'text-green-600',
                action.id === 'save' && saveStatus === 'error' && 'text-red-600',
              )}
              title={action.tip}
              aria-label={action.label}
            >
              {saveIcon || <action.icon className="w-3.5 h-3.5" />}
              <span className="hidden lg:inline">{action.label}</span>
            </button>
          )
        })}
      </div>

      {/* Right: Search + Auth */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="hidden sm:flex items-center gap-2 px-2.5 py-1 text-[11px] text-forge-text-dim bg-forge-surface border border-forge-border rounded-lg hover:border-forge-accent/50 hover:text-forge-text transition-all"
          >
            <Search className="w-3 h-3" />
            <span>Commands</span>
            <kbd className="px-1 py-0.5 text-[9px] font-mono bg-white border border-forge-border rounded">Ctrl+K</kbd>
          </button>
        )}
        {notificationSlot}
        <button
          onClick={toggleTheme}
          className="p-2 sm:p-1.5 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
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
            <a href="/api/auth/logout" className="p-2 sm:p-1 text-forge-text-dim hover:text-forge-danger transition-colors" title="Sign out" aria-label="Sign out">
              <LogOut className="w-3.5 h-3.5" />
            </a>
          </div>
        ) : (
          <a href="/api/auth/login" className="flex items-center gap-1.5 px-3 sm:px-2.5 py-2 sm:py-1 rounded bg-forge-surface hover:bg-forge-accent/20 text-xs text-forge-text-dim hover:text-forge-text transition-colors">
            <Github className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign in</span>
          </a>
        )}
      </div>
    </header>
  )
}
