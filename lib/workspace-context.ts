'use client'

import { createContext, useContext } from 'react'

export interface WorkspaceContextValue {
  /** All virtual files: path -> content */
  files: Record<string, string>
  /** Current project ID (null for unsaved projects) */
  projectId: string | null
  /** Connected GitHub repository URL */
  githubRepoUrl: string | null
  /** Connected Vercel project ID */
  vercelProjectId: string | null
  /** Update a single file's content */
  onFileChange: (path: string, content: string) => void
  /** Trigger a workspace action (push, create-repo, import, deploy, etc.) */
  onAction: (action: string) => void
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

/**
 * Hook to access workspace context (files, project info, action handlers).
 * Must be used within a WorkspaceContext.Provider — throws if used outside.
 */
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) {
    throw new Error('useWorkspace must be used within a WorkspaceContext.Provider')
  }
  return ctx
}
