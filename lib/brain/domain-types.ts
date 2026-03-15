/* ─── Pi-Chi Founder OS — Domain Types ────────────────────────── */

/** What Pi-Chi is actively working on right now */
export interface Mission {
  id: string
  type: 'maintain' | 'grow' | 'explore' | 'launch' | 'self-improve'
  title: string
  rationale: string
  targetRef?: string // businessId or opportunityId
  progressLabel: string
  startedAt: string
  status: 'active' | 'completed' | 'blocked'
}

/** Opportunity pipeline entry */
export interface Opportunity {
  id: string
  title: string
  stage: 'signal' | 'idea' | 'research' | 'validation' | 'candidate' | 'incubation' | 'launched' | 'discarded'
  confidence: number // 0-100
  description: string
  source: string
  createdAt: string
  updatedAt: string
}

/** Business portfolio entry */
export interface BusinessProfile {
  id: string
  name: string
  stage: 'development' | 'launched' | 'growing' | 'mature' | 'declining'
  health: 'healthy' | 'warning' | 'critical' | 'unknown'
  momentum: number // -100 to 100
  activeInitiatives: string[]
  lastAction: string
  lastActionAt: string
  nextMilestone: string
  riskFlags: string[]
  opportunityScore: number // 0-100
  priorityScore: number // 0-100
  estimatedMonthlyRevenue?: number
}

/** Stretch goal with ratcheting */
export interface StretchGoal {
  id: string
  title: string
  domain: 'business' | 'venture' | 'system' | 'self-improvement'
  target: number
  current: number
  unit: string
  ratchetFactor: number // e.g. 1.5 = 50% increase on completion
  history: { target: number; achievedAt: string }[]
}

/** Work cycle record */
export interface WorkCycle {
  id: string
  thoughtNumber: number
  startedAt: string
  completedAt?: string
  mission?: Mission
  actions: string[]
  outcome: string
  kpiDeltas: Record<string, number>
  lessons: string[]
}

export interface DisplayModeSnapshot {
  mode: 'dashboard' | 'standby'
  reason: string
  updatedAt: string
  missionTitle?: string | null
  detail?: string | null
  sinceThought?: number | null
  taskClass?: 'heavy-autonomous' | 'build' | 'recovery' | 'maintenance'
}

/** Dashboard summary — derived, not stored */
export interface DashboardSummary {
  nowDoing: string
  cyclePhase: 'idle' | 'planning' | 'executing' | 'responding' | 'sleeping' | 'offline' | 'error'
  currentMission: Mission | null
  autonomyReason: string | null
  nextUp: string | null
  lastEventLabel: string | null
  workQueue: WorkQueueItem[]
  backgroundEvents: AutomationEvent[]
  lastCycle: CycleSummary | null
  recentCycles: CycleSummary[]
  attentionNeeded: AttentionItem[]
  topBusiness: BusinessProfile | null
  topOpportunity: Opportunity | null
  opportunityCount: number
  topStretchGoal: StretchGoal | null
  portfolioValue: number | null
  portfolioTarget: number // 1,000,000
  displayMode: DisplayModeSnapshot | null
}

export interface AttentionItem {
  id: string
  level: 'info' | 'warn' | 'critical'
  message: string
}

export interface WorkQueueItem {
  id: string
  label: string
  status: 'now' | 'next' | 'queued' | 'blocked'
}

export interface AutomationEvent {
  id: string
  label: string
  tone: 'thinking' | 'action' | 'result' | 'warning'
  at: string
}

export interface CycleSummary {
  id: string
  title: string
  outcome: string
  nextStep: string | null
}

/* ─── Tool Execution & Chat Stream Types ─────────────────────── */

/** Tool category for icon/color mapping */
export type ToolCategory =
  | 'shell' | 'file' | 'git' | 'build' | 'network'
  | 'system' | 'brain' | 'comms' | 'gpio' | 'coding' | 'other'

/** A single tool execution event (running, completed, or failed) */
export interface ToolExecutionEvent {
  id: string
  toolName: string
  category: ToolCategory
  status: 'running' | 'completed' | 'failed'
  inputSummary?: string
  resultSummary?: string
  error?: string
  durationMs?: number
  startedAt: string
}

/** Chat stream component — union discriminator */
export type ChatStreamComponent =
  | ToolCallComponent
  | StateSnapshotComponent
  | GoalProgressComponent
  | CodeBlockComponent

/** Inline tool call card in chat stream */
export interface ToolCallComponent {
  type: 'tool-call'
  event: ToolExecutionEvent
}

/** Inline state snapshot (mood, vitals, goals) */
export interface StateSnapshotComponent {
  type: 'state-snapshot'
  mood?: {
    curiosity: number
    satisfaction: number
    energy: number
    pride: number
    frustration: number
  }
  vitals?: {
    cpuPercent: number
    ramUsedMb: number
    ramTotalMb: number
    tempC: number
    diskPercent: number
  }
  goalsSummary?: {
    active: number
    completed: number
    totalTasks: number
    doneTasks: number
  }
}

/** Goal progress update card */
export interface GoalProgressComponent {
  type: 'goal-progress'
  goalTitle: string
  taskCompleted?: string
  tasksDone: number
  tasksRemaining: number
}

/** Code block with file action context */
export interface CodeBlockComponent {
  type: 'code-block'
  filename?: string
  language: string
  content: string
  action: 'created' | 'edited' | 'read'
}

