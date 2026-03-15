'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { Goal, AgentTask, ActivityEntry, AgentStatus, ToolInvocation } from '@/lib/agent-types'
import type {
  BrainMemory, ResearchThread, GrowthEntry, BrainProject, MoodState,
  PromptEvolution, Achievement, BrainSchedule,
} from '@/lib/brain/brain-types'
import type {
  DashboardSummary, Mission, AttentionItem, WorkQueueItem, AutomationEvent, CycleSummary, WorkCycle,
} from '@/lib/brain/domain-types'

const MAX_ACTIVITY_ENTRIES = 200
const STORAGE_KEY = 'pi_agent_goals'
const MOOD_HISTORY_KEY = 'pi_mood_history'
const BRAIN_POLL_ACTIVE_MS = 15_000 // Poll every 15s when stream is healthy
const BRAIN_POLL_IDLE_MS = 45_000  // Poll every 45s when stream is healthy
const MAX_MOOD_HISTORY = 100

export interface BrainChatMessage {
  id: string
  from: 'owner' | 'brain'
  message: string
  timestamp: string
  read: boolean
  clientMessageId?: string
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
    currentMission?: Mission | null
    currentCycle?: WorkCycle | null
    workCycles?: WorkCycle[]
  }
  error?: string
}

interface BrainDeltaResponse {
  status: 'running' | 'sleeping' | 'not-running' | 'error'
  hasState: boolean
  counts: {
    activity: number
    chat: number
    goals: number
  }
  goals: Array<{
    id: string
    title: string
    status: string
    priority: string
    reasoning?: string
    tasks: Array<{ id: string; title: string; status: string; result?: string }>
    createdAt: string
  }>
  mood: MoodState | null
  latestActivity: {
    id: string
    time: string
    type: string
    message: string
  } | null
  latestChat: {
    id: string
    from: 'owner' | 'brain'
    message: string
    timestamp: string
    read: boolean
    clientMessageId?: string
  } | null
  currentMission: Mission | null
  currentCycle: WorkCycle | null
  recentCycles: WorkCycle[]
  meta: {
    totalThoughts: number
    totalApiCost: number
    totalToolCalls?: number
    wakeIntervalMs: number
    lastThought?: string
    name?: string
    birthTimestamp?: string
    dreamCount?: number
    consecutiveCrashes?: number
    lastWakeAt?: string | null
    smsCount?: number
    smsTodayCount?: number
    lastSmsAt?: string | null
    personalityTraits?: string[]
    lastDreamAt?: string | null
    lastSelfEditAt?: string | null
  }
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
  summary: DashboardSummary

  // New data fields
  memories: BrainMemory[]
  threads: ResearchThread[]
  growthLog: GrowthEntry[]
  capabilities: string[]
  projects: BrainProject[]
  promptOverrides: string
  promptEvolutions: PromptEvolution[]
  achievements: Achievement[]
  workCycles: WorkCycle[]

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
  const [workCycles, setWorkCycles] = useState<WorkCycle[]>([])

  const [lastFetchedAt, setLastFetchedAt] = useState<number | null>(null)

  const mountedRef = useRef(true)
  const brainActiveRef = useRef(false) // true when brain provides data
  const lastMoodTsRef = useRef(0)
  const pollFnRef = useRef<(() => void) | null>(null)
  const streamConnectedRef = useRef(false)
  const lastActivityIdRef = useRef<string | null>(null)
  const lastChatIdRef = useRef<string | null>(null)
  const activityCountRef = useRef(0)
  const chatCountRef = useRef(0)
  const goalsCountRef = useRef(0)

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

  const applyBrainData = useCallback((data: BrainApiResponse) => {
    if (!mountedRef.current) return

    setBrainStatus(data.status)
    brainStatusRef.current = data.status
    setLastFetchedAt(Date.now())

    if (data.state && (data.status === 'running' || data.status === 'sleeping')) {
      brainActiveRef.current = true

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

      const mappedActivity: ActivityEntry[] = data.state.activityLog.slice(-50).map(e => ({
        id: e.id,
        time: new Date(e.time).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }),
        message: e.message,
        type: mapActivityType(e.type),
      }))
      setActivity(mappedActivity)
      activityCountRef.current = data.state.activityLog.length
      lastActivityIdRef.current = data.state.activityLog.at(-1)?.id ?? null

      setAgentStatus(data.status === 'running' ? 'thinking' : 'idle')
      setChatMessages(data.state.chatMessages || [])
      chatCountRef.current = data.state.chatMessages?.length || 0
      lastChatIdRef.current = data.state.chatMessages?.at(-1)?.id ?? null
      goalsCountRef.current = data.state.goals.length

      const currentMood = data.state.mood || null
      setMood(currentMood)

      if (currentMood) {
        const now = Date.now()
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
        smsCount: data.state.smsCount,
        smsTodayCount: data.state.smsTodayCount,
        lastSmsAt: data.state.lastSmsAt,
        personalityTraits: data.state.personalityTraits,
        lastDreamAt: data.state.lastDreamAt,
        totalToolCalls: data.state.totalToolCalls,
        lastSelfEditAt: data.state.lastSelfEditAt,
      })

