'use client'

import { useState, useEffect, useRef } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  Target, CheckCircle2, Circle, Clock, Play, Pause,
  Brain, Cpu, Thermometer, Wifi, WifiOff,
  Activity, ChevronDown, ChevronRight, Plus,
  Zap, AlertTriangle,
  Terminal as TerminalIcon, MessageSquare,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

/* ─── Types ─────────────────────────────────────────────── */

interface Goal {
  id: string
  title: string
  status: 'active' | 'completed' | 'paused' | 'pending'
  priority: 'high' | 'medium' | 'low'
  tasks: Task[]
  createdAt: string
  reasoning?: string
}

interface Task {
  id: string
  title: string
  status: 'done' | 'running' | 'pending' | 'failed'
  detail?: string
}

interface ActivityEntry {
  id: string
  time: string
  message: string
  type: 'system' | 'goal' | 'action' | 'decision' | 'error' | 'success' | 'gpio' | 'network'
}

interface SystemVitals {
  cpuPercent: number
  cpuTemp: number
  ramUsedMb: number
  ramTotalMb: number
  diskUsedGb: number
  diskTotalGb: number
  uptime: string
  wifiConnected: boolean
  wifiSsid?: string
  ipAddress?: string
  gpioActive: number[]
}

/* ─── Mock Data ─────────────────────────────────────────── */

const MOCK_GOALS: Goal[] = [
  {
    id: '1',
    title: 'Monitor garden environment',
    status: 'active',
    priority: 'high',
    createdAt: new Date().toISOString(),
    reasoning: 'Soil moisture was low yesterday. Setting up continuous monitoring cycle.',
    tasks: [
      { id: '1a', title: 'Read soil moisture sensor (GPIO17)', status: 'done' },
      { id: '1b', title: 'Read temperature sensor (GPIO4)', status: 'done' },
      { id: '1c', title: 'Evaluate watering need', status: 'running', detail: 'Moisture: 62%, threshold: 70%' },
      { id: '1d', title: 'Activate pump if needed (GPIO27)', status: 'pending' },
      { id: '1e', title: 'Log results and schedule next check', status: 'pending' },
    ],
  },
  {
    id: '2',
    title: 'Learn network traffic patterns',
    status: 'pending',
    priority: 'medium',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    tasks: [
      { id: '2a', title: 'Scan local network devices', status: 'pending' },
      { id: '2b', title: 'Baseline traffic analysis', status: 'pending' },
      { id: '2c', title: 'Identify anomalies', status: 'pending' },
    ],
  },
  {
    id: '3',
    title: 'Optimize own performance',
    status: 'completed',
    priority: 'low',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
    tasks: [
      { id: '3a', title: 'Measure response latency', status: 'done' },
      { id: '3b', title: 'Identify slow operations', status: 'done' },
      { id: '3c', title: 'Apply caching strategy', status: 'done' },
    ],
  },
]

const MOCK_ACTIVITY: ActivityEntry[] = [
  { id: '1', time: '07:12', message: 'System boot complete. All services operational.', type: 'system' },
  { id: '2', time: '07:12', message: 'CPU: 42°C | RAM: 1.2GB/4GB | Disk: 12.4GB/32GB', type: 'system' },
  { id: '3', time: '07:13', message: 'Self-assessment: 3 goals pending, 0 urgent alerts.', type: 'decision' },
  { id: '4', time: '07:13', message: 'Goal created: "Monitor garden environment" (priority: high)', type: 'goal' },
  { id: '5', time: '07:14', message: 'GPIO17 configured as INPUT (soil moisture ADC)', type: 'gpio' },
  { id: '6', time: '07:14', message: 'GPIO4 configured as INPUT (DS18B20 temperature)', type: 'gpio' },
  { id: '7', time: '07:15', message: 'Soil moisture reading: 62% (threshold: 70%)', type: 'action' },
  { id: '8', time: '07:15', message: 'Temperature reading: 19.3°C (normal range)', type: 'action' },
  { id: '9', time: '07:16', message: 'Decision: Moisture below threshold. Will activate pump.', type: 'decision' },
  { id: '10', time: '07:16', message: 'GPIO27 set HIGH — pump activated for 45s', type: 'gpio' },
  { id: '11', time: '07:17', message: 'Pump cycle complete. Re-reading moisture...', type: 'action' },
  { id: '12', time: '07:17', message: 'Moisture now 74%. Target met. Task complete.', type: 'success' },
  { id: '13', time: '07:18', message: 'Next soil check scheduled in 2 hours.', type: 'decision' },
  { id: '14', time: '07:20', message: 'Network scan: 7 devices on 192.168.1.0/24', type: 'network' },
]

