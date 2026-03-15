'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from '@/components/session-provider'
import {
  Brain, Github, LogOut,
  Code, Terminal, Radio, Library,
  Wifi, WifiOff,
  Sun, Moon,
  Menu, X, Settings,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '@/components/theme-provider'
import { cn } from '@/lib/utils'
import type { AppMode } from '@/lib/agent-types'

interface HeaderProps {
  projectName: string
  onSwitchProject: () => void
  fileCount: number
  onAction?: (action: string) => void
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
  onOpenCommandPalette?: () => void
  notificationSlot?: React.ReactNode
  githubRepoUrl?: string | null
  vercelUrl?: string | null
  currentBranch?: string
  onBranchChange?: (branch: string) => void
  mode?: AppMode
  onModeChange?: (mode: AppMode) => void
}

const modeTabs: Array<{ id: AppMode; icon: typeof Brain; label: string; shortcut: string }> = [
  { id: 'agent', icon: Brain, label: 'Agent', shortcut: '1' },
  { id: 'ide', icon: Code, label: 'IDE', shortcut: '2' },
  { id: 'terminal', icon: Terminal, label: 'Shell', shortcut: '3' },
  { id: 'radio', icon: Radio, label: 'Radio', shortcut: '4' },
  { id: 'library', icon: Library, label: 'Library', shortcut: '5' },
]

export function Header({
  onSwitchProject, onAction, onOpenCommandPalette, notificationSlot,
  mode = 'agent', onModeChange,
}: HeaderProps) {
  const { session, status } = useSession()
  const { theme, toggleTheme } = useTheme()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const [piOnline, setPiOnline] = useState(true)

  // Poll /api/health every 30s to track real connectivity
  useEffect(() => {
    let mounted = true
    const controller = new AbortController()

    async function checkHealth() {
      try {
        const res = await fetch('/api/health', { signal: controller.signal })
        if (mounted) setPiOnline(res.ok)
      } catch {
        if (mounted) setPiOnline(false)
      }
    }

    checkHealth()
    const timer = setInterval(checkHealth, 30_000)

    return () => {
      mounted = false
      controller.abort()
      clearInterval(timer)
    }
  }, [])

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

  return (
    <header className="h-12 sm:h-11 flex items-center justify-between px-2 sm:px-4 border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm shrink-0 sticky top-0 z-30">
      {/* Left: Logo + Connection */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <button
          onClick={onSwitchProject}
          className="group/logo flex items-center gap-1.5 sm:gap-2 shrink-0 hover:opacity-80 transition-opacity"
          aria-label="Pi-Chi Home"
          title="Pi-Chi Home"
        >
          <span className="font-bold text-sm bg-gradient-to-r from-pi-accent to-red-500 bg-clip-text text-transparent transition-transform duration-200 group-hover/logo:scale-105">&pi;-&chi;</span>
          <span className="font-bold text-sm text-pi-text hidden sm:inline">Pi-Chi</span>
        </button>

        {/* Connection status */}
        <span className={cn(
          "flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full",
          piOnline ? "text-emerald-500 bg-emerald-500/10" : "text-red-500 bg-red-500/10"
        )}>
          {piOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          <span className="hidden sm:inline">{piOnline ? 'Connected' : 'Offline'}</span>
          {piOnline && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
        </span>
      </div>

      {/* Center: Mode Tabs */}
      <nav aria-label="View mode" className="hidden md:flex items-center gap-0.5 bg-pi-surface/50 rounded-lg px-0.5 py-0.5 border border-pi-border/50">
        {modeTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => onModeChange?.(tab.id)}
            className={cn(
              'relative flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md transition-all duration-150',
              mode === tab.id
                ? 'text-pi-accent bg-pi-bg shadow-sm'
                : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface/80'
            )}
            title={`${tab.label} (Ctrl+${tab.shortcut})`}
            aria-label={`${tab.label} mode`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">{tab.label}</span>
            {mode === tab.id && (
              <motion.span
                layoutId="header-mode-tab"
                className="absolute inset-0 rounded-md bg-pi-bg shadow-sm -z-10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </nav>

      {/* Right: Controls */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Settings button */}
        <button
          onClick={() => onAction?.('settings')}
          className="hidden md:flex items-center gap-1.5 p-1.5 rounded-lg text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-all"
          title="Settings"
          aria-label="Settings"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {onOpenCommandPalette && (
          <button
            onClick={onOpenCommandPalette}
            aria-label="Open command palette"
            className="hidden md:flex items-center gap-2 px-2.5 py-1 text-[11px] text-pi-text-dim bg-pi-surface border border-pi-border rounded-lg hover:border-pi-accent/50 hover:text-pi-text active:bg-pi-surface-hover active:scale-[0.98] transition-all"
          >
            <kbd className="px-1.5 py-0.5 text-[9px] font-mono bg-pi-bg border border-pi-border rounded shadow-[0_1px_0_0_var(--color-pi-border)]">Ctrl+K</kbd>
          </button>
        )}

        <span className="hidden md:inline">{notificationSlot}</span>

        <button
          onClick={toggleTheme}
          className="hidden md:block p-1.5 rounded-lg text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-all"
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
            <div className="w-6 h-6 rounded-full bg-pi-surface animate-pulse" />
          ) : session?.user ? (
            <div className="flex items-center gap-1.5">
              <div className="items-center gap-1.5 px-2 py-1 rounded bg-pi-surface text-[10px] text-pi-text-dim hidden lg:flex">
                <Github className="w-3 h-3" />
                <span>{session.githubUsername || session.user.name}</span>
              </div>
              {session.user.image && (
                <img src={session.user.image} alt="" className="w-6 h-6 rounded-full border border-pi-border" />
              )}
              <form action="/api/auth/logout" method="POST" className="flex">
                <button type="submit" className="p-1 text-pi-text-dim hover:text-pi-danger transition-colors" title="Sign out" aria-label="Sign out">
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          ) : (
            <a href="/api/auth/login" className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-pi-surface hover:bg-pi-accent/20 text-xs text-pi-text-dim hover:text-pi-text transition-colors">
              <Github className="w-3.5 h-3.5" />
              <span>Sign in</span>
            </a>
          )}
        </div>

        {/* Mobile hamburger */}
        <div className="md:hidden relative" ref={menuRef}>
          <button
            onClick={() => setMobileMenuOpen(prev => !prev)}
            className="p-2 rounded-lg text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-all"
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
              className="absolute right-0 top-full mt-1 w-56 bg-pi-bg/95 backdrop-blur-lg border border-pi-border rounded-xl shadow-xl z-50 overflow-hidden">
              {session?.user && (
                <div className="flex items-center gap-2 px-4 py-3 border-b border-pi-border bg-pi-surface/30">
                  {session.user.image && (
                    <img src={session.user.image} alt="" className="w-7 h-7 rounded-full border border-pi-border" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-pi-text truncate">{session.user.name}</p>
                    <p className="text-[10px] text-pi-text-dim truncate">{session.githubUsername || ''}</p>
                  </div>
                </div>
              )}

              {/* Mode switcher for mobile */}
              <div className="py-1 border-b border-pi-border/30">
                <p className="px-4 py-1 text-[10px] text-pi-text-dim uppercase tracking-wider">View Mode</p>
                {modeTabs.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => { onModeChange?.(tab.id); setMobileMenuOpen(false) }}
                    className={cn(
                      'flex items-center gap-3 w-full px-4 py-2.5 text-xs transition-all duration-150',
                      mode === tab.id
                        ? 'text-pi-accent bg-pi-accent/5'
                        : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface-hover'
                    )}
                  >
                    <tab.icon className="w-4 h-4" />
                    <span>{tab.label}</span>
                    {mode === tab.id && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-pi-accent" />}
                  </button>
                ))}
              </div>

              <div className="py-1">
                <button
                  onClick={() => { onAction?.('settings'); setMobileMenuOpen(false) }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-xs text-pi-text-dim hover:text-pi-text hover:bg-pi-surface-hover transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>Settings</span>
                </button>

                <button
                  onClick={() => { toggleTheme(); setMobileMenuOpen(false) }}
                  className="flex items-center gap-3 w-full px-4 py-2.5 text-xs text-pi-text-dim hover:text-pi-text hover:bg-pi-surface-hover transition-colors"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
                </button>
              </div>

              {session?.user ? (
                <form action="/api/auth/logout" method="POST" className="border-t border-pi-border">
                  <button type="submit" className="flex items-center gap-3 w-full px-4 py-2.5 text-xs text-pi-text-dim hover:text-pi-danger hover:bg-pi-surface-hover transition-colors">
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </form>
              ) : (
                <a href="/api/auth/login" className="flex items-center gap-3 w-full px-4 py-2.5 text-xs text-pi-text-dim hover:text-pi-text hover:bg-pi-surface-hover transition-colors border-t border-pi-border">
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
