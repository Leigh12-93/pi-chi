'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { Goal, AgentTask, ActivityEntry, AgentStatus, ToolInvocation } from '@/lib/agent-types'
import type {
  BrainMemory, ResearchThread, GrowthEntry, BrainProject, MoodState,
  PromptEvolution, Achievement, BrainSchedule,
} from '@/lib/brain/brain-types'

const MAX_ACTIVITY_ENTRIES = 200
const STORAGE_KEY = 'pi_agent_goals'
const MOOD_HISTORY_KEY = 'pi_mood_history'
const BRAIN_POLL_ACTIVE_MS = 3_000 // Poll every 3s when brain is running
const BRAIN_POLL_IDLE_MS = 10_000  // Poll every 10s when brain is idle/sleeping/not-running
const MAX_MOOD_HISTORY = 100

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
    mood?: MoodState
    lastWakeAt?: string
    totalThoughts: number
    totalApiCost: number
    totalToolCalls?: number
    wakeIntervalMs: number
    lastThought?: string
    name?: string
    birthTimestamp?: string
    personalityTraits?: string[]
    dreamCount?: number
    lastDreamAt?: string | null
    consecutiveCrashes?: number
    lastSelfEditAt?: string | null
    smsCount?: number
    smsTodayCount?: number
    lastSmsAt?: string | null
    // Hidden data fields
    memories?: BrainMemory[]
    threads?: ResearchThread[]
    growthLog?: GrowthEntry[]
    capabilities?: string[]
    projects?: BrainProject[]
    promptOverrides?: string
    promptEvolutions?: PromptEvolution[]
    achievements?: Achievement[]
    schedules?: BrainSchedule[]
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

export interface MoodSnapshot {
  timestamp: number
  mood: MoodState
}

export interface BrainMetaExtended {
  totalThoughts: number
  totalCost: number
  wakeInterval: number
  lastThought?: string
  name?: string
  birthTimestamp?: string
  dreamCount?: number
  consecutiveCrashes?: number
  lastWakeAt?: string
  // New fields
  smsCount?: number
  smsTodayCount?: number
  lastSmsAt?: string | null
  personalityTraits?: string[]
  lastDreamAt?: string | null
  totalToolCalls?: number
  lastSelfEditAt?: string | null
}

interface UseAgentStateReturn {
  goals: Goal[]
  activity: ActivityEntry[]
  chatMessages: BrainChatMessage[]
  mood: BrainMood | null
  moodHistory: MoodSnapshot[]
  agentStatus: AgentStatus
  brainStatus: 'running' | 'sleeping' | 'not-running' | 'error'
  brainMeta: BrainMetaExtended | null
  lastFetchedAt: number | null

