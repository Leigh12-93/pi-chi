'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { Header } from '@/components/header'
import { AgentDashboard } from '@/components/agent-dashboard'
import { Workspace } from '@/components/workspace'
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
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)
  const inputBufferRef = useRef('')
  const cwdRef = useRef('~')
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const runningRef = useRef(false)

  // Keyboard shortcuts: Ctrl+1/2/3 to switch modes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        if (e.key === '1') { e.preventDefault(); setMode('agent') }
        else if (e.key === '2') { e.preventDefault(); setMode('ide') }
        else if (e.key === '3') { e.preventDefault(); setMode('terminal') }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  // Full-screen terminal prompt
  const PROMPT = () => `\x1b[32mpi-chi\x1b[0m:\x1b[34m${cwdRef.current}\x1b[0m$ `

  // Full-screen terminal init
  useEffect(() => {
    if (mode !== 'terminal' || !terminalRef.current || xtermRef.current) return

    let cancelled = false

    async function initTerminal() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')

      if (cancelled || !terminalRef.current) return

      const fitAddon = new FitAddon()
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 14,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
        theme: {
          background: '#0a0a0f',
          foreground: '#e4e4e7',
          cursor: '#a78bfa',
          selectionBackground: '#a78bfa40',
          black: '#18181b',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
          blue: '#3b82f6',
          magenta: '#a78bfa',
          cyan: '#06b6d4',
          white: '#e4e4e7',
        },
        allowProposedApi: true,
      })

      terminal.loadAddon(fitAddon)
      terminal.open(terminalRef.current!)
      fitAddon.fit()
      xtermRef.current = terminal

      terminal.writeln('\x1b[36m  Pi-Chi Full Terminal\x1b[0m')
      terminal.writeln('\x1b[90m  Press Ctrl+1 to return to Agent view.\x1b[0m')
      terminal.writeln('')
      terminal.write(PROMPT())

      terminal.onData(async (data: string) => {
        if (runningRef.current) return
        const code = data.charCodeAt(0)

        if (data === '\r') {
          terminal.writeln('')
          const cmd = inputBufferRef.current.trim()
          inputBufferRef.current = ''
          historyIndexRef.current = -1

          if (!cmd) { terminal.write(PROMPT()); return }

          historyRef.current.unshift(cmd)
          if (historyRef.current.length > 100) historyRef.current.pop()

          if (/^cd\s/.test(cmd) || cmd === 'cd') {
            const dir = cmd.replace(/^cd\s*/, '').trim() || '~'
            cwdRef.current = dir.startsWith('/') ? dir : dir === '~' ? '~' : `${cwdRef.current === '~' ? '~' : cwdRef.current}/${dir}`
            terminal.write(PROMPT())
            return
          }
          if (cmd === 'clear') { terminal.clear(); terminal.write(PROMPT()); return }

          runningRef.current = true
          terminal.write('\x1b[90m running...\x1b[0m\r\n')

          try {
            const res = await fetch('/api/terminal', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ command: cmd, cwd: cwdRef.current === '~' ? undefined : cwdRef.current, timeout: 30000 }),
            })
            const result = await res.json()
            terminal.write('\x1b[A\x1b[2K')

            if (result.stdout) terminal.writeln(result.stdout.replace(/\n$/, ''))
            if (result.stderr) terminal.writeln(`\x1b[31m${result.stderr.replace(/\n$/, '')}\x1b[0m`)
            if (result.error && !result.stdout && !result.stderr) terminal.writeln(`\x1b[31m${result.error}\x1b[0m`)
            if (result.warnings) result.warnings.forEach((w: string) => terminal.writeln(`\x1b[33m${w}\x1b[0m`))
            if (result.exitCode !== 0) terminal.writeln(`\x1b[90mexit code: ${result.exitCode}\x1b[0m`)
            if (result.cwd) cwdRef.current = result.cwd.replace(/^.*[/\\]/, '') || '/'
          } catch (err) {
            terminal.write('\x1b[A\x1b[2K')
            terminal.writeln(`\x1b[31mFetch error: ${err instanceof Error ? err.message : 'unknown'}\x1b[0m`)
          }

          runningRef.current = false
          terminal.write(PROMPT())
        } else if (data === '\x7f' || data === '\b') {
          if (inputBufferRef.current.length > 0) {
            inputBufferRef.current = inputBufferRef.current.slice(0, -1)
            terminal.write('\b \b')
          }
        } else if (data === '\x1b[A') {
          if (historyRef.current.length > 0) {
            const idx = Math.min(historyIndexRef.current + 1, historyRef.current.length - 1)
            historyIndexRef.current = idx
            terminal.write('\r' + PROMPT() + ' '.repeat(inputBufferRef.current.length) + '\r' + PROMPT())
            inputBufferRef.current = historyRef.current[idx]
            terminal.write(inputBufferRef.current)
          }
        } else if (data === '\x1b[B') {
          if (historyIndexRef.current > 0) {
            historyIndexRef.current--
            terminal.write('\r' + PROMPT() + ' '.repeat(inputBufferRef.current.length) + '\r' + PROMPT())
            inputBufferRef.current = historyRef.current[historyIndexRef.current]
            terminal.write(inputBufferRef.current)
          } else if (historyIndexRef.current === 0) {
            historyIndexRef.current = -1
            terminal.write('\r' + PROMPT() + ' '.repeat(inputBufferRef.current.length) + '\r' + PROMPT())
            inputBufferRef.current = ''
          }
        } else if (code === 3) {
          inputBufferRef.current = ''
          terminal.writeln('^C')
          terminal.write(PROMPT())
        } else if (code >= 32) {
          inputBufferRef.current += data
          terminal.write(data)
        }
      })

      const observer = new ResizeObserver(() => {
        try { fitAddon.fit() } catch {}
      })
      observer.observe(terminalRef.current!)
    }

    initTerminal()
    return () => { cancelled = true }
  }, [mode])

  const handleSwitchProject = useCallback(() => {
    setMode('agent')
    onSwitchProject()
  }, [onSwitchProject])

  return (
    <div className="h-screen flex flex-col bg-pi-bg">
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
          <div ref={terminalRef} className="h-full p-2" />
        </div>
      )}
    </div>
  )
}
