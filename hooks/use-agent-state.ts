'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { Goal, AgentTask, ActivityEntry, AgentStatus, ToolInvocation } from '@/lib/agent-types'

const MAX_ACTIVITY_ENTRIES = 200
const STORAGE_KEY = 'pi_agent_goals'
const BRAIN_POLL_MS = 3_000 // Poll every 3s for live updates

export interface BrainChatMessage {
  id: string
  from: 'owner' | 'brain'
  message: string
  timestamp: string
  read: boolean
}

interface BrainApiResponse {
  status: 'running' | 'sleeping' | 'not-running' | 'error'
  state?: {
    goals: Array<{
      id: string
      title: string
      status: string
      priority: string
      reasoning?: string
      tasks: Array<{ id: string; title: string; status: string; result?: string }>
      createdAt: string
    }>
    activityLog: Array<{
      id: string
      time: string
      type: string
      message: string
    }>
    chatMessages?: BrainChatMessage[]
    mood?: {
      curiosity: number
      satisfaction: number
      frustration: number
      loneliness: number
      energy: number
      pride: number
    }
    lastWakeAt?: string
    totalThoughts: number
    totalApiCost: number
    wakeIntervalMs: number
    lastThought?: string
    name?: string
    birthTimestamp?: string
    dreamCount?: number
    consecutiveCrashes?: number
  }
  error?: string
}

interface BrainMood {
  curiosity: number
  satisfaction: number
  frustration: number
  loneliness: number
  energy: number
  pride: number
}

interface UseAgentStateReturn {
  goals: Goal[]
  activity: ActivityEntry[]
  chatMessages: BrainChatMessage[]
  mood: BrainMood | null
  agentStatus: AgentStatus
  brainStatus: 'running' | 'sleeping' | 'not-running' | 'error'
  brainMeta: { totalThoughts: number; totalCost: number; wakeInterval: number; lastThought?: string; name?: string; birthTimestamp?: string; dreamCount?: number } | null

  // Goal management
  addGoal: (goal: Omit<Goal, 'id' | 'createdAt'>) => string
  updateGoal: (id: string, updates: Partial<Goal>) => void
  removeGoal: (id: string) => void
  addTask: (goalId: string, task: Omit<AgentTask, 'id'>) => void
  updateTask: (goalId: string, taskId: string, updates: Partial<AgentTask>) => void

  // Activity
  addActivity: (entry: Omit<ActivityEntry, 'id' | 'time'>) => void
  clearActivity: () => void

  // Status
  setAgentStatus: (status: AgentStatus) => void

  // Tool invocation handler (connect to chat panel)
  handleToolInvocation: (invocation: ToolInvocation) => void

  // Brain actions
  injectGoal: (title: string, priority?: string, tasks?: string[]) => Promise<boolean>
  injectMessage: (message: string) => Promise<boolean>
  markChatRead: () => Promise<boolean>
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatTime(): string {
  return new Date().toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

/** Map brain goal status to dashboard goal status */
function mapGoalStatus(s: string): Goal['status'] {
  if (s === 'active') return 'active'
  if (s === 'completed') return 'completed'
  if (s === 'paused') return 'paused'
  return 'pending'
}

/** Map brain task status to dashboard task status */
function mapTaskStatus(s: string): AgentTask['status'] {
  if (s === 'done') return 'done'
  if (s === 'running' || s === 'in-progress') return 'running'
  if (s === 'failed') return 'failed'
  return 'pending'
}

/** Map brain activity type to dashboard activity type */
function mapActivityType(t: string): ActivityEntry['type'] {
  const valid = ['system', 'goal', 'action', 'decision', 'error', 'success', 'gpio', 'network'] as const
  if ((valid as readonly string[]).includes(t)) return t as ActivityEntry['type']
  if (t === 'thought') return 'decision'
  if (t === 'sms') return 'system'
  return 'action'
}

export function useAgentState(): UseAgentStateReturn {
  // Load goals from localStorage on mount
  const [goals, setGoals] = useState<Goal[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      return stored ? JSON.parse(stored) : []
    } catch {
      return []
    }
  })

