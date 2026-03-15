import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { executeCommand } from '../tools/terminal-tools'

const STATE_DIR = join(homedir(), '.pi-chi')
const DISPLAY_STATE_FILE = join(STATE_DIR, 'display-mode.json')

function writeDisplayState(mode: 'dashboard' | 'standby', reason: string) {
  try {
    writeFileSync(
      DISPLAY_STATE_FILE,
      JSON.stringify(
        {
          mode,
          reason,
          updatedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
      'utf-8',
    )
  } catch {
    // non-critical
  }
}

export async function enterStandbyDisplay(reason: string): Promise<void> {
  writeDisplayState('standby', reason)
  await executeCommand('sudo systemctl stop pi-chi-kiosk', { timeout: 20_000 }).catch(() => {})
  await executeCommand('sudo systemctl start pi-chi-standby', { timeout: 20_000 }).catch(() => {})
}

export async function resumeDashboardDisplay(reason = 'Task complete'): Promise<void> {
  writeDisplayState('dashboard', reason)
  await executeCommand('sudo systemctl stop pi-chi-standby', { timeout: 20_000 }).catch(() => {})
  await executeCommand('sudo systemctl start pi-chi-kiosk', { timeout: 20_000 }).catch(() => {})
}
