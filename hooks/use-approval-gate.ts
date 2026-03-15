'use client'

import { useState, useRef, useCallback } from 'react'

export interface PendingApprovalInfo {
  toolName: string
  args: Record<string, unknown>
  key: string
}

export interface UseApprovalGateReturn {
  /** Currently pending approval request (shown as approval card) */
  pendingApproval: PendingApprovalInfo | null
  /** Set to show a new approval request */
  setPendingApproval: React.Dispatch<React.SetStateAction<PendingApprovalInfo | null>>
  /** Ref of approved invocation keys */
  approvedKeys: React.RefObject<Set<string>>
  /** Ref of denied invocation keys */
  deniedKeys: React.RefObject<Set<string>>
  /** Approve a destructive tool invocation */
  handleApprove: (key: string) => void
  /** Deny a destructive tool invocation */
  handleDeny: (key: string) => void
  /** Check if a key has been approved */
  isApproved: (key: string) => boolean
  /** Check if a key has been denied */
  isDenied: (key: string) => boolean
}

/**
 * Manages the approval gate for destructive tool invocations.
 * Tracks approved/denied keys and provides callbacks for the approval card UI.
 */
export function useApprovalGate(
  sendMessage: (opts: { text: string }) => void,
): UseApprovalGateReturn {
  const [pendingApproval, setPendingApproval] = useState<PendingApprovalInfo | null>(null)
  const approvedKeys = useRef(new Set<string>())
  const deniedKeys = useRef(new Set<string>())

  const handleApprove = useCallback((key: string) => {
    approvedKeys.current.add(key)
    setPendingApproval(null)
  }, [])

  const handleDeny = useCallback((key: string) => {
    deniedKeys.current.add(key)
    setPendingApproval(null)
    // Inject a synthetic message telling the AI the action was denied
    const parts = key.split(':')
    const toolName = parts[1] || 'the operation'
    sendMessage({ text: `I denied ${toolName.replace(/_/g, ' ')}. Please try a different approach.` })
  }, [sendMessage])

  const isApproved = useCallback((key: string) => {
    return approvedKeys.current.has(key)
  }, [])

  const isDenied = useCallback((key: string) => {
    return deniedKeys.current.has(key)
  }, [])

  return {
    pendingApproval,
    setPendingApproval,
    approvedKeys,
    deniedKeys,
    handleApprove,
    handleDeny,
    isApproved,
    isDenied,
  }
}
