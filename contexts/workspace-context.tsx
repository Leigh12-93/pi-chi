'use client'

import { createContext, useContext } from 'react'
import type { WorkspaceStateReturn } from '@/hooks/use-workspace-state'
import type { WorkspaceActionsReturn } from '@/hooks/use-workspace-actions'

export interface WorkspaceContextValue {
  state: WorkspaceStateReturn
  actions: WorkspaceActionsReturn
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function WorkspaceProvider({ value, children }: { value: WorkspaceContextValue; children: React.ReactNode }) {
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
