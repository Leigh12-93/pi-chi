'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from '@/components/session-provider'
import {
  FolderOpen, FileText, Github, LogOut,
  Rocket, Upload, Save, GitBranch, Download, FolderInput,
  Loader2, Check, Search, ChevronRight, Sun, Moon, Share2,
  Menu, X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { BranchMenu } from './branch-menu'
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
  githubRepoUrl?: string | null
}

const actions: Array<{ id: string; icon: typeof Save; label: string; tip: string } | 'separator'> = [
  { id: 'save', icon: Save, label: 'Save', tip: 'Save (Ctrl+S)' },
  'separator',
  { id: 'deploy', icon: Rocket, label: 'Deploy', tip: 'Deploy to Vercel (Ctrl+Shift+D)' },
  { id: 'push', icon: Upload, label: 'Push', tip: 'Push to GitHub' },
  'separator',
  { id: 'create-repo', icon: GitBranch, label: 'New Repo', tip: 'Create GitHub repo' },
  { id: 'import', icon: FolderInput, label: 'Import', tip: 'Import from GitHub repo' },
  { id: 'download', icon: Download, label: 'Download', tip: 'Download as ZIP (Ctrl+Shift+E)' },
  { id: 'share', icon: Share2, label: 'Share', tip: 'Copy share link' },
]

