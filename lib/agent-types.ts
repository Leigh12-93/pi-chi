// ═══════════════════════════════════════════════════════════════════
// Agent Types — shared types for the AI agent dashboard
// ═══════════════════════════════════════════════════════════════════

export interface Goal {
  id: string
  title: string
  status: 'active' | 'completed' | 'paused' | 'pending'
  priority: 'high' | 'medium' | 'low'
  horizon?: 'short' | 'medium' | 'long'  // short=this week, medium=this month, long=this quarter+
  tasks: AgentTask[]
  createdAt: string
  reasoning?: string
}

export interface AgentTask {
  id: string
  title: string
  status: 'done' | 'running' | 'pending' | 'failed'
  detail?: string
}

export interface ActivityEntry {
  id: string
  time: string
  message: string
  type: 'system' | 'goal' | 'action' | 'decision' | 'error' | 'success' | 'gpio' | 'network'
}

export interface SystemVitals {
  cpuPercent: number
  cpuTemp: number
  ramUsedMb: number
  ramTotalMb: number
  diskUsedGb: number
  diskTotalGb: number
  uptime: string
  wifiConnected: boolean
  wifiSsid?: string
  ipAddress?: string
  gpioActive: number[]
}

export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'error'

export type AppMode = 'agent' | 'ide' | 'terminal'

export interface ToolInvocation {
  toolName: string
  args?: Record<string, unknown>
  result?: string
  status: 'running' | 'completed' | 'error'
  timestamp: number
}

/* ─── Ops Feed Types ──────────────────────────── */

export type FeedItemKind =
  | 'activity' | 'mission' | 'queue' | 'cycle-complete'
  | 'mood-shift' | 'attention' | 'opportunity' | 'portfolio'
  | 'vitals' | 'background' | 'status'

export interface FeedItem {
  id: string
  kind: FeedItemKind
  timestamp: number       // epoch ms for sorting
  displayTime: string     // "14:32"
  icon: string            // lucide icon key
  color: string           // tailwind color class
  headline: string        // one-line primary text
  detail?: string         // optional secondary line
  tone?: 'neutral' | 'positive' | 'warning' | 'critical' | 'accent'
}