      setMemories(data.state.memories || [])
      setThreads(data.state.threads || [])
      setGrowthLog(data.state.growthLog || [])
      setCapabilities(data.state.capabilities || [])
      setProjects(data.state.projects || [])
      setPromptOverrides(data.state.promptOverrides || '')
      setPromptEvolutions(data.state.promptEvolutions || [])
      setAchievements(data.state.achievements || [])
      setWorkCycles([
        ...((data.state.workCycles || []).filter(Boolean)),
        ...(data.state.currentCycle ? [data.state.currentCycle] : []),
      ])
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
      setWorkCycles([])
      activityCountRef.current = 0
      chatCountRef.current = 0
      goalsCountRef.current = 0
      lastActivityIdRef.current = null
      lastChatIdRef.current = null
    }
  }, [])

  const applyBrainDelta = useCallback((delta: BrainDeltaResponse) => {
    if (!mountedRef.current) return

    setBrainStatus(delta.status)
    brainStatusRef.current = delta.status
    setLastFetchedAt(Date.now())

    if (!delta.hasState) {
      brainActiveRef.current = false
      setBrainMeta(null)
      return
    }

    brainActiveRef.current = true

    const mappedGoals: Goal[] = delta.goals.map(g => ({
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

    const currentMood = delta.mood || null
    setMood(currentMood)
    if (currentMood) {
      const now = Date.now()
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

    setBrainMeta(prev => ({
      ...(prev || {}),
      totalThoughts: delta.meta.totalThoughts,
      totalCost: delta.meta.totalApiCost,
      wakeInterval: delta.meta.wakeIntervalMs,
      lastThought: delta.meta.lastThought,
      name: delta.meta.name,
      birthTimestamp: delta.meta.birthTimestamp,
      dreamCount: delta.meta.dreamCount,
      consecutiveCrashes: delta.meta.consecutiveCrashes,
      lastWakeAt: delta.meta.lastWakeAt ?? undefined,
      smsCount: delta.meta.smsCount,
      smsTodayCount: delta.meta.smsTodayCount,
      lastSmsAt: delta.meta.lastSmsAt,
      personalityTraits: delta.meta.personalityTraits,
      lastDreamAt: delta.meta.lastDreamAt,
      totalToolCalls: delta.meta.totalToolCalls,
      lastSelfEditAt: delta.meta.lastSelfEditAt,
    }))

    setAgentStatus(delta.status === 'running' ? 'thinking' : 'idle')
    setWorkCycles([
      ...((delta.recentCycles || []).filter(Boolean)),
      ...(delta.currentCycle ? [delta.currentCycle] : []),
    ])

    if (delta.latestActivity && delta.latestActivity.id !== lastActivityIdRef.current) {
      const mapped: ActivityEntry = {
        id: delta.latestActivity.id,
        time: new Date(delta.latestActivity.time).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false }),
        message: delta.latestActivity.message,
        type: mapActivityType(delta.latestActivity.type),
      }
      lastActivityIdRef.current = delta.latestActivity.id
      setActivity(prev => {
        const withoutExisting = prev.filter(entry => entry.id !== mapped.id)
        const next = [...withoutExisting, mapped]
        return next.length > 50 ? next.slice(-50) : next
      })
    }

    if (delta.latestChat && delta.latestChat.id !== lastChatIdRef.current) {
      lastChatIdRef.current = delta.latestChat.id
      setChatMessages(prev => {
        const nextMessage: BrainChatMessage = {
          id: delta.latestChat!.id,
          from: delta.latestChat!.from,
          message: delta.latestChat!.message,
          timestamp: delta.latestChat!.timestamp,
          read: delta.latestChat!.read,
          clientMessageId: delta.latestChat!.clientMessageId,
        }
        const withoutExisting = prev.filter(message => message.id !== nextMessage.id)
        const next = [...withoutExisting, nextMessage]
        return next.length > 100 ? next.slice(-100) : next
      })
    }

    activityCountRef.current = delta.counts.activity
    chatCountRef.current = delta.counts.chat
    goalsCountRef.current = delta.counts.goals
  }, [])

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
        applyBrainData(data)
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
      const interval = streamConnectedRef.current
        ? (brainStatusRef.current === 'running' ? BRAIN_POLL_ACTIVE_MS : BRAIN_POLL_IDLE_MS)
        : (brainStatusRef.current === 'running' ? 5_000 : 12_000)
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
  }, [applyBrainData])

  useEffect(() => {
    if (typeof window === 'undefined') return

    let eventSource: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (document.hidden || eventSource) return
      eventSource = new EventSource('/api/brain/stream')

      eventSource.addEventListener('brain-state', (event) => {
        streamConnectedRef.current = true
        try {
          const data = JSON.parse((event as MessageEvent<string>).data) as BrainApiResponse
          applyBrainData(data)
        } catch {
          // ignore malformed events and let polling reconcile
        }
      })

      eventSource.addEventListener('brain-delta', (event) => {
        streamConnectedRef.current = true
        try {
          const data = JSON.parse((event as MessageEvent<string>).data) as BrainDeltaResponse
          applyBrainDelta(data)
        } catch {
          pollFnRef.current?.()
        }
      })

      eventSource.addEventListener('brain-error', () => {
        streamConnectedRef.current = false
      })

      eventSource.onerror = () => {
        streamConnectedRef.current = false
        eventSource?.close()
        eventSource = null
        if (!document.hidden && reconnectTimer === null) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            connect()
          }, 5_000)
        }
      }
    }

    const disconnect = () => {
      streamConnectedRef.current = false
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      eventSource?.close()
      eventSource = null
    }

    const handleVisibility = () => {
      if (document.hidden) {
        disconnect()
      } else if (!eventSource) {
        connect()
      }
    }

    connect()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      disconnect()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [applyBrainData, applyBrainDelta])

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

  // ── Derived DashboardSummary ───────────────────────────────
  const summary = useMemo((): DashboardSummary => {
    const persistedRecentCycles = [...workCycles].reverse()
    const liveCycle = persistedRecentCycles.find(cycle => !cycle.completedAt) || null
    const completedCycles = persistedRecentCycles.filter(cycle => cycle.completedAt)
    const persistedMission = liveCycle?.mission ?? null

    // Current mission — prefer persisted cycle/mission data, then fall back to goals
    const activeGoals = goals.filter(g => g.status === 'active')
    const topGoal = activeGoals.sort((a, b) => {
      const p = { high: 3, medium: 2, low: 1 }
      return (p[b.priority] || 0) - (p[a.priority] || 0)
    })[0]

    const fallbackMission: Mission | null = topGoal ? {
      id: topGoal.id,
      type: inferMissionType(topGoal.title),
      title: topGoal.title,
      rationale: topGoal.reasoning || '',
      progressLabel: `${topGoal.tasks.filter(t => t.status === 'done').length}/${topGoal.tasks.length} tasks`,
      startedAt: topGoal.createdAt,
      status: 'active',
    } : null
    const currentMission: Mission | null = persistedMission || fallbackMission

    // Now doing — prefer explicit cycle action, then latest activity entry, then last thought
    const latestActivity = activity.length > 0 ? activity[activity.length - 1] : null
    const currentAction = liveCycle?.actions.at(-1) || null
    const nowDoing = currentAction
      || (activity.length > 0
      ? activity[activity.length - 1].message
      : brainMeta?.lastThought || 'Idle'
      )

    const cyclePhase = inferCyclePhase(brainStatus, latestActivity?.type)

    // Next up
    const nextGoal = activeGoals[1]
    const nextUp = nextGoal ? nextGoal.title : null
    const autonomyReason = currentMission?.rationale || inferAutonomyReason(latestActivity, cyclePhase)

    const workQueue: WorkQueueItem[] = []
    if (currentMission) {
      workQueue.push({ id: `${currentMission.id}-now`, label: currentMission.title, status: 'now' })
    }
    const runningTask = topGoal?.tasks.find(task => task.status === 'running')
    if (runningTask) {
      workQueue.push({ id: `${topGoal?.id}-task`, label: runningTask.title, status: 'next' })
    }
    const queuedGoals = goals
      .filter(goal => goal.id !== topGoal?.id && (goal.status === 'active' || goal.status === 'pending' || goal.status === 'paused'))
      .slice(0, 3)
    workQueue.push(
      ...queuedGoals.map((goal, index) => ({
        id: `${goal.id}-${index}`,
        label: goal.title,
        status: goal.tasks.some(task => task.status === 'failed')
          ? 'blocked' as const
          : (index === 0 && !runningTask ? 'next' as const : 'queued' as const),
      }))
    )

    const backgroundEvents: AutomationEvent[] = liveCycle
      ? liveCycle.actions.slice(-6).reverse().map((label, index) => ({
          id: `${liveCycle.id}-${index}`,
          label,
          at: liveCycle.startedAt,
          tone: index === 0 ? 'action' : 'thinking',
        }))
      : activity
          .slice(-6)
          .map(entry => ({
            id: entry.id,
            label: entry.message,
            at: entry.time,
            tone: (
              entry.type === 'error'
                ? 'warning'
                : entry.type === 'decision'
                  ? 'thinking'
                  : entry.type === 'success'
                    ? 'result'
                    : 'action'
            ) as AutomationEvent['tone'],
          }))
          .reverse()

    const lastCycle: CycleSummary | null = completedCycles[0]
      ? {
          id: completedCycles[0].id,
          title: completedCycles[0].mission?.title || 'Autonomous cycle',
          outcome: completedCycles[0].outcome,
          nextStep: nextUp,
        }
      : latestActivity
        ? {
            id: latestActivity.id,
            title: currentMission?.title || 'Autonomous cycle',
            outcome: latestActivity.message,
            nextStep: nextUp,
          }
        : null

    const recentCycles: CycleSummary[] = completedCycles
      .slice(0, 4)
      .map(cycle => ({
        id: cycle.id,
        title: cycle.mission?.title || 'Autonomous cycle',
        outcome: cycle.outcome,
        nextStep: cycle.mission?.progressLabel || null,
      }))

    // Attention needed
    const attentionNeeded: AttentionItem[] = []
    if (brainMeta?.consecutiveCrashes && brainMeta.consecutiveCrashes > 0) {
      attentionNeeded.push({
        id: 'crashes',
        level: brainMeta.consecutiveCrashes >= 3 ? 'critical' : 'warn',
        message: `${brainMeta.consecutiveCrashes} consecutive crash${brainMeta.consecutiveCrashes > 1 ? 'es' : ''}`,
      })
    }
    if (brainStatus === 'error') {
      attentionNeeded.push({ id: 'brain-error', level: 'critical', message: 'Brain is in error state' })
    }
    if (brainStatus === 'not-running') {
      attentionNeeded.push({ id: 'brain-offline', level: 'warn', message: 'Brain is offline' })
    }
    if (brainMeta && brainMeta.totalCost > 8) {
      attentionNeeded.push({ id: 'budget', level: 'warn', message: `API cost $${brainMeta.totalCost.toFixed(2)} approaching limit` })
    }

    // Portfolio — placeholder until real business data flows in
    const portfolioValue = null
    const portfolioTarget = 1_000_000

    return {
      nowDoing,
      cyclePhase,
      currentMission,
      autonomyReason,
      nextUp,
      lastEventLabel: latestActivity?.message || null,
      workQueue,
      backgroundEvents,
      lastCycle,
      recentCycles,
      attentionNeeded,
      topBusiness: null,
      topOpportunity: null,
      portfolioValue,
      portfolioTarget,
    }
  }, [goals, activity, brainMeta, brainStatus, workCycles])

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
    workCycles,
    summary,
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

