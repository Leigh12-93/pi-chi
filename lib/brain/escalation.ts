/* ─── Pi-Chi Decision Escalation System ───────────────────────
 * Classifies actions into safe / review / blocked categories.
 * High-risk actions are blocked or queued for owner approval.
 * ─────────────────────────────────────────────────────────── */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

const PENDING_FILE = join(homedir(), '.pi-chi', 'pending-approvals.json')

export type Category = 'safe' | 'review' | 'blocked'

export interface EscalationResult {
  proceed: boolean
  reason?: string
  category: Category
  /** @deprecated use category */
  level: Category
  approvalId?: string
}

export interface PendingApproval {
  id: string
  action: string
  details: string
  level: Category
  createdAt: string
  status: 'pending' | 'approved' | 'denied'
  resolvedAt?: string
}

// ── Keyword lists ────────────────────────────────────────────

const SAFE_KEYWORDS = ['read', 'health', 'check', 'status', 'build', 'type-check', 'lint']

const REVIEW_KEYWORDS = ['outreach', 'sms', 'pricing', 'deploy', 'evolve_prompt', 'create_tool']

const BLOCKED_KEYWORDS = [
  'binhire', 'adelaide-wheelie', 'awb', 'navigate-your-ship',
  'bulk', 'delete_all', 'drop',
]

// ── Classification ───────────────────────────────────────────

function classify(action: string, details: string): Category {
  const text = `${action} ${details}`.toLowerCase()

  // Blocked checks first — highest priority
  if (BLOCKED_KEYWORDS.some(kw => text.includes(kw))) return 'blocked'

  // Review checks
  if (REVIEW_KEYWORDS.some(kw => text.includes(kw))) return 'review'

  // Safe checks
  if (SAFE_KEYWORDS.some(kw => text.includes(kw))) return 'safe'

  // Unknown actions default to review (safe-by-default is dangerous)
  return 'review'
}

// ── Main entry point ─────────────────────────────────────────

export function checkEscalation(action: string, details: string): EscalationResult {
  const category = classify(action, details)

  switch (category) {
    case 'safe':
      return { proceed: true, category, level: category, reason: 'Action is safe to proceed.' }

    case 'review': {
      const approval = writePendingApproval(action, details, 'review')
      return {
        proceed: false,
        category,
        level: category,
        reason: `Action "${action}" requires owner approval. Written to pending-approvals.json.`,
        approvalId: approval.id,
      }
    }

    case 'blocked':
      return {
        proceed: false,
        category,
        level: category,
        reason: `Action "${action}" is blocked. Pi-Chi must not touch other businesses or perform destructive bulk operations.`,
      }
  }
}

// ── Pending approval persistence ─────────────────────────────

function writePendingApproval(action: string, details: string, level: Category): PendingApproval {
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
  const trimmed = approvals.slice(-50)
  try {
    mkdirSync(join(homedir(), '.pi-chi'), { recursive: true })
    writeFileSync(PENDING_FILE, JSON.stringify(trimmed, null, 2))
  } catch { /* non-critical */ }

  return approval
}

export function loadPendingApprovals(): PendingApproval[] {
  try {
    if (!existsSync(PENDING_FILE)) return []
    return JSON.parse(readFileSync(PENDING_FILE, 'utf-8')) as PendingApproval[]
  } catch {
    return []
  }
}

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

export function getPendingCount(): number {
  return loadPendingApprovals().filter(a => a.status === 'pending').length
}
