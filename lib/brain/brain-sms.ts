/* ─── Pi-Chi Brain — SMS Gateway with Rate Limiting ──────────── */

import { execFile } from 'node:child_process'
import { platform } from 'node:os'
import type { BrainState } from './brain-types'
import { addActivity } from './brain-state'

const MAX_SMS_PER_HOUR = 5
const MAX_SMS_PER_DAY = 20
const MIN_SMS_INTERVAL_MS = 10 * 60 * 1000 // 10 minutes

interface SmsResult {
  success: boolean
  message: string
  rateLimited?: boolean
}

export function canSendSms(state: BrainState): { allowed: boolean; reason?: string } {
  const now = Date.now()

  // Check daily limit
  const today = new Date().toISOString().slice(0, 10)
  if (state.smsTodayDate === today && state.smsTodayCount >= MAX_SMS_PER_DAY) {
    return { allowed: false, reason: `Daily SMS limit reached (${MAX_SMS_PER_DAY}/day)` }
  }

  // Check minimum interval
  if (state.lastSmsAt) {
    const elapsed = now - new Date(state.lastSmsAt).getTime()
    if (elapsed < MIN_SMS_INTERVAL_MS) {
      const waitMins = Math.ceil((MIN_SMS_INTERVAL_MS - elapsed) / 60000)
      return { allowed: false, reason: `Too soon — wait ${waitMins} more minutes` }
    }
  }

  // Check hourly limit
  const oneHourAgo = now - 60 * 60 * 1000
  const recentSms = state.activityLog.filter(
    e => e.type === 'sms' && new Date(e.time).getTime() > oneHourAgo
  )
  if (recentSms.length >= MAX_SMS_PER_HOUR) {
    return { allowed: false, reason: `Hourly SMS limit reached (${MAX_SMS_PER_HOUR}/hour)` }
  }

  return { allowed: true }
}

export async function sendSms(state: BrainState, message: string): Promise<SmsResult> {
  const check = canSendSms(state)
  if (!check.allowed) {
    return { success: false, message: check.reason!, rateLimited: true }
  }

  // Sanitize message — single line, no newlines, max 300 chars
  const clean = message.replace(/[\r\n]+/g, ' ').trim().slice(0, 300)
  if (!clean) {
    return { success: false, message: 'Empty message' }
  }

  const recipient = process.env.SMS_RECIPIENT || 'leigh'

  try {
    // Try HTTP gateway first (if configured)
    const gatewayUrl = process.env.SMS_GATEWAY_URL
    if (gatewayUrl) {
      const res = await fetch(gatewayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipient, message: clean }),
      })
      if (res.ok) {
        recordSmsSent(state, clean)
        return { success: true, message: `SMS sent to ${recipient}` }
      }
    }

    // Fall back to bash script
    const scriptPath = process.env.SMS_GATEWAY_SCRIPT || (
      platform() === 'win32'
        ? 'C:/Users/leigh/scripts/sms.sh'
        : '/home/pi/scripts/sms.sh'
    )

    await new Promise<void>((resolve, reject) => {
      const shell = platform() === 'win32' ? 'bash' : '/bin/bash'
      execFile(shell, [scriptPath, recipient, clean], { timeout: 30000 }, (err, _stdout, stderr) => {
        if (err) reject(new Error(stderr || err.message))
        else resolve()
      })
    })

    recordSmsSent(state, clean)
    return { success: true, message: `SMS sent to ${recipient}` }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err)
    addActivity(state, 'error', `SMS failed: ${errMsg}`)
    return { success: false, message: `SMS failed: ${errMsg}` }
  }
}

function recordSmsSent(state: BrainState, message: string): void {
  const today = new Date().toISOString().slice(0, 10)
  state.lastSmsAt = new Date().toISOString()
  state.smsCount++
  if (state.smsTodayDate !== today) {
    state.smsTodayDate = today
    state.smsTodayCount = 1
  } else {
    state.smsTodayCount++
  }
  addActivity(state, 'sms', `Sent SMS: ${message.slice(0, 100)}`)
}
