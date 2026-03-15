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

/** Dashboard summary — derived, not stored */
export interface DashboardSummary {
  nowDoing: string
  currentMission: Mission | null
  nextUp: string | null
  attentionNeeded: AttentionItem[]
  topBusiness: BusinessProfile | null
  topOpportunity: Opportunity | null
  portfolioValue: number
  portfolioTarget: number // 1,000,000
}

export interface AttentionItem {
  id: string
  level: 'info' | 'warn' | 'critical'
  message: string
}
