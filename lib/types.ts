export interface Project {
  id: string
  name: string
  description?: string
  framework?: string
  github_username: string
  github_repo_url?: string
  vercel_url?: string
  vercel_project_id?: string
  last_deploy_at?: string
  created_at: string
  updated_at: string
}

export interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

export interface FileChange {
  path: string
  action: 'create' | 'edit' | 'delete'
  content?: string
}

export interface ChatSession {
  id: string
  projectName: string
  createdAt: string
  messageCount: number
  preview?: string
}

export type ToolStatus = 'running' | 'success' | 'error'

export interface ToolInvocation {
  toolName: string
  args: Record<string, unknown>
  result?: unknown
  status: ToolStatus
}
