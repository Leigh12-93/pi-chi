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

// Stop kiosk so display_agent (custom screen) can take over the framebuffer
async function stopKiosk(): Promise<void> {
  await executeCommand('sudo systemctl stop pi-chi-kiosk', { timeout: 20_000 }).catch(() => {})
  await executeCommand('sudo systemctl stop pi-chi-standby', { timeout: 20_000 }).catch(() => {})
}

export async function enterStandbyDisplay(
  reason: string,
  details: Omit<DisplayModeSnapshot, 'mode' | 'reason' | 'updatedAt'> = {},
): Promise<void> {
  writeDisplayState({
    mode: 'standby',
    reason,
    updatedAt: new Date().toISOString(),
    ...details,
  })
  // Stop kiosk so display_agent has the framebuffer — display_agent handles its own screens
  await stopKiosk()
}

export async function enterFixAuthDisplay(
  reason: string,
  details: Omit<DisplayModeSnapshot, 'mode' | 'reason' | 'updatedAt'> = {},
): Promise<void> {
  writeDisplayState({
    mode: 'fix-auth',
    reason,
    updatedAt: new Date().toISOString(),
    ...details,
  })
  await stopKiosk()
}

export async function resumeDashboardDisplay(
  reason = 'Task complete',
  details: Omit<DisplayModeSnapshot, 'mode' | 'reason' | 'updatedAt'> = {},
): Promise<void> {
  writeDisplayState({
    mode: 'active',
    reason,
    updatedAt: new Date().toISOString(),
    ...details,
  })
  // Keep display_agent in control — just ensure kiosk/standby are not fighting it
  await stopKiosk()
}