  // New data fields
  memories: BrainMemory[]
  threads: ResearchThread[]
  growthLog: GrowthEntry[]
  capabilities: string[]
  projects: BrainProject[]
  promptOverrides: string
  promptEvolutions: PromptEvolution[]
  achievements: Achievement[]

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
  refresh: () => void
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

/** Load mood history from sessionStorage */
function loadMoodHistory(): MoodSnapshot[] {
  try {
    const stored = sessionStorage.getItem(MOOD_HISTORY_KEY)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/** Save mood history to sessionStorage */
function saveMoodHistory(history: MoodSnapshot[]) {
  try {
    sessionStorage.setItem(MOOD_HISTORY_KEY, JSON.stringify(history))
  } catch { /* sessionStorage unavailable */ }
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
  const [moodHistory, setMoodHistory] = useState<MoodSnapshot[]>(() => loadMoodHistory())
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const [brainStatus, setBrainStatus] = useState<BrainApiResponse['status']>('not-running')
  const [brainMeta, setBrainMeta] = useState<BrainMetaExtended | null>(null)

  // New state for hidden brain data
  const [memories, setMemories] = useState<BrainMemory[]>([])
  const [threads, setThreads] = useState<ResearchThread[]>([])
  const [growthLog, setGrowthLog] = useState<GrowthEntry[]>([])
  const [capabilities, setCapabilities] = useState<string[]>([])
  const [projects, setProjects] = useState<BrainProject[]>([])
  const [promptOverrides, setPromptOverrides] = useState<string>('')
  const [promptEvolutions, setPromptEvolutions] = useState<PromptEvolution[]>([])
  const [achievements, setAchievements] = useState<Achievement[]>([])

  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null)

  const mountedRef = useRef(true)
  const brainActiveRef = useRef(false) // true when brain provides data
  const lastMoodTsRef = useRef(0)
  const pollFnRef = useRef<(() => void) | null>(null)

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

  // ── Brain polling (adaptive frequency + visibility check) ───
  const brainStatusRef = useRef<BrainApiResponse['status']>('not-running')

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    let tabVisible = !document.hidden

    async function pollBrain() {
      // Skip polling when tab is not visible
      if (!tabVisible) {
        schedulePoll()
        return
      }

      try {
        const res = await fetch('/api/brain')
        if (!res.ok) {
          setBrainStatus('error')
          brainStatusRef.current = 'error'
          brainActiveRef.current = false
          schedulePoll()
          return
        }
        const data: BrainApiResponse = await res.json()
        if (!mountedRef.current) return

        setBrainStatus(data.status)
        brainStatusRef.current = data.status
        setLastFetchedAt(Date.now())

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

          // Mood + mood history accumulation
          const currentMood = data.state.mood || null
          setMood(currentMood)

          if (currentMood) {
            const now = Date.now()
            // Only append if at least 3s since last snapshot
            if (now - lastMoodTsRef.current >= 3000) {
              lastMoodTsRef.current = now
              setMoodHistory(prev => {
                const next = [...prev, { timestamp: now, mood: currentMood }]
                const capped = next.length > MAX_MOOD_HISTORY ? next.slice(-MAX_MOOD_HISTORY) : next
                saveMoodHistory(capped)
                return capped
              })
            }
          }

          // Store brain metadata (expanded)
          setBrainMeta({
            totalThoughts: data.state.totalThoughts,
            totalCost: data.state.totalApiCost,
            wakeInterval: data.state.wakeIntervalMs,
            lastThought: data.state.lastThought,
            name: data.state.name,
            birthTimestamp: data.state.birthTimestamp,
            dreamCount: data.state.dreamCount,
            consecutiveCrashes: data.state.consecutiveCrashes,
            lastWakeAt: data.state.lastWakeAt,
            // New meta fields
            smsCount: data.state.smsCount,
            smsTodayCount: data.state.smsTodayCount,
            lastSmsAt: data.state.lastSmsAt,
            personalityTraits: data.state.personalityTraits,
            lastDreamAt: data.state.lastDreamAt,
            totalToolCalls: data.state.totalToolCalls,
            lastSelfEditAt: data.state.lastSelfEditAt,
          })

          // Extract hidden brain data
          setMemories(data.state.memories || [])
          setThreads(data.state.threads || [])
          setGrowthLog(data.state.growthLog || [])
          setCapabilities(data.state.capabilities || [])
          setProjects(data.state.projects || [])
          setPromptOverrides(data.state.promptOverrides || '')
          setPromptEvolutions(data.state.promptEvolutions || [])
          setAchievements(data.state.achievements || [])
        } else {
          brainActiveRef.current = false
          setBrainMeta(null)
          setMood(null)
          setChatMessages([])
          setMemories([])
          setThreads([])
          setGrowthLog([])
          setCapabilities([])
          setProjects([])
          setPromptOverrides('')
          setPromptEvolutions([])
          setAchievements([])
        }
      } catch {
        // Brain API not available — use localStorage fallback
        brainActiveRef.current = false
        setBrainStatus('not-running')
        brainStatusRef.current = 'not-running'
        setBrainMeta(null)
      }

      schedulePoll()
    }

    function schedulePoll() {
      if (!mountedRef.current) return
      const interval = brainStatusRef.current === 'running' ? BRAIN_POLL_ACTIVE_MS : BRAIN_POLL_IDLE_MS
      timer = setTimeout(pollBrain, interval)
    }

    // Pause polling when tab is hidden, resume when visible
    function handleVisibility() {
      tabVisible = !document.hidden
      if (tabVisible) {
        // Poll immediately on tab return
        clearTimeout(timer)
        pollBrain()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    // Store for manual refresh
    pollFnRef.current = pollBrain
    // Initial poll
    pollBrain()

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
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

  const refresh = useCallback(() => {
    if (pollFnRef.current) pollFnRef.current()
  }, [])

  return {
    goals,
    activity,
    chatMessages,
    mood,
    moodHistory,
    agentStatus,
    brainStatus,
    brainMeta,
    memories,
    threads,
    growthLog,
    capabilities,
    projects,
    promptOverrides,
    promptEvolutions,
    achievements,
    addGoal,
    updateGoal,
    removeGoal,
    addTask,
    updateTask,
    addActivity,
    clearActivity,
    setAgentStatus,
    handleToolInvocation,
    lastFetchedAt,
    injectGoal,
    injectMessage,
    markChatRead,
    refresh,
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
