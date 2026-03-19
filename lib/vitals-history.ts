import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

const HISTORY_FILE = join(process.env.HOME || '/home/pi', '.pi-chi', 'vitals-history.json')
const RECORD_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes
const MAX_ENTRIES = 288 // 24 hours at 5-min intervals

export interface VitalsDataPoint {
  timestamp: string
  cpu: number
  ramUsedMb: number
  ramTotalMb: number
  diskUsedMb: number
  diskTotalMb: number
  temp: number | null
}

let lastRecordTime = 0

/** Append a vitals snapshot to history (throttled to every 5 min) */
export function appendVitalsHistory(point: VitalsDataPoint): void {
  const now = Date.now()
  if (now - lastRecordTime < RECORD_INTERVAL_MS) return
  // Skip invalid data
  if (point.cpu < 0 || point.ramUsedMb < 0) return

  lastRecordTime = now

  try {
    const history = readVitalsHistory()
    history.push(point)
    // Trim to max entries
    const trimmed = history.length > MAX_ENTRIES
      ? history.slice(history.length - MAX_ENTRIES)
      : history
    writeFileSync(HISTORY_FILE, JSON.stringify(trimmed), 'utf-8')
  } catch {
    // Silently fail — don't crash the vitals endpoint
  }
}

/** Read all vitals history */
export function readVitalsHistory(): VitalsDataPoint[] {
  try {
    if (!existsSync(HISTORY_FILE)) return []
    const raw = readFileSync(HISTORY_FILE, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}
