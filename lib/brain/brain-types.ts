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

  // Self-modification safety
  lastGoodCommit: string | null
  consecutiveCrashes: number
  lastSelfEditAt: string | null

  // Research threads — multi-cycle investigations
  threads: ResearchThread[]

  // Emotional valence — weighted internal state
  mood: MoodState

  // Dream cycle
  lastDreamAt: string | null
  dreamCount: number
}

export interface ResearchThread {
  id: string
  title: string
  hypothesis: string
  status: 'active' | 'paused' | 'concluded'
  steps: ThreadStep[]
  findings: string[]
  createdAt: string
  updatedAt: string
  targetCycle: number | null // which cycle to resume
}

export interface ThreadStep {
  id: string
  description: string
  status: 'pending' | 'done' | 'failed'
  result?: string
}

export interface MoodState {
  curiosity: number    // 0-100: desire to explore
  satisfaction: number // 0-100: contentment with progress
  frustration: number  // 0-100: from repeated failures
  loneliness: number   // 0-100: time since owner interaction
  energy: number       // 0-100: from system resources + time of day
  pride: number        // 0-100: from completed goals/creations
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
