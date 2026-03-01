import type { VirtualFS } from '@/lib/virtual-fs'
import type { TaskStore } from '@/lib/background-tasks'

/** Shared context passed to every tool factory */
export interface ToolContext {
  vfs: VirtualFS
  projectName: string
  projectId: string | null
  effectiveGithubToken: string
  clientEnvVars: Record<string, string>
  editFailCounts: Map<string, number>
  taskStore: TaskStore
  defaultTimeout: number  // milliseconds per tool call, default 30000
  supabaseFetch: (path: string, options?: RequestInit) => Promise<{ data: any; status: number; ok: boolean }>
  githubFetch: (path: string, token: string, options?: RequestInit) => Promise<any>
}