/** Infer mission type from goal title keywords */
function inferMissionType(title: string): Mission['type'] {
  const t = title.toLowerCase()
  if (t.includes('launch') || t.includes('deploy') || t.includes('ship')) return 'launch'
  if (t.includes('grow') || t.includes('revenue') || t.includes('scale') || t.includes('customer')) return 'grow'
  if (t.includes('explore') || t.includes('research') || t.includes('investigate') || t.includes('find')) return 'explore'
  if (t.includes('improve') || t.includes('refactor') || t.includes('optimize') || t.includes('learn')) return 'self-improve'
  return 'maintain'
}

function inferCyclePhase(
  brainStatus: UseAgentStateReturn['brainStatus'],
  latestActivityType?: ActivityEntry['type']
): DashboardSummary['cyclePhase'] {
  if (brainStatus === 'sleeping') return 'sleeping'
  if (brainStatus === 'not-running') return 'offline'
  if (brainStatus === 'error') return 'error'
  if (latestActivityType === 'action' || latestActivityType === 'system' || latestActivityType === 'success') return 'executing'
  if (latestActivityType === 'decision') return 'planning'
  return 'idle'
}

function inferAutonomyReason(
  latestActivity: ActivityEntry | null,
  cyclePhase: DashboardSummary['cyclePhase']
): string {
  if (cyclePhase === 'sleeping') return 'The current cycle completed and the brain is waiting for its next wake interval.'
  if (cyclePhase === 'responding') return 'A direct owner interaction is taking priority over background work.'
  if (cyclePhase === 'executing') return latestActivity?.message || 'A high-priority action is currently running.'
  if (cyclePhase === 'planning') return 'Pi-Chi is reviewing recent events and deciding the next best move.'
  if (cyclePhase === 'error') return 'The brain hit an error path and needs recovery.'
  if (cyclePhase === 'offline') return 'The background brain process is not currently running.'
  return 'Pi-Chi is idle but monitoring for the next meaningful task.'
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