  const [activity, setActivity] = useState<ActivityEntry[]>([])
  const [chatMessages, setChatMessages] = useState<BrainChatMessage[]>([])
  const [mood, setMood] = useState<BrainMood | null>(null)
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [brainStatus, setBrainStatus] = useState<BrainApiResponse['status']>('not-running')
  const [brainMeta, setBrainMeta] = useState<UseAgentStateReturn['brainMeta']>(null)
  const mountedRef = useRef(true)
  const brainActiveRef = useRef(false) // true when brain provides data

  // Persist goals to localStorage (only when brain is NOT providing them)
  useEffect(() => {
    if (brainActiveRef.current) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(goals))
    } catch { /* localStorage unavailable */ }
  }, [goals])

  useEffect(() => {
    return () => { mountedRef.current = false }
  }, [])

  // ── Brain polling ────────────────────────────────────────────
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>

    async function pollBrain() {
      try {
        const res = await fetch('/api/brain')
        if (!res.ok) {
          setBrainStatus('error')
          brainActiveRef.current = false
          return
        }
        const data: BrainApiResponse = await res.json()
        if (!mountedRef.current) return

        setBrainStatus(data.status)

        if (data.state && (data.status === 'running' || data.status === 'sleeping')) {
          brainActiveRef.current = true

          // Map brain goals → dashboard goals
          const mappedGoals: Goal[] = data.state.goals.map(g => ({
            id: g.id,
            title: g.title,
            status: mapGoalStatus(g.status),
            priority: (g.priority as Goal['priority']) || 'medium',
            reasoning: g.reasoning,
            tasks: g.tasks.map(t => ({
              id: t.id,
              title: t.title,
              status: mapTaskStatus(t.status),
              detail: t.result,
            })),
            createdAt: g.createdAt,
          }))
          setGoals(mappedGoals)

          // Map brain activity → dashboard activity (last 50)
          const mappedActivity: ActivityEntry[] = data.state.activityLog.slice(-50).map(e => ({
            id: e.id,
            time: new Date(e.time).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }),
            message: e.message,
            type: mapActivityType(e.type),
          }))
          setActivity(mappedActivity)

          // Derive agent status from brain
          if (data.status === 'running') {
            setAgentStatus('thinking')
          } else {
            setAgentStatus('idle')
          }

          // Chat messages
          setChatMessages(data.state.chatMessages || [])

          // Mood
          setMood(data.state.mood || null)

          // Store brain metadata
          setBrainMeta({
            totalThoughts: data.state.totalThoughts,
            totalCost: data.state.totalApiCost,
            wakeInterval: data.state.wakeIntervalMs,
            lastThought: data.state.lastThought,
            name: data.state.name,
            birthTimestamp: data.state.birthTimestamp,
            dreamCount: data.state.dreamCount,
          })
        } else {
          brainActiveRef.current = false
          setBrainMeta(null)
          setMood(null)
          setChatMessages([])
        }
      } catch {
        // Brain API not available — use localStorage fallback
        brainActiveRef.current = false
        setBrainStatus('not-running')
        setBrainMeta(null)
      }
    }

    // Initial poll
    pollBrain()
    // Poll every 10s
    timer = setInterval(pollBrain, BRAIN_POLL_MS)

    return () => clearInterval(timer)
  }, [])

  // ── Goal management ────────────────────────────────────────

  const addGoal = useCallback((goal: Omit<Goal, 'id' | 'createdAt'>): string => {
    const id = generateId()
    const newGoal: Goal = {
      ...goal,
      id,
      createdAt: new Date().toISOString(),
    }
    setGoals(prev => [newGoal, ...prev])
    return id
  }, [])

  const updateGoal = useCallback((id: string, updates: Partial<Goal>) => {
    setGoals(prev => prev.map(g => g.id === id ? { ...g, ...updates } : g))
  }, [])

  const removeGoal = useCallback((id: string) => {
    setGoals(prev => prev.filter(g => g.id !== id))
  }, [])

  const addTask = useCallback((goalId: string, task: Omit<AgentTask, 'id'>) => {
    const newTask: AgentTask = { ...task, id: generateId() }
    setGoals(prev => prev.map(g =>
      g.id === goalId ? { ...g, tasks: [...g.tasks, newTask] } : g
    ))
  }, [])

  const updateTask = useCallback((goalId: string, taskId: string, updates: Partial<AgentTask>) => {
    setGoals(prev => prev.map(g =>
      g.id === goalId
        ? { ...g, tasks: g.tasks.map(t => t.id === taskId ? { ...t, ...updates } : t) }
        : g
    ))
  }, [])

  // ── Activity ───────────────────────────────────────────────

  const addActivity = useCallback((entry: Omit<ActivityEntry, 'id' | 'time'>) => {
    const newEntry: ActivityEntry = {
      ...entry,
      id: generateId(),
      time: formatTime(),
    }
    setActivity(prev => {
      const next = [...prev, newEntry]
      // Trim to max entries
      return next.length > MAX_ACTIVITY_ENTRIES
        ? next.slice(next.length - MAX_ACTIVITY_ENTRIES)
        : next
    })
  }, [])

  const clearActivity = useCallback(() => {
    setActivity([])
  }, [])

  // ── Tool invocation handler ────────────────────────────────

  const handleToolInvocation = useCallback((invocation: ToolInvocation) => {
    // Map tool invocations to activity entries
    const toolDisplayNames: Record<string, string> = {
      execute_command: 'Shell command',
      write_file: 'File write',
      edit_file: 'File edit',
      read_file: 'File read',
      delete_file: 'File delete',
      deploy_to_vercel: 'Deployment',
      github_push_update: 'Git push',
      db_query: 'DB query',
      db_mutate: 'DB mutation',
      pi_modify_own_source: 'Self-modification',
      pi_redeploy: 'Self-deploy',
      web_search: 'Web search',
      think: 'Deep thinking',
    }

    const displayName = toolDisplayNames[invocation.toolName] || invocation.toolName

    if (invocation.status === 'running') {
      setAgentStatus('executing')
      addActivity({
        message: `${displayName}: ${getToolSummary(invocation)}`,
        type: getToolActivityType(invocation.toolName),
      })
    } else if (invocation.status === 'error') {
      addActivity({
        message: `${displayName} failed`,
        type: 'error',
      })
    }
  }, [addActivity])

  // ── Brain actions (inject via POST /api/brain) ────────────────

  const injectGoal = useCallback(async (title: string, priority?: string, tasks?: string[]): Promise<boolean> => {
    try {
      const res = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'inject-goal', data: { title, priority: priority || 'medium', tasks: tasks || [] } }),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const injectMessage = useCallback(async (message: string): Promise<boolean> => {
    try {
      const res = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'inject-message', data: { message } }),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  const markChatRead = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'mark-chat-read' }),
      })
      return res.ok
    } catch {
      return false
    }
  }, [])

  return {
    goals,
    activity,
    chatMessages,
    mood,
    agentStatus,
    brainStatus,
    brainMeta,
    addGoal,
    updateGoal,
    removeGoal,
    addTask,
    updateTask,
    addActivity,
    clearActivity,
    setAgentStatus,
    handleToolInvocation,
    injectGoal,
    injectMessage,
    markChatRead,
  }
}

