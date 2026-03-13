'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  Activity, Terminal as TerminalIcon, MessageSquare,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

import { ChatPanel } from '@/components/chat-panel'
import { GoalsPanel } from '@/components/agent/goals-panel'
import { ActivityFeed } from '@/components/agent/activity-feed'
import { VitalsPanel } from '@/components/agent/vitals-panel'
import { AgentStatusIndicator } from '@/components/agent/agent-status'
import { useSystemVitals } from '@/hooks/use-system-vitals'
import { useAgentState } from '@/hooks/use-agent-state'

/* ─── Props ─────────────────────────────────────── */

interface AgentDashboardProps {
  // Project context (passed through to ChatPanel)
  projectName: string
  projectId: string | null
  files: Record<string, string>
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileChange: (path: string, content: string) => void
  onFileDelete: (path: string) => void
  onBulkFileUpdate: (files: Record<string, string>) => void
  githubToken?: string
  pendingMessage?: string | null
  onPendingMessageSent?: () => void
}

/* ─── Center Tab Types ──────────────────────────── */

type CenterTab = 'chat' | 'activity' | 'terminal'

/* ─── Component ─────────────────────────────────── */

export function AgentDashboard({
  projectName, projectId, files, activeFile,
  onFileSelect, onFileChange, onFileDelete, onBulkFileUpdate,
  githubToken, pendingMessage, onPendingMessageSent,
}: AgentDashboardProps) {
  const [centerTab, setCenterTab] = useState<CenterTab>('chat')
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)
  const inputBufferRef = useRef('')
  const cwdRef = useRef('~')
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const runningRef = useRef(false)

  // Hooks
  const { vitals, devMode } = useSystemVitals()
  const agent = useAgentState()

  // Connect chat loading state to agent status
  const handleLoadingChange = useCallback((isLoading: boolean) => {
    agent.setAgentStatus(isLoading ? 'thinking' : 'idle')
  }, [agent])

  // Terminal prompt
  const PROMPT = () => `\x1b[32mpi-chi\x1b[0m:\x1b[34m${cwdRef.current}\x1b[0m$ `

  // Initialize xterm terminal
  useEffect(() => {
    if (centerTab !== 'terminal' || !terminalRef.current || xtermRef.current) return

    let cancelled = false

    async function initTerminal() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')

      if (cancelled || !terminalRef.current) return

      const fitAddon = new FitAddon()
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
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

      terminal.writeln('\x1b[36m  Pi-Chi Agent Terminal\x1b[0m')
      terminal.writeln('\x1b[90m  Real system shell — commands execute on the host.\x1b[0m')
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
              body: JSON.stringify({
                command: cmd,
                cwd: cwdRef.current === '~' ? undefined : cwdRef.current,
                timeout: 30000,
              }),
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
            const histCmd = historyRef.current[idx]
            inputBufferRef.current = histCmd
            terminal.write(histCmd)
          }
        } else if (data === '\x1b[B') {
          if (historyIndexRef.current > 0) {
            historyIndexRef.current--
            terminal.write('\r' + PROMPT() + ' '.repeat(inputBufferRef.current.length) + '\r' + PROMPT())
            const histCmd = historyRef.current[historyIndexRef.current]
            inputBufferRef.current = histCmd
            terminal.write(histCmd)
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
  }, [centerTab])

  return (
    <div className="h-full flex flex-col overflow-hidden bg-pi-bg">
      {/* Agent Status Strip */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b border-pi-border bg-pi-panel/50">
        <AgentStatusIndicator status={agent.agentStatus} />
        <div className="flex items-center gap-3 text-[10px] text-pi-text-dim">
          {devMode && (
            <span className="bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full">
              Dev Mode
            </span>
          )}
          <span className="font-mono">{vitals.cpuPercent}% CPU</span>
          <span className="font-mono">{vitals.cpuTemp}°C</span>
        </div>
      </div>

      {/* Main 3-Panel Layout */}
      <PanelGroup direction="horizontal" autoSaveId="pi-agent-dashboard-v1" className="flex-1">
        {/* ─── Left: Goals ─── */}
        <Panel defaultSize={22} minSize={15} maxSize={35}>
          <GoalsPanel goals={agent.goals} />
        </Panel>

        <PanelResizeHandle className="w-3 bg-transparent hover:bg-pi-accent/10 active:bg-pi-accent/20 transition-colors relative flex items-center justify-center cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:-translate-x-1/2 after:w-px after:bg-pi-border">
          <div className="resize-grip-dots"><span /><span /><span /></div>
        </PanelResizeHandle>

        {/* ─── Center: Chat / Activity / Terminal ─── */}
        <Panel defaultSize={48} minSize={30}>
          <div className="h-full flex flex-col bg-pi-bg">
            {/* Tab bar */}
            <div className="flex items-center border-b border-pi-border bg-pi-panel" role="tablist">
              {([
                { id: 'chat' as CenterTab, icon: MessageSquare, label: 'Chat' },
                { id: 'activity' as CenterTab, icon: Activity, label: 'Activity' },
                { id: 'terminal' as CenterTab, icon: TerminalIcon, label: 'Terminal' },
              ]).map(tab => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={centerTab === tab.id}
                  onClick={() => setCenterTab(tab.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all duration-150',
                    centerTab === tab.id
                      ? 'text-pi-accent'
                      : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface/50'
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {centerTab === tab.id && (
                    <motion.span
                      layoutId="agent-center-tab"
                      className="absolute bottom-0 left-1 right-1 h-0.5 bg-pi-accent rounded-full"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* Chat tab — embeds the real ChatPanel */}
            <div className={cn('flex-1 overflow-hidden', centerTab !== 'chat' && 'hidden')}>
              <ChatPanel
                projectName={projectName}
                projectId={projectId}
                files={files}
                onFileChange={onFileChange}
                onFileDelete={onFileDelete}
                onBulkFileUpdate={onBulkFileUpdate}
                githubToken={githubToken}
                pendingMessage={pendingMessage}
                onPendingMessageSent={onPendingMessageSent}
                activeFile={activeFile}
                onLoadingChange={handleLoadingChange}
                onFileSelect={onFileSelect}
              />
            </div>

            {/* Activity tab */}
            <div className={cn('flex-1 overflow-hidden', centerTab !== 'activity' && 'hidden')}>
              <ActivityFeed entries={agent.activity} agentStatus={agent.agentStatus} />
            </div>

            {/* Terminal tab */}
            {centerTab === 'terminal' && (
              <div className="flex-1 bg-[#0a0a0f] overflow-hidden">
                <div ref={terminalRef} className="h-full p-1" />
              </div>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="w-3 bg-transparent hover:bg-pi-accent/10 active:bg-pi-accent/20 transition-colors relative flex items-center justify-center cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:-translate-x-1/2 after:w-px after:bg-pi-border">
          <div className="resize-grip-dots"><span /><span /><span /></div>
        </PanelResizeHandle>

        {/* ─── Right: System Vitals ─── */}
        <Panel defaultSize={30} minSize={20} maxSize={40}>
          <VitalsPanel
            vitals={vitals}
            goals={agent.goals}
            activity={agent.activity}
            devMode={devMode}
          />
        </Panel>
      </PanelGroup>
    </div>
  )
}
