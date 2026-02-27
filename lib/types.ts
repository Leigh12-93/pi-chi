export interface Project {
  name: string
  path: string
  createdAt: string
  updatedAt: string
  description?: string
  framework?: string
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
