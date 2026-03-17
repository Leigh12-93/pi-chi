/* ─── Pi-Chi Escalation System ────────────────────────────────
 * Some actions are too risky for Pi-Chi to take autonomously.
 * This module classifies actions and blocks/defers high-risk ones.
 * ─────────────────────────────────────────────────────────── */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { isNotOurBusiness } from './business-rules'

const PENDING_FILE = join(homedir(), '.pi-chi', 'pending-approvals.json')

export type ActionLevel = 'safe' | 'review' | 'blocked'

export interface EscalationResult {
  proceed: boolean
  level: ActionLevel
  reason: string
  approvalId?: string
}

export interface PendingApproval {
  id: string
  action: string
  details: string
  level: ActionLevel
  createdAt: string
  status: 'pending' | 'approved' | 'denied'
  resolvedAt?: string
}

/** Classify an action and determine if it needs escalation */
export function checkEscalation(action: string, details: string): EscalationResult {
  const lowerAction = action.toLowerCase()
  const lowerDetails = details.toLowerCase()

  // ── BLOCKED: Hard-stop actions ────────────────────────────
  if (isNotOurBusiness(details)) {
    return { proceed: false, level: 'blocked', reason: `Action targets a business we don't own: ${details}` }
  }
  if (lowerAction.includes('bulk') && (lowerAction.includes('sms') || lowerAction.includes('outreach'))) {
    return { proceed: false, level: 'blocked', reason: 'Bulk SMS/outreach is blocked. Use targeted sends.' }
  }
  if (lowerAction.includes('delete') && (lowerDetails.includes('database') || lowerDetails.includes('supabase') || lowerDetails.includes('table'))) {
    return { proceed: false, level: 'blocked', reason: 'Database deletions require owner approval.' }
  }

  // ── REVIEW: Needs owner approval before proceeding ────────
  if (lowerAction.includes('outreach') || lowerAction.includes('contact provider')) {
    const approval = writePendingApproval(action, details, 'review')
    return { proceed: false, level: 'review', reason: 'Provider outreach requires owner approval.', approvalId: approval.id }
  }
  if (lowerAction.includes('pricing') && (lowerAction.includes('change') || lowerAction.includes('update'))) {
    const approval = writePendingApproval(action, details, 'review')
    return { proceed: false, level: 'review', reason: 'Pricing changes require owner approval.', approvalId: approval.id }
  }
  if (lowerAction.includes('evolve_prompt') || lowerAction.includes('prompt change')) {
    const approval = writePendingApproval(action, details, 'review')
    return { proceed: false, level: 'review', reason: 'Prompt evolution requires owner approval.', approvalId: approval.id }
  }

  // ── SAFE: Proceed without approval ────────────────────────
  return { proceed: true, level: 'safe', reason: 'Action is safe to proceed.' }
}

/** Write a pending approval to disk for the dashboard to show */
function writePendingApproval(action: string, details: string, level: ActionLevel): PendingApproval {
  const approval: PendingApproval = {
    id: randomUUID(),
    action,
    details,
    level,
    createdAt: new Date().toISOString(),
    status: 'pending',
  }

  const approvals = loadPendingApprovals()
  approvals.push(approval)
  // Keep last 50 approvals
  const trimmed = approvals.slice(-50)
  try {
    mkdirSync(join(homedir(), '.pi-chi'), { recursive: true })
    writeFileSync(PENDING_FILE, JSON.stringify(trimmed, null, 2))
  } catch { /* non-critical */ }

  return approval
}

/** Load all pending approvals from disk */
export function loadPendingApprovals(): PendingApproval[] {
  try {
    if (!existsSync(PENDING_FILE)) return []
    return JSON.parse(readFileSync(PENDING_FILE, 'utf-8')) as PendingApproval[]
  } catch {
    return []
  }
}

/** Resolve a pending approval (approve or deny). Returns the approval if found, null otherwise. */
export function resolveApproval(approvalId: string, decision: 'approved' | 'denied'): PendingApproval | null {
  const approvals = loadPendingApprovals()
  const idx = approvals.findIndex(a => a.id === approvalId)
  if (idx === -1) return null

  approvals[idx].status = decision
  approvals[idx].resolvedAt = new Date().toISOString()
  try {
    writeFileSync(PENDING_FILE, JSON.stringify(approvals, null, 2))
    return approvals[idx]
  } catch {
    return null
  }
}

/** Get count of unresolved pending approvals */
export function getPendingCount(): number {
  return loadPendingApprovals().filter(a => a.status === 'pending').length
}
