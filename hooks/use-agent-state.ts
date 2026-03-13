'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { Goal, AgentTask, ActivityEntry, AgentStatus, ToolInvocation } from '@/lib/agent-types'

const MAX_ACTIVITY_ENTRIES = 200
const STORAGE_KEY = 'pi_agent_goals'

interface UseAgentStateReturn {
  goals: Goal[]
  activity: ActivityEntry[]
  agentStatus: AgentStatus

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
  const [agentStatus, setAgentStatus] = useState<AgentStatus>('idle')
  const mountedRef = useRef(true)

  // Persist goals to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(goals))
    } catch { /* localStorage unavailable */ }
  }, [goals])

  useEffect(() => {
    return () => { mountedRef.current = false }
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

  return {
    goals,
    activity,
    agentStatus,
    addGoal,
    updateGoal,
    removeGoal,
    addTask,
    updateTask,
    addActivity,
    clearActivity,
    setAgentStatus,
    handleToolInvocation,
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
