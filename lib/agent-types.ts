// ═══════════════════════════════════════════════════════════════════
// Agent Types — shared types for the AI agent dashboard
// ═══════════════════════════════════════════════════════════════════

export interface Goal {
  id: string
  title: string
  status: 'active' | 'completed' | 'paused' | 'pending'
  priority: 'high' | 'medium' | 'low'
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

export interface TempReading {
  cpu: number
  gpu: number
  t: number // timestamp ms
}

export interface SystemVitals {
  cpuPercent: number
  cpuTemp: number
  gpuTemp: number
  ramUsedMb: number
  ramTotalMb: number
  diskUsedGb: number
  diskTotalGb: number
  uptime: string
  wifiConnected: boolean
  wifiSsid?: string
  ipAddress?: string
  gpioActive: number[]
  tempHistory: TempReading[]
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
