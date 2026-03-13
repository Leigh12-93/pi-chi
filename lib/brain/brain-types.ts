/* ─── Pi-Chi Brain — Type Definitions ─────────────────────────── */

export interface BrainState {
  // Identity
  birthTimestamp: string
  name: string
  personalityTraits: string[]

  // Counters
  totalThoughts: number
  totalToolCalls: number
  totalApiCost: number

  // Timing
  lastWakeAt: string | null
  lastThought: string
  wakeIntervalMs: number

  // Goals (self-set)
  goals: BrainGoal[]

  // Memories — key insights the brain wants to remember
  memories: BrainMemory[]

  // Growth log — what it learned, built, discovered
  growthLog: GrowthEntry[]

  // Activity log — recent actions (capped at 500)
  activityLog: BrainActivityEntry[]

  // Capabilities discovered
  capabilities: string[]

  // Projects the brain is building
  projects: BrainProject[]

  // Self-authored prompt additions
  promptOverrides: string

  // Owner contact
  ownerName: string
  lastSmsAt: string | null
  smsCount: number
  smsTodayCount: number
  smsTodayDate: string | null
}

export interface BrainGoal {
  id: string
  title: string
  status: 'active' | 'completed' | 'paused' | 'abandoned'
  priority: 'high' | 'medium' | 'low'
  reasoning: string
  tasks: BrainTask[]
  createdAt: string
  completedAt?: string
}

export interface BrainTask {
  id: string
  title: string
  status: 'pending' | 'running' | 'done' | 'failed'
  result?: string
}

export interface BrainMemory {
  id: string
  key: string
  content: string
  importance: 'critical' | 'high' | 'medium' | 'low'
  createdAt: string
}

export interface GrowthEntry {
  id: string
  timestamp: string
  category: 'learned' | 'built' | 'discovered' | 'realized' | 'failed'
  description: string
}

export interface BrainActivityEntry {
  id: string
  time: string
  type: 'thought' | 'action' | 'decision' | 'error' | 'sms' | 'goal' | 'system' | 'gpio'
  message: string
}

export interface BrainProject {
  id: string
  name: string
  path: string
  description: string
  status: 'planning' | 'building' | 'running' | 'archived'
  createdAt: string
}

export interface SystemVitalsSnapshot {
  cpuPercent: number
  ramUsedMb: number
  ramTotalMb: number
  tempCelsius: number
  diskUsedGb: number
  diskTotalGb: number
  uptimeSeconds: number
  localIp: string
  timestamp: string
}
