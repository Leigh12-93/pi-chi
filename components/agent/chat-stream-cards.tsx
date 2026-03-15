'use client'

import { useState } from 'react'
import {
  Wrench, CheckCircle2, XCircle, Loader2,
  Terminal, FileCode, GitBranch, Hammer, Globe, Server, Brain,
  MessageCircle, Cpu, Code, Heart,
  Target, ChevronDown, ChevronUp,
  Activity, HardDrive, Thermometer,
  FilePlus, FilePen, FileSearch,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type {
  ChatStreamComponent,
  ToolCallComponent,
  StateSnapshotComponent,
  GoalProgressComponent,
  CodeBlockComponent,
  ToolCategory,
  ToolExecutionEvent,
} from '@/lib/brain/domain-types'

/* ─── Shared helpers ───────────────────────────── */

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
}

function formatToolName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/* ─── Category icon map ────────────────────────── */

const categoryIcons: Record<ToolCategory, React.ElementType> = {
  shell: Terminal,
  file: FileCode,
  git: GitBranch,
  build: Hammer,
  network: Globe,
  system: Server,
  brain: Brain,
  comms: MessageCircle,
  gpio: Cpu,
  coding: Code,
  other: Wrench,
}

/* ─── StatusIcon ───────────────────────────────── */

function StatusIcon({ status }: { status: ToolExecutionEvent['status'] }) {
  if (status === 'running') {
    return (
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
      >
        <Loader2 className="w-3.5 h-3.5 text-pi-accent" />
      </motion.div>
    )
  }
  if (status === 'completed') {
    return <CheckCircle2 className="w-3.5 h-3.5 text-pi-success" />
  }
  return <XCircle className="w-3.5 h-3.5 text-pi-danger" />
}

/* ═══════════════════════════════════════════════
   InlineToolCall
   ═══════════════════════════════════════════════ */