export function Header({ projectName, onSwitchProject, fileCount, onAction, saveStatus = 'idle', onOpenCommandPalette, notificationSlot, githubRepoUrl }: HeaderProps) {
  const { session, status } = useSession()
  const { theme, toggleTheme } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!mobileMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [mobileMenuOpen])

  const getSaveIcon = () => {
    if (saveStatus === 'saving') return <Loader2 className="w-3.5 h-3.5 animate-spin transition-opacity" />
    if (saveStatus === 'saved') return <Check className="w-3.5 h-3.5 text-green-600 animate-check-in" />
    return null
  }

  const actionItems = actions.filter((a): a is Exclude<typeof a, 'separator'> => a !== 'separator')

  return (
    <header className="h-12 sm:h-11 flex items-center justify-between px-2 sm:px-4 border-b border-forge-border bg-forge-panel/80 backdrop-blur-sm shrink-0 sticky top-0 z-30">
      {/* Left: Logo + Project */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onSwitchProject}
          className="group/logo flex items-center gap-1.5 sm:gap-2 shrink-0 hover:opacity-80 transition-opacity"
          aria-label="Back to projects"
          title="Back to projects"
        >
          <span className="font-bold text-sm bg-gradient-to-r from-forge-accent to-red-500 bg-clip-text text-transparent transition-transform duration-200 group-hover/logo:scale-105">6-&#x03C7;</span>
          <span className="font-bold text-sm text-forge-text hidden sm:inline">Six-Chi</span>
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
        {/* Branch menu — shown when project has a GitHub repo */}
        {githubRepoUrl && (() => {
          const match = githubRepoUrl.match(/github\.com\/([^/]+)\/([^/]+)/)
          if (!match) return null
          return <BranchMenu owner={match[1]} repo={match[2].replace(/\.git$/, '')} />
        })()}
      </div>

      {/* Center: Action Buttons — desktop only */}
      <div className="hidden md:flex items-center gap-0.5 sm:gap-0 bg-forge-surface/50 rounded-lg px-0.5 py-0.5 border border-forge-border/50">
        {actions.map((action, idx) => {
          if (action === 'separator') {
            return <div key={`sep-${idx}`} className="w-px h-4 bg-forge-border/60 mx-0.5" />
          }
          const saveIcon = action.id === 'save' ? getSaveIcon() : null
          return (
            <button
              key={action.id}
              onClick={() => onAction?.(action.id)}
              disabled={action.id === 'save' && saveStatus === 'saving'}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium text-forge-text-dim hover:text-forge-accent hover:bg-forge-surface rounded transition-all duration-150 hover:scale-105 active:scale-95',
                action.id === 'save' && saveStatus === 'saving' && 'opacity-50 cursor-not-allowed',
                action.id === 'save' && saveStatus === 'saved' && 'text-green-600 animate-success-glow',
                action.id === 'save' && saveStatus === 'error' && 'text-red-600',
                action.id === 'deploy' && 'hover:shadow-[0_0_8px_rgba(99,102,241,0.3)] hover:text-forge-accent',
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

      {/* Right: Desktop controls + Mobile hamburger */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Desktop-only controls */}
        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            className="hidden md:flex items-center gap-2 px-2.5 py-1 text-[11px] text-forge-text-dim bg-forge-surface border border-forge-border rounded-lg hover:border-forge-accent/50 hover:text-forge-text active:bg-forge-surface-hover active:scale-[0.98] transition-all"
          >
            <Search className="w-3 h-3" />
            <span>Commands</span>
            <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-forge-bg border border-forge-border rounded shadow-[0_1px_0_0_var(--color-forge-border)]">Ctrl+K</kbd>
          </button>
        )}
        <span className="hidden md:inline">{notificationSlot}</span>
        <button
          onClick={toggleTheme}
          className="hidden md:block p-1.5 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-all"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          <span className="block transition-transform duration-300" style={{ transform: theme === 'dark' ? 'rotate(0deg)' : 'rotate(180deg)' }}>
            {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          </span>
        </button>

        {/* Desktop auth */}
        <div className="hidden md:flex items-center gap-2">
          {status === 'loading' ? (
            <div className="w-6 h-6 rounded-full bg-forge-surface animate-pulse" />
          ) : session?.user ? (
            <div className="flex items-center gap-1.5">
              <div className="items-center gap-1.5 px-2 py-1 rounded bg-forge-surface text-[10px] text-forge-text-dim hidden lg:flex">
                <Github className="w-3 h-3" />
                <span>{session.githubUsername || session.user.name}</span>
              </div>
              {session.user.image && (
                <img src={session.user.image} alt="" className="w-6 h-6 rounded-full border border-forge-border" />
              )}
              <form action="/api/auth/logout" method="POST" className="flex">
                <button type="submit" className="p-1 text-forge-text-dim hover:text-forge-danger transition-colors" title="Sign out" aria-label="Sign out">
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          ) : (
            <a href="/api/auth/login" className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-forge-surface hover:bg-forge-accent/20 text-xs text-forge-text-dim hover:text-forge-text transition-colors">
              <Github className="w-3.5 h-3.5" />
              <span>Sign in</span>
            </a>
          )}
        </div>

        {/* Mobile hamburger */}
        <div className="md:hidden relative" ref={menuRef}>
          <button
            onClick={() => setMobileMenuOpen(prev => !prev)}
            className="p-2 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-all"
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              className="absolute right-0 top-full mt-1 w-56 bg-forge-bg/95 backdrop-blur-lg border border-forge-border rounded-xl shadow-xl z-50 overflow-hidden">
              {/* User info */}
              {session?.user && (
                <div className="flex items-center gap-2 px-4 py-3 border-b border-forge-border bg-forge-surface/30">
                  {session.user.image && (
                    <img src={session.user.image} alt="" className="w-7 h-7 rounded-full border border-forge-border" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-forge-text truncate">{session.user.name}</p>
                    <p className="text-[10px] text-forge-text-dim truncate">{session.githubUsername || ''}</p>
                  </div>
                </div>
              )}

              {/* Action items */}
              <div className="py-1 divide-y divide-forge-border/30">
                {actionItems.map((action) => {
                  const saveIcon = action.id === 'save' ? getSaveIcon() : null
                  return (
                    <button
                      key={action.id}
                      onClick={() => { onAction?.(action.id); setMobileMenuOpen(false) }}
                      disabled={action.id === 'save' && saveStatus === 'saving'}
                      className={cn(
                        'flex items-center gap-3 w-full px-4 py-2.5 text-xs text-forge-text-dim hover:text-forge-text hover:bg-forge-surface-hover active:scale-[0.98] transition-all duration-150',
                        action.id === 'save' && saveStatus === 'saved' && 'text-green-600',
                      )}
                    >
                      {saveIcon || <action.icon className="w-4 h-4" />}
                      <span>{action.label}</span>
                      <span className="ml-auto text-[10px] text-forge-text-dim/40">{action.tip.split(' ').slice(0, 3).join(' ')}</span>
                    </button>
                  )
                })}
              </div>

              {/* Divider */}
              <div className="border-t border-forge-border" />

              {/* Theme toggle */}
              <button
                onClick={() => { toggleTheme(); setMobileMenuOpen(false) }}
                className="flex items-center gap-3 w-full px-4 py-2.5 text-xs text-forge-text-dim hover:text-forge-text hover:bg-forge-surface-hover transition-colors"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
              </button>

              {/* Auth */}
              {session?.user ? (
                <form action="/api/auth/logout" method="POST">
                  <button type="submit" className="flex items-center gap-3 w-full px-4 py-2.5 text-xs text-forge-text-dim hover:text-forge-danger hover:bg-forge-surface-hover transition-colors">
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </form>
              ) : (
                <a href="/api/auth/login" className="flex items-center gap-3 w-full px-4 py-2.5 text-xs text-forge-text-dim hover:text-forge-text hover:bg-forge-surface-hover transition-colors">
                  <Github className="w-4 h-4" />
                  <span>Sign in with GitHub</span>
                </a>
              )}
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  )
}
