import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { executeCommand } from '../tools/terminal-tools'
import type { DisplayModeSnapshot } from './domain-types'

const STATE_DIR = join(homedir(), '.pi-chi')
const DISPLAY_STATE_FILE = join(STATE_DIR, 'display-mode.json')

export function getDisplayStatePath(): string {
  return DISPLAY_STATE_FILE
}

export function readDisplayState(): DisplayModeSnapshot | null {
  try {
    return JSON.parse(readFileSync(DISPLAY_STATE_FILE, 'utf-8')) as DisplayModeSnapshot
  } catch {
    return null
  }
}

function writeDisplayState(snapshot: DisplayModeSnapshot) {
  try {
    writeFileSync(
      DISPLAY_STATE_FILE,
      JSON.stringify(snapshot, null, 2),
      'utf-8',
    )
  } catch {
    // non-critical
  }
}

export async function enterStandbyDisplay(
  reason: string,
  details: Omit<DisplayModeSnapshot, 'mode' | 'reason' | 'updatedAt'> = {}
): Promise<void> {
  writeDisplayState({
    mode: 'standby',
    reason,
    updatedAt: new Date().toISOString(),
    ...details,
  })
  await executeCommand('sudo systemctl stop pi-chi-kiosk', { timeout: 20_000 }).catch(() => {})
  await executeCommand('sudo systemctl start pi-chi-standby', { timeout: 20_000 }).catch(() => {})
}

export async function resumeDashboardDisplay(
  reason = 'Task complete',
  details: Omit<DisplayModeSnapshot, 'mode' | 'reason' | 'updatedAt'> = {}
): Promise<void> {
  writeDisplayState({
    mode: 'dashboard',
    reason,
    updatedAt: new Date().toISOString(),
    ...details,
  })
  await executeCommand('sudo systemctl stop pi-chi-standby', { timeout: 20_000 }).catch(() => {})
  await executeCommand('sudo systemctl start pi-chi-kiosk', { timeout: 20_000 }).catch(() => {})
}