export function InlineToolCall({ event }: { event: ToolExecutionEvent }) {
  const [expanded, setExpanded] = useState(false)
  const CategoryIcon = categoryIcons[event.category] || Wrench
  const isRunning = event.status === 'running'
  const isFailed = event.status === 'failed'

  const resultText = event.error || event.resultSummary
  const resultLong = resultText && resultText.length > 80

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className={cn(
        'ml-9 rounded-lg border px-3 py-2 text-[11px]',
        'bg-pi-surface border-pi-border/60',
        isRunning && 'border-pi-accent/30 bg-pi-accent/5',
        isFailed && 'border-pi-danger/30 bg-pi-danger/5',
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <StatusIcon status={event.status} />
        <CategoryIcon className="w-3 h-3 text-pi-text-dim shrink-0" />
        <span className={cn(
          'font-medium flex-1 truncate',
          isRunning ? 'text-pi-accent' : isFailed ? 'text-pi-danger' : 'text-pi-text',
        )}>
          {formatToolName(event.toolName)}
        </span>

        {/* Duration badge */}
        {event.durationMs !== undefined && (
          <span className={cn(
            'shrink-0 font-mono text-[9px] px-1.5 py-0.5 rounded border',
            isFailed
              ? 'text-pi-danger border-pi-danger/30 bg-pi-danger/10'
              : 'text-pi-text-dim border-pi-border/50 bg-pi-panel/50',
          )}>
            {formatDuration(event.durationMs)}
          </span>
        )}

        {isRunning && (
          <span className="shrink-0 text-[9px] text-pi-accent/70 font-medium animate-pulse">
            running
          </span>
        )}
      </div>

      {/* Input summary */}
      {event.inputSummary && (
        <p className="mt-1 text-[10px] text-pi-text-dim/70 font-mono truncate leading-tight">
          {event.inputSummary}
        </p>
      )}

      {/* Result / error — collapsible if long */}
      {resultText && (
        <div className="mt-1">
          <p className={cn(
            'text-[10px] leading-snug',
            event.error ? 'text-pi-danger/80' : 'text-pi-text-dim',
            !expanded && resultLong && 'truncate',
          )}>
            {resultText}
          </p>
          {resultLong && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-0.5 mt-0.5 text-[9px] text-pi-accent/70 hover:text-pi-accent transition-colors"
            >
              {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
              {expanded ? 'less' : 'more'}
            </button>
          )}
        </div>
      )}
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════
   InlineStateSnapshot
   ═══════════════════════════════════════════════ */

const moodDefs = [
  { key: 'curiosity' as const,    label: 'Cur',  barColor: 'bg-purple-500' },
  { key: 'satisfaction' as const, label: 'Sat',  barColor: 'bg-emerald-500' },
  { key: 'energy' as const,       label: 'Eng',  barColor: 'bg-yellow-500' },
  { key: 'pride' as const,        label: 'Prd',  barColor: 'bg-orange-500' },
  { key: 'frustration' as const,  label: 'Fru',  barColor: 'bg-red-500' },
]

export function InlineStateSnapshot({ snap }: { snap: StateSnapshotComponent }) {
  const hasMood = !!snap.mood
  const hasVitals = !!snap.vitals
  const hasGoals = !!snap.goalsSummary

  if (!hasMood && !hasVitals && !hasGoals) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="ml-9 rounded-lg border border-pi-border/60 bg-pi-surface px-3 py-2 text-[11px] space-y-2"
    >
      {/* Mood bars */}
      {hasMood && (
        <div>
          <div className="flex items-center gap-1 mb-1.5">
            <Heart className="w-3 h-3 text-pink-500" />
            <span className="text-[10px] font-medium text-pi-text-dim uppercase tracking-wider">Mood</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {moodDefs.map(({ key, label, barColor }) => {
              const val = snap.mood![key] ?? 0
              return (
                <div key={key} className="flex flex-col items-center gap-0.5">
                  <span className="text-[9px] text-pi-text-dim">{label}</span>
                  <div className="w-6 h-12 bg-pi-panel rounded-full overflow-hidden flex flex-col justify-end border border-pi-border/40">
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${val}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className={cn(barColor, 'w-full rounded-full')}
                    />
                  </div>
                  <span className="text-[9px] font-mono text-pi-text-dim">{val}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Vitals chips */}
      {hasVitals && (
        <div>
          <div className="flex items-center gap-1 mb-1.5">
            <Activity className="w-3 h-3 text-pi-accent" />
            <span className="text-[10px] font-medium text-pi-text-dim uppercase tracking-wider">Vitals</span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            <VitalChip
              icon={<Cpu className="w-2.5 h-2.5" />}
              label="CPU"
              value={`${snap.vitals!.cpuPercent}%`}
              warn={snap.vitals!.cpuPercent > 80}
            />
            <VitalChip
              icon={<HardDrive className="w-2.5 h-2.5" />}
              label="RAM"
              value={`${snap.vitals!.ramUsedMb}/${snap.vitals!.ramTotalMb}MB`}
              warn={snap.vitals!.ramUsedMb / snap.vitals!.ramTotalMb > 0.85}
            />
            <VitalChip
              icon={<Thermometer className="w-2.5 h-2.5" />}
              label="Temp"
              value={`${snap.vitals!.tempC}°C`}
              warn={snap.vitals!.tempC > 70}
            />
            <VitalChip
              icon={<HardDrive className="w-2.5 h-2.5" />}
              label="Disk"
              value={`${snap.vitals!.diskPercent}%`}
              warn={snap.vitals!.diskPercent > 85}
            />
          </div>
        </div>
      )}

      {/* Goals summary */}
      {hasGoals && (
        <div>
          <div className="flex items-center gap-1 mb-1.5">
            <Target className="w-3 h-3 text-pi-accent" />
            <span className="text-[10px] font-medium text-pi-text-dim uppercase tracking-wider">Goals</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-pi-text">
              <span className="font-mono font-bold text-pi-accent">{snap.goalsSummary!.active}</span>
              <span className="text-pi-text-dim"> active</span>
            </span>
            <span className="text-[10px] text-pi-text">
              <span className="font-mono font-bold text-pi-success">{snap.goalsSummary!.completed}</span>
              <span className="text-pi-text-dim"> done</span>
            </span>
            {snap.goalsSummary!.totalTasks > 0 && (
              <div className="flex-1 flex items-center gap-1.5">
                <div className="flex-1 h-1 bg-pi-panel rounded-full overflow-hidden border border-pi-border/30">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.round((snap.goalsSummary!.doneTasks / snap.goalsSummary!.totalTasks) * 100)}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="h-full bg-pi-success rounded-full"
                  />
                </div>
                <span className="text-[9px] font-mono text-pi-text-dim shrink-0">
                  {snap.goalsSummary!.doneTasks}/{snap.goalsSummary!.totalTasks}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ─── VitalChip helper ─────────────────────────── */

function VitalChip({
  icon, label, value, warn,
}: {
  icon: React.ReactNode
  label: string
  value: string
  warn?: boolean
}) {
  return (
    <div className={cn(
      'flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px]',
      warn
        ? 'bg-pi-warning/10 border-pi-warning/30 text-pi-warning'
        : 'bg-pi-panel border-pi-border/40 text-pi-text-dim',
    )}>
      {icon}
      <span className="font-medium">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  )
}

/* ═══════════════════════════════════════════════
   InlineGoalProgress
   ═══════════════════════════════════════════════ */

export function InlineGoalProgress({ gp }: { gp: GoalProgressComponent }) {
  const total = gp.tasksDone + gp.tasksRemaining
  const pct = total > 0 ? Math.round((gp.tasksDone / total) * 100) : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="ml-9 rounded-lg border border-pi-border/60 bg-pi-surface px-3 py-2 text-[11px]"
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Target className="w-3 h-3 text-pi-accent shrink-0" />
        <span className="font-medium text-pi-text truncate flex-1">{gp.goalTitle}</span>
        <span className="font-mono text-[10px] text-pi-text-dim shrink-0">{pct}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-pi-panel rounded-full overflow-hidden border border-pi-border/30 mb-1.5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          className="h-full bg-pi-accent rounded-full"
        />
      </div>

      {/* Task completed highlight */}
      {gp.taskCompleted && (
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="w-3 h-3 text-pi-success shrink-0" />
          <span className="text-[10px] text-pi-success/90 truncate">{gp.taskCompleted}</span>
        </div>
      )}

      {/* Tasks remaining */}
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-[9px] text-pi-text-dim">
          {gp.tasksDone} done · {gp.tasksRemaining} remaining
        </span>
      </div>
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════
   InlineCodeBlock
   ═══════════════════════════════════════════════ */

const actionIcons = {
  created: FilePlus,
  edited: FilePen,
  read: FileSearch,
} as const

const actionColors = {
  created: 'text-pi-success border-pi-success/30 bg-pi-success/10',
  edited: 'text-pi-accent border-pi-accent/30 bg-pi-accent/10',
  read: 'text-pi-text-dim border-pi-border/50 bg-pi-panel',
} as const

const MAX_LINES_COLLAPSED = 6

export function InlineCodeBlock({ cb }: { cb: CodeBlockComponent }) {
  const [showAll, setShowAll] = useState(false)
  const lines = cb.content.split('\n')
  const isLong = lines.length > MAX_LINES_COLLAPSED
  const displayLines = isLong && !showAll ? lines.slice(0, MAX_LINES_COLLAPSED) : lines
  const ActionIcon = actionIcons[cb.action]

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 380, damping: 28 }}
      className="ml-9 rounded-lg border border-pi-border/60 bg-pi-surface overflow-hidden text-[11px]"
    >
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-pi-border/40 bg-pi-panel/60">
        <ActionIcon className={cn('w-3 h-3 shrink-0', actionColors[cb.action].split(' ')[0])} />
        {cb.filename && (
          <span className="font-mono text-[10px] text-pi-text truncate flex-1">{cb.filename}</span>
        )}
        <span className={cn(
          'shrink-0 text-[9px] px-1.5 py-0.5 rounded border font-medium capitalize',
          actionColors[cb.action],
        )}>
          {cb.action}
        </span>
        <span className="shrink-0 text-[9px] px-1 py-0.5 rounded bg-pi-surface border border-pi-border/40 text-pi-text-dim font-mono">
          {cb.language}
        </span>
      </div>

      {/* Code body */}
      <div className="relative">
        <pre className="px-3 py-2 overflow-x-auto text-[10px] font-mono text-pi-text/90 bg-black/20 leading-relaxed">
          {displayLines.join('\n')}
        </pre>
        {isLong && !showAll && (
          <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-black/30 to-transparent pointer-events-none" />
        )}
      </div>

      {/* Show more / less toggle */}
      {isLong && (
        <button
          onClick={() => setShowAll(v => !v)}
          className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-[9px] text-pi-accent/70 hover:text-pi-accent hover:bg-pi-accent/5 transition-colors border-t border-pi-border/30"
        >
          {showAll ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
          {showAll ? `show less` : `show ${lines.length - MAX_LINES_COLLAPSED} more lines`}
        </button>
      )}
    </motion.div>
  )
}

/* ═══════════════════════════════════════════════
   ChatStreamCard — dispatcher
   ═══════════════════════════════════════════════ */

export function ChatStreamCard({ component }: { component: ChatStreamComponent }) {
  switch (component.type) {
    case 'tool-call':
      return <InlineToolCall event={(component as ToolCallComponent).event} />
    case 'state-snapshot':
      return <InlineStateSnapshot snap={component as StateSnapshotComponent} />
    case 'goal-progress':
      return <InlineGoalProgress gp={component as GoalProgressComponent} />
    case 'code-block':
      return <InlineCodeBlock cb={component as CodeBlockComponent} />
    default:
      return null
  }
}
