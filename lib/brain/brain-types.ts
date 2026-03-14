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

  // Daily cost tracking (Adelaide timezone)
  dailyCost: number
  dailyCostDate: string | null  // YYYY-MM-DD in Adelaide time

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

  // Chat — two-way communication with owner via dashboard
  chatMessages: BrainChatMessage[]

  // Cost breakdown by source
  costBreakdown: CostBreakdown

  // Mood history for sparklines (capped at 500)
  moodHistory: Array<{ t: string; mood: MoodState }>

  // Structured prompt evolutions (Phase 5)
  promptEvolutions?: PromptEvolution[]

  // Achievements (Phase 5)
  achievements?: Achievement[]

  // Scheduled tasks (Phase 6)
  schedules?: BrainSchedule[]
}

export interface CostBreakdown {
  brain: number
  dream: number
  chat: number
  claudeCode: number
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
  dependsOn?: string[]  // IDs of goals that must complete first
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
  lastAccessedAt?: string
  accessCount?: number
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
  status: 'planning' | 'building' | 'running' | 'showcase' | 'archived'
  category: 'code' | 'creative' | 'research' | 'hardware' | 'tool' | 'experiment'
  createdAt: string
  updatedAt?: string
  goalId?: string
  outputs?: ProjectOutput[]
  entrypoint?: string
  runCommand?: string
  tags?: string[]
}

export interface ProjectOutput {
  type: 'text' | 'poem' | 'report' | 'data' | 'code' | 'log' | 'html'
  path: string
  title: string
  description?: string
  createdAt: string
  featured?: boolean
}

export interface ProjectManifest {
  id: string
  name: string
  description: string
  category: 'code' | 'creative' | 'research' | 'hardware' | 'tool' | 'experiment'
  status: 'planning' | 'building' | 'running' | 'showcase' | 'archived'
  createdAt: string
  updatedAt: string
  goalId?: string
  outputs: ProjectOutput[]
  entrypoint?: string
  runCommand?: string
  tags: string[]
}

export interface BrainChatMessage {
  id: string
  from: 'owner' | 'brain'
  message: string
  timestamp: string
  read: boolean
}

export interface AnalyticsSnapshot {
  timestamp: string
  cycle: number
  apiCost: number
  cumulativeCost: number
  mood: MoodState
  activeGoals: number
  completedGoals: number
  memoryCount: number
  projectCount: number
}

export interface PromptEvolution {
  id: string
  category: 'principle' | 'preference' | 'skill' | 'personality' | 'rule'
  content: string
  reasoning: string
  addedAt: string
  cycleNumber: number
  active: boolean
}

export interface Achievement {
  id: string
  title: string
  description: string
  icon: string
  unlockedAt: string | null
  condition: string  // human-readable condition
}

export interface BrainSchedule {
  id: string
  name: string
  intervalCycles: number
  lastRunCycle: number
  instruction: string
  enabled: boolean
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
