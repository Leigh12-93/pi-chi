/* ─── Pi-Chi Brain — Analytics Snapshot Management ─────────── */

import { join } from 'node:path'
import { homedir } from 'node:os'
import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import type { BrainState, AnalyticsSnapshot } from './brain-types'

const STATE_DIR = join(homedir(), '.pi-chi')
const ANALYTICS_FILE = join(STATE_DIR, 'analytics.jsonl')

/**
 * Create a snapshot from the current brain state and append it
 * as a JSON line to the analytics JSONL file.
 */
export function appendSnapshot(state: BrainState): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true })
  }

  const activeGoals = state.goals.filter(g => g.status === 'active').length
  const completedGoals = state.goals.filter(g => g.status === 'completed').length

  const snapshot: AnalyticsSnapshot = {
    timestamp: new Date().toISOString(),
    cycle: state.totalThoughts,
    apiCost: state.dailyCost,
    cumulativeCost: state.totalApiCost,
    mood: { ...state.mood },
    activeGoals,
    completedGoals,
    memoryCount: state.memories.length,
    projectCount: state.projects.length,
  }

  appendFileSync(ANALYTICS_FILE, JSON.stringify(snapshot) + '\n')
}

/**
 * Read and parse the analytics JSONL file.
 * Optionally filter to snapshots within the last N days.
 */
export function readSnapshots(days?: number): AnalyticsSnapshot[] {
  if (!existsSync(ANALYTICS_FILE)) return []

  const raw = readFileSync(ANALYTICS_FILE, 'utf-8')
  const lines = raw.split('\n').filter(line => line.trim().length > 0)

  const snapshots: AnalyticsSnapshot[] = []
  for (const line of lines) {
    try {
      snapshots.push(JSON.parse(line) as AnalyticsSnapshot)
    } catch {
      // Skip malformed lines
    }
  }

  if (days !== undefined && days > 0) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    return snapshots.filter(s => new Date(s.timestamp).getTime() >= cutoff)
  }

  return snapshots
}