// ── Helpers ────────────────────────────────────────────────────

function getToolActivityType(toolName: string): ActivityEntry['type'] {
  if (toolName.startsWith('gpio') || toolName === 'execute_command') return 'action'
  if (toolName.startsWith('pi_')) return 'decision'
  if (toolName.startsWith('db_')) return 'action'
  if (toolName.startsWith('github_')) return 'action'
  if (toolName === 'think' || toolName === 'suggest_improvement') return 'decision'
  if (toolName === 'deploy_to_vercel' || toolName === 'pi_redeploy') return 'system'
  return 'action'
}

function getToolSummary(invocation: ToolInvocation): string {
  const args = invocation.args || {}
  if (invocation.toolName === 'execute_command' && args.command) {
    const cmd = String(args.command)
    return cmd.length > 60 ? cmd.slice(0, 60) + '...' : cmd
  }
  if (invocation.toolName === 'write_file' && args.path) {
    return String(args.path)
  }
  if (invocation.toolName === 'edit_file' && args.path) {
    return String(args.path)
  }
  if (invocation.toolName === 'read_file' && args.path) {
    return String(args.path)
  }
  if (invocation.toolName === 'db_query' && args.table) {
    return `SELECT from ${args.table}`
  }
  if (invocation.toolName === 'web_search' && args.query) {
    return String(args.query)
  }
  return ''
}
