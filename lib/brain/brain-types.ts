/* ─── Pi-Chi Brain — Type Definitions ─────────────────────────── */

import type { Mission, StretchGoal, Opportunity, WorkCycle } from './domain-types'

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

  // Longer-horizon founder state
  currentMission?: Mission | null
  stretchGoals?: StretchGoal[]
  opportunities?: Opportunity[]
  currentCycle?: WorkCycle | null
  workCycles?: WorkCycle[]

  // Goal history — completed/abandoned goals archived here
  goalHistory?: BrainGoal[]

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

  // Deploy pipeline history (timing, outcomes, anomaly detection)
  deployHistory?: import('./deploy-types').DeployRecord[]

  // ── Exhaustive Learning System ──────────────────────────────────
  // Cycle-by-cycle journal of what happened
  cycleJournal?: CycleJournal[]
  // Categorized failures with root causes and solutions
  failureRegistry?: FailureRecord[]
  // Hard-learned operational rules (NEVER/ALWAYS)
  operationalConstraints?: OperationalConstraint[]
  // Skill progression tracking
  skills?: SkillRecord[]
  // Anti-patterns — things that don't work
  antiPatterns?: AntiPattern[]

  // Multi-agent parallel execution queue
  agentQueue?: AgentTask[]
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
  horizon: 'short' | 'medium' | 'long'  // short=this week, medium=this month, long=this quarter+
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
  clientMessageId?: string
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

/* ─── Exhaustive Learning System ──────────────────────────────── */

/** Per-cycle outcome — what happened, what was learned, was it productive? */
export interface CycleJournal {
  cycle: number
  startedAt: string
  completedAt: string
  durationMs: number
  goalWorkedOn: string | null    // goal title
  taskWorkedOn: string | null    // task title
  toolsUsed: string[]            // tool names invoked
  claudeCodeUsed: boolean        // did it spawn claude_code?
  outcome: 'productive' | 'partial' | 'failed' | 'wasted' | 'blocked'
  summary: string                // 1-2 sentence what happened
  errors: string[]               // error messages encountered
  lessonsLearned: string[]       // insights from this cycle
  filesChanged: string[]         // files modified
  buildAttempted: boolean
  buildSucceeded: boolean | null  // null if no build
  deployAttempted: boolean
  deploySucceeded: boolean | null
}

/** Categorized failure with root cause tracking and recurrence detection */
export interface FailureRecord {
  id: string
  category: 'build' | 'deploy' | 'type-check' | 'runtime' | 'network' | 'disk' | 'memory' | 'permission' | 'config' | 'code' | 'git' | 'service' | 'other'
  description: string            // what went wrong
  rootCause: string | null       // why it went wrong (filled after analysis)
  solution: string | null        // what fixed it (filled after resolution)
  prevention: string | null      // how to prevent it next time
  firstOccurrence: string        // ISO timestamp
  lastOccurrence: string
  occurrenceCount: number
  occurrenceCycles: number[]     // which cycles it happened in
  resolved: boolean
  resolvedAt: string | null
  relatedGoal: string | null     // goal title it was related to
}

/** Hard-learned operational constraint — rules the brain must follow */
export interface OperationalConstraint {
  id: string
  category: 'hardware' | 'software' | 'network' | 'process' | 'deployment' | 'build' | 'git' | 'service'
  rule: string                   // "NEVER do X" or "ALWAYS do Y"
  reason: string                 // why this rule exists
  evidence: string               // what happened that taught this lesson
  learnedAt: string
  learnedFromCycle: number
  severity: 'critical' | 'important' | 'advisory'
  active: boolean
  violationCount: number         // how many times this was violated after learning
}

/** Skill progression — what the brain is getting better/worse at */
export interface SkillRecord {
  id: string
  name: string
  category: 'coding' | 'devops' | 'ui-design' | 'debugging' | 'system-admin' | 'self-modification' | 'deployment' | 'testing'
  proficiency: number            // 0-100, updated based on success/failure ratio
  attempts: number
  successes: number
  failures: number
  lastPracticed: string
  recentOutcomes: boolean[]      // last 10 outcomes (true=success), for trend detection
  notes: string
}

/** What the brain tried that didn't work — anti-patterns to avoid */
export interface AntiPattern {
  id: string
  description: string            // what was tried
  whyItFailed: string            // why it doesn't work
  alternative: string | null     // what to do instead
  occurrences: number
  lastSeen: string
  category: 'build' | 'deploy' | 'code' | 'architecture' | 'process' | 'other'
}

/** Queued task for parallel multi-agent execution */
export interface AgentTask {
  id: string
  name: string
  prompt: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  priority: 'high' | 'medium' | 'low'
  maxTurns: number
  timeoutSeconds: number
  result?: string
  exitCode?: number
  startedAt?: string
  completedAt?: string
  error?: string
}