const MOCK_VITALS: SystemVitals = {
  cpuPercent: 12,
  cpuTemp: 42.3,
  ramUsedMb: 1240,
  ramTotalMb: 4096,
  diskUsedGb: 12.4,
  diskTotalGb: 32,
  uptime: '3d 14h 22m',
  wifiConnected: true,
  wifiSsid: 'HomeNetwork',
  ipAddress: '192.168.1.42',
  gpioActive: [4, 17, 27],
}

/* ─── Sub-Components ────────────────────────────────────── */

function GoalCard({ goal, expanded, onToggle }: { goal: Goal; expanded: boolean; onToggle: () => void }) {
  const statusIcon = {
    active: <Play className="w-3.5 h-3.5 text-emerald-500" />,
    completed: <CheckCircle2 className="w-3.5 h-3.5 text-pi-success" />,
    paused: <Pause className="w-3.5 h-3.5 text-yellow-500" />,
    pending: <Clock className="w-3.5 h-3.5 text-pi-text-dim" />,
  }

  const priorityColor = {
    high: 'border-l-red-500',
    medium: 'border-l-yellow-500',
    low: 'border-l-blue-500',
  }

  const completedTasks = goal.tasks.filter(t => t.status === 'done').length

  return (
    <div className={cn(
      'border border-pi-border rounded-lg bg-pi-surface/50 border-l-2 transition-all',
      priorityColor[goal.priority],
      goal.status === 'active' && 'ring-1 ring-pi-accent/20',
    )}>
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-2 p-3 text-left hover:bg-pi-surface-hover/50 transition-colors rounded-lg"
      >
        {statusIcon[goal.status]}
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-xs font-medium',
            goal.status === 'completed' ? 'text-pi-text-dim line-through' : 'text-pi-text'
          )}>
            {goal.title}
          </p>
          <p className="text-[10px] text-pi-text-dim mt-0.5">
            {completedTasks}/{goal.tasks.length} tasks
          </p>
        </div>
        {expanded ? <ChevronDown className="w-3 h-3 text-pi-text-dim mt-0.5" /> : <ChevronRight className="w-3 h-3 text-pi-text-dim mt-0.5" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {goal.reasoning && (
              <p className="px-3 pb-2 text-[10px] text-pi-text-dim italic border-t border-pi-border/50 pt-2 mx-3">
                {goal.reasoning}
              </p>
            )}
            <div className="px-3 pb-3 space-y-1">
              {goal.tasks.map(task => (
                <div key={task.id} className="flex items-start gap-2 py-1">
                  {task.status === 'done' && <CheckCircle2 className="w-3 h-3 text-pi-success mt-0.5 shrink-0" />}
                  {task.status === 'running' && <div className="w-3 h-3 mt-0.5 shrink-0 rounded-full border-2 border-pi-accent border-t-transparent animate-spin" />}
                  {task.status === 'pending' && <Circle className="w-3 h-3 text-pi-text-dim/30 mt-0.5 shrink-0" />}
                  {task.status === 'failed' && <AlertTriangle className="w-3 h-3 text-red-500 mt-0.5 shrink-0" />}
                  <div className="min-w-0">
                    <p className={cn(
                      'text-[11px]',
                      task.status === 'done' ? 'text-pi-text-dim line-through' : task.status === 'running' ? 'text-pi-text font-medium shimmer-text' : 'text-pi-text-dim'
                    )}>
                      {task.title}
                    </p>
                    {task.detail && (
                      <p className="text-[10px] text-pi-text-dim/60 mt-0.5">{task.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function VitalBar({ label, value, max, unit, color }: { label: string; value: number; max: number; unit: string; color: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-pi-text-dim">{label}</span>
        <span className="text-pi-text font-mono">{value}{unit} / {max}{unit}</span>
      </div>
      <div className="h-1.5 bg-pi-surface rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/* ─── Main Component ────────────────────────────────────── */

type CenterTab = 'activity' | 'terminal' | 'chat'

export function MissionControl() {
  const [goals] = useState<Goal[]>(MOCK_GOALS)
  const [activity] = useState<ActivityEntry[]>(MOCK_ACTIVITY)
  const [vitals] = useState<SystemVitals>(MOCK_VITALS)
  const [expandedGoal, setExpandedGoal] = useState<string | null>(MOCK_GOALS[0]?.id || null)
  const [centerTab, setCenterTab] = useState<CenterTab>('activity')
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)
  const inputBufferRef = useRef('')
  const cwdRef = useRef('~')
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const runningRef = useRef(false)
  const [chatInput, setChatInput] = useState('')

  const PROMPT = () => `\x1b[32mpi-chi\x1b[0m:\x1b[34m${cwdRef.current}\x1b[0m$ `

  // Initialize xterm terminal with real command execution
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

      // Welcome banner
      terminal.writeln('\x1b[36m  Pi-Chi Agent Terminal\x1b[0m')
      terminal.writeln('\x1b[90m  Real system shell — commands execute on the host.\x1b[0m')
      terminal.writeln('\x1b[90m  Type commands or let the AI use this terminal autonomously.\x1b[0m')
      terminal.writeln('')
      terminal.write(PROMPT())

      // Handle keyboard input
      terminal.onData(async (data: string) => {
        if (runningRef.current) return // ignore input while command runs

        const code = data.charCodeAt(0)

        if (data === '\r') {
          // Enter — execute command
          terminal.writeln('')
          const cmd = inputBufferRef.current.trim()
          inputBufferRef.current = ''
          historyIndexRef.current = -1

          if (!cmd) {
            terminal.write(PROMPT())
            return
          }

          // Add to history
          historyRef.current.unshift(cmd)
          if (historyRef.current.length > 100) historyRef.current.pop()

          // Handle `cd` locally (server can't change cwd persistently)
          if (/^cd\s/.test(cmd) || cmd === 'cd') {
            const dir = cmd.replace(/^cd\s*/, '').trim() || '~'
            cwdRef.current = dir.startsWith('/') ? dir : dir === '~' ? '~' : `${cwdRef.current === '~' ? '~' : cwdRef.current}/${dir}`
            terminal.write(PROMPT())
            return
          }

          if (cmd === 'clear') {
            terminal.clear()
            terminal.write(PROMPT())
            return
          }

          runningRef.current = true
          terminal.write('\x1b[90m⏳ running...\x1b[0m\r\n')

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

            // Clear the "running..." line
            terminal.write('\x1b[A\x1b[2K')

            if (result.stdout) {
              terminal.writeln(result.stdout.replace(/\n$/, ''))
            }
            if (result.stderr) {
              terminal.writeln(`\x1b[31m${result.stderr.replace(/\n$/, '')}\x1b[0m`)
            }
            if (result.error && !result.stdout && !result.stderr) {
              terminal.writeln(`\x1b[31m${result.error}\x1b[0m`)
            }
            if (result.warnings) {
              for (const w of result.warnings) {
                terminal.writeln(`\x1b[33m${w}\x1b[0m`)
              }
            }

            // Show exit code if non-zero
            if (result.exitCode !== 0) {
              terminal.writeln(`\x1b[90mexit code: ${result.exitCode}\x1b[0m`)
            }

            // Update cwd if server reports it
            if (result.cwd) {
              cwdRef.current = result.cwd.replace(/^.*[/\\]/, '') || '/'
            }
          } catch (err) {
            terminal.write('\x1b[A\x1b[2K')
            terminal.writeln(`\x1b[31mFetch error: ${err instanceof Error ? err.message : 'unknown'}\x1b[0m`)
          }

          runningRef.current = false
          terminal.write(PROMPT())
        } else if (data === '\x7f' || data === '\b') {
          // Backspace
          if (inputBufferRef.current.length > 0) {
            inputBufferRef.current = inputBufferRef.current.slice(0, -1)
            terminal.write('\b \b')
          }
        } else if (data === '\x1b[A') {
          // Up arrow — history
          if (historyRef.current.length > 0) {
            const idx = Math.min(historyIndexRef.current + 1, historyRef.current.length - 1)
            historyIndexRef.current = idx
            // Clear current input
            terminal.write('\r' + PROMPT() + ' '.repeat(inputBufferRef.current.length) + '\r' + PROMPT())
            const histCmd = historyRef.current[idx]
            inputBufferRef.current = histCmd
            terminal.write(histCmd)
          }
        } else if (data === '\x1b[B') {
          // Down arrow — history
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
          // Ctrl+C
          inputBufferRef.current = ''
          terminal.writeln('^C')
          terminal.write(PROMPT())
        } else if (code >= 32) {
          // Regular printable character
          inputBufferRef.current += data
          terminal.write(data)
        }
      })

      // Resize observer
      const observer = new ResizeObserver(() => {
        try { fitAddon.fit() } catch {}
      })
      observer.observe(terminalRef.current!)
    }

    initTerminal()
    return () => { cancelled = true }
  }, [centerTab])

  const getActivityIcon = (type: ActivityEntry['type']) => {
    switch (type) {
      case 'system': return <Cpu className="w-3 h-3 text-cyan-500" />
      case 'goal': return <Target className="w-3 h-3 text-pi-accent" />
      case 'action': return <Zap className="w-3 h-3 text-yellow-500" />
      case 'decision': return <Brain className="w-3 h-3 text-purple-500" />
      case 'error': return <AlertTriangle className="w-3 h-3 text-red-500" />
      case 'success': return <CheckCircle2 className="w-3 h-3 text-emerald-500" />
      case 'gpio': return <Activity className="w-3 h-3 text-orange-500" />
      case 'network': return <Wifi className="w-3 h-3 text-blue-500" />
    }
  }

  return (
    <div className="h-full flex flex-col overflow-hidden bg-pi-bg">
      <PanelGroup direction="horizontal" autoSaveId="pi-mission-control-v1">
        {/* ─── Left Panel: Goal / Task Tree ─── */}
        <Panel defaultSize={25} minSize={18} maxSize={35}>
          <div className="h-full flex flex-col bg-pi-panel border-r border-pi-border">
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-pi-border">
              <div className="flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-pi-accent" />
                <span className="text-xs font-semibold text-pi-text">Goals</span>
                <span className="text-[10px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full">
                  {goals.filter(g => g.status === 'active').length} active
                </span>
              </div>
              <button
                className="p-1 rounded text-pi-text-dim hover:text-pi-accent hover:bg-pi-surface transition-colors"
                title="AI will set its own goals"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {goals.map(goal => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  expanded={expandedGoal === goal.id}
                  onToggle={() => setExpandedGoal(prev => prev === goal.id ? null : goal.id)}
                />
              ))}
            </div>

            {/* Goal summary footer */}
            <div className="px-3 py-2 border-t border-pi-border text-[10px] text-pi-text-dim flex items-center justify-between">
              <span>{goals.filter(g => g.status === 'completed').length} completed today</span>
              <span className="text-pi-accent font-medium">{goals.reduce((acc, g) => acc + g.tasks.filter(t => t.status === 'running').length, 0)} running</span>
            </div>
          </div>
        </Panel>

        <PanelResizeHandle className="w-3 bg-transparent hover:bg-pi-accent/10 active:bg-pi-accent/20 transition-colors relative flex items-center justify-center cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:-translate-x-1/2 after:w-px after:bg-pi-border">
          <div className="resize-grip-dots"><span /><span /><span /></div>
        </PanelResizeHandle>

        {/* ─── Center Panel: Activity / Terminal / Chat ─── */}
        <Panel defaultSize={45} minSize={30}>
          <div className="h-full flex flex-col bg-pi-bg">
            {/* Tab bar */}
            <div className="flex items-center border-b border-pi-border bg-pi-panel" role="tablist">
              {([
                { id: 'activity' as CenterTab, icon: Activity, label: 'Activity' },
                { id: 'terminal' as CenterTab, icon: TerminalIcon, label: 'Terminal' },
                { id: 'chat' as CenterTab, icon: MessageSquare, label: 'Chat' },
              ]).map(tab => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={centerTab === tab.id}
                  onClick={() => setCenterTab(tab.id)}
                  className={cn(
                    'relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all duration-150',
                    centerTab === tab.id ? 'text-pi-accent' : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface/50'
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {centerTab === tab.id && (
                    <motion.span layoutId="center-tab-indicator" className="absolute bottom-0 left-1 right-1 h-0.5 bg-pi-accent rounded-full" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                  )}
                </button>
              ))}
              <div className="flex-1" />
              {centerTab === 'activity' && (
                <div className="flex items-center gap-2 text-[10px] text-pi-text-dim pr-3">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live
                  </span>
                </div>
              )}
            </div>

            {/* Activity Log view */}
            {centerTab === 'activity' && (
              <>
                <div className="flex-1 overflow-y-auto">
                  <div className="px-4 py-3 space-y-0.5">
                    {activity.map((entry, i) => (
                      <motion.div
                        key={entry.id}
                        initial={i > activity.length - 3 ? { opacity: 0, x: 8 } : false}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-start gap-2.5 py-1.5 group hover:bg-pi-surface/30 -mx-2 px-2 rounded transition-colors"
                      >
                        <span className="mt-0.5 shrink-0">{getActivityIcon(entry.type)}</span>
                        <span className="text-[10px] text-pi-text-dim/50 font-mono shrink-0 mt-px">{entry.time}</span>
                        <span className={cn(
                          'text-[11px] leading-relaxed',
                          entry.type === 'error' ? 'text-red-400' :
                          entry.type === 'success' ? 'text-emerald-400' :
                          entry.type === 'decision' ? 'text-purple-400' :
                          entry.type === 'goal' ? 'text-pi-accent' :
                          entry.type === 'gpio' ? 'text-orange-400' :
                          'text-pi-text-dim'
                        )}>
                          {entry.message}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>
                {/* Thinking indicator */}
                <div className="px-4 py-2 border-t border-pi-border bg-pi-panel/50 flex items-center gap-2">
                  <Brain className="w-3.5 h-3.5 text-pi-accent thinking-brain" />
                  <span className="text-[11px] text-pi-text-dim shimmer-task">Evaluating next action...</span>
                </div>
              </>
            )}

            {/* Terminal view */}
            {centerTab === 'terminal' && (
              <div className="flex-1 bg-[#0a0a0f] overflow-hidden">
                <div ref={terminalRef} className="h-full p-1" />
              </div>
            )}

            {/* Chat view */}
            {centerTab === 'chat' && (
              <div className="flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="max-w-2xl mx-auto space-y-4">
                    {/* System message */}
                    <div className="flex gap-3">
                      <div className="w-7 h-7 rounded-full bg-pi-accent/10 flex items-center justify-center shrink-0">
                        <Brain className="w-4 h-4 text-pi-accent" />
                      </div>
                      <div className="bg-pi-surface rounded-lg p-3 text-xs text-pi-text-dim leading-relaxed">
                        <p className="text-pi-text font-medium mb-1">Pi-Chi Agent</p>
                        I'm your autonomous AI agent running on this Raspberry Pi. I can control GPIO pins, manage system processes, monitor sensors, and set my own goals. Ask me anything or give me a directive.
                      </div>
                    </div>
                  </div>
                </div>
                {/* Chat input */}
                <div className="border-t border-pi-border p-3 bg-pi-panel">
                  <div className="max-w-2xl mx-auto flex gap-2">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Talk to Pi-Chi or give a directive..."
                      className="flex-1 bg-pi-bg border border-pi-border rounded-lg px-3 py-2 text-xs text-pi-text placeholder:text-pi-text-dim/40 focus:outline-none focus:border-pi-accent transition-colors"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && chatInput.trim()) {
                          setChatInput('')
                        }
                      }}
                    />
                    <button
                      className="px-3 py-2 bg-pi-accent text-white rounded-lg text-xs font-medium hover:bg-pi-accent-hover transition-colors disabled:opacity-50"
                      disabled={!chatInput.trim()}
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Panel>

        <PanelResizeHandle className="w-3 bg-transparent hover:bg-pi-accent/10 active:bg-pi-accent/20 transition-colors relative flex items-center justify-center cursor-col-resize after:absolute after:inset-y-0 after:left-1/2 after:-translate-x-1/2 after:w-px after:bg-pi-border">
          <div className="resize-grip-dots"><span /><span /><span /></div>
        </PanelResizeHandle>

        {/* ─── Right Panel: System Vitals ─── */}
        <Panel defaultSize={30} minSize={20} maxSize={40}>
          <div className="h-full flex flex-col bg-pi-panel border-l border-pi-border">
            <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-pi-border">
              <Cpu className="w-3.5 h-3.5 text-cyan-500" />
              <span className="text-xs font-semibold text-pi-text">System Vitals</span>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-4">
              {/* Connection */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-pi-surface border border-pi-border">
                <div className="flex items-center gap-2">
                  {vitals.wifiConnected ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
                  <div>
                    <p className="text-[11px] font-medium text-pi-text">{vitals.wifiConnected ? vitals.wifiSsid : 'Disconnected'}</p>
                    <p className="text-[10px] text-pi-text-dim">{vitals.ipAddress}</p>
                  </div>
                </div>
                <span className={cn(
                  'text-[10px] px-2 py-0.5 rounded-full font-medium',
                  vitals.wifiConnected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'
                )}>
                  {vitals.wifiConnected ? 'Online' : 'Offline'}
                </span>
              </div>

              {/* CPU + Temp */}
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-lg bg-pi-surface border border-pi-border text-center">
                  <Cpu className="w-4 h-4 text-cyan-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-pi-text font-mono">{vitals.cpuPercent}%</p>
                  <p className="text-[10px] text-pi-text-dim">CPU Usage</p>
                </div>
                <div className="p-2.5 rounded-lg bg-pi-surface border border-pi-border text-center">
                  <Thermometer className={cn('w-4 h-4 mx-auto mb-1', vitals.cpuTemp > 70 ? 'text-red-500' : vitals.cpuTemp > 55 ? 'text-orange-500' : 'text-emerald-500')} />
                  <p className="text-lg font-bold text-pi-text font-mono">{vitals.cpuTemp}°</p>
                  <p className="text-[10px] text-pi-text-dim">Temperature</p>
                </div>
              </div>

              {/* RAM + Disk bars */}
              <div className="space-y-3">
                <VitalBar label="RAM" value={vitals.ramUsedMb} max={vitals.ramTotalMb} unit="MB" color="bg-purple-500" />
                <VitalBar label="Disk" value={vitals.diskUsedGb} max={vitals.diskTotalGb} unit="GB" color="bg-blue-500" />
              </div>

              {/* Uptime */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-pi-surface border border-pi-border">
                <span className="text-[11px] text-pi-text-dim">Uptime</span>
                <span className="text-[11px] font-mono text-pi-text font-medium">{vitals.uptime}</span>
              </div>

              {/* GPIO Status */}
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Activity className="w-3.5 h-3.5 text-orange-500" />
                  <span className="text-[11px] font-semibold text-pi-text">GPIO Pins</span>
                </div>
                <div className="grid grid-cols-8 gap-1">
                  {Array.from({ length: 40 }, (_, i) => i + 1).map(pin => {
                    const isActive = vitals.gpioActive.includes(pin)
                    return (
                      <div
                        key={pin}
                        title={`GPIO ${pin}${isActive ? ' (active)' : ''}`}
                        className={cn(
                          'w-full aspect-square rounded text-[8px] font-mono flex items-center justify-center border transition-all',
                          isActive
                            ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.3)]'
                            : 'bg-pi-surface border-pi-border/50 text-pi-text-dim/30'
                        )}
                      >
                        {pin}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Agent Brain Status */}
              <div className="p-2.5 rounded-lg bg-gradient-to-br from-pi-accent/5 to-purple-500/5 border border-pi-accent/20">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-4 h-4 text-pi-accent" />
                  <span className="text-[11px] font-semibold text-pi-text">Agent Brain</span>
                </div>
                <div className="space-y-1.5 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-pi-text-dim">Mode</span>
                    <span className="text-emerald-500 font-medium">Autonomous</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-pi-text-dim">Active goals</span>
                    <span className="text-pi-text font-mono">{goals.filter(g => g.status === 'active').length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-pi-text-dim">Decisions today</span>
                    <span className="text-pi-text font-mono">{activity.filter(a => a.type === 'decision').length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-pi-text-dim">GPIO interactions</span>
                    <span className="text-pi-text font-mono">{activity.filter(a => a.type === 'gpio').length}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  )
}
