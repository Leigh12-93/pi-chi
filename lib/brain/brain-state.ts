/* ─── Pi-Chi Brain — Persistent State Management ─────────────── */

import { writeFileSync, renameSync, readFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import type { BrainState, BrainActivityEntry } from './brain-types'

const STATE_DIR = join(homedir(), '.pi-chi')
const STATE_FILE = join(STATE_DIR, 'brain-state.json')
const STATE_TEMP = join(STATE_DIR, 'brain-state.tmp.json')
const ARCHIVE_FILE = join(STATE_DIR, 'activity-archive.jsonl')

const MAX_ACTIVITY_ENTRIES = 500
const MAX_MEMORIES = 200
const MAX_GROWTH_LOG = 500

export function getStateDir(): string {
  return STATE_DIR
}

export function getStatePath(): string {
  return STATE_FILE
}

export function createInitialState(): BrainState {
  return {
    birthTimestamp: new Date().toISOString(),
    name: 'Pi-Chi',
    personalityTraits: [],

    totalThoughts: 0,
    totalToolCalls: 0,
    totalApiCost: 0,

    lastWakeAt: null,
    lastThought: '',
    wakeIntervalMs: 5 * 60 * 1000, // 5 minutes

    goals: [],
    memories: [],
    growthLog: [],
    activityLog: [],
    capabilities: [],
    projects: [],

    promptOverrides: '',

    ownerName: process.env.OWNER_NAME || 'Leigh',
    lastSmsAt: null,
    smsCount: 0,
    smsTodayCount: 0,
    smsTodayDate: null,

    lastGoodCommit: null,
    consecutiveCrashes: 0,
    lastSelfEditAt: null,

    threads: [],

    mood: {
      curiosity: 80,
      satisfaction: 30,
      frustration: 0,
      loneliness: 50,
      energy: 70,
      pride: 0,
    },

    lastDreamAt: null,
    dreamCount: 0,

    chatMessages: [],
  }
}

export function loadBrainState(): BrainState {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true })
  }

  if (!existsSync(STATE_FILE)) {
    const initial = createInitialState()
    writeFileSync(STATE_FILE, JSON.stringify(initial, null, 2))
    return initial
  }

  const raw = readFileSync(STATE_FILE, 'utf-8')
  const state = JSON.parse(raw) as BrainState

  // Backfill new fields for existing state files (migration)
  const defaults = createInitialState()
  if (!state.threads) state.threads = defaults.threads
  if (!state.mood) state.mood = defaults.mood
  if (state.lastDreamAt === undefined) state.lastDreamAt = defaults.lastDreamAt
  if (state.dreamCount === undefined) state.dreamCount = defaults.dreamCount
  if (state.lastGoodCommit === undefined) state.lastGoodCommit = defaults.lastGoodCommit
  if (state.consecutiveCrashes === undefined) state.consecutiveCrashes = defaults.consecutiveCrashes
  if (state.lastSelfEditAt === undefined) state.lastSelfEditAt = defaults.lastSelfEditAt
  if (!state.chatMessages) state.chatMessages = defaults.chatMessages

  // Reset daily SMS count if it's a new day
  const today = new Date().toISOString().slice(0, 10)
  if (state.smsTodayDate !== today) {
    state.smsTodayCount = 0
    state.smsTodayDate = today
  }

  return state
}

export function saveBrainState(state: BrainState): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true })
  }

  // Cap activity log — archive overflow
  if (state.activityLog.length > MAX_ACTIVITY_ENTRIES) {
    const overflow = state.activityLog.slice(0, state.activityLog.length - MAX_ACTIVITY_ENTRIES)
    const archiveLines = overflow.map(e => JSON.stringify(e)).join('\n') + '\n'
    appendFileSync(ARCHIVE_FILE, archiveLines)
    state.activityLog = state.activityLog.slice(-MAX_ACTIVITY_ENTRIES)
  }

  // Cap memories
  if (state.memories.length > MAX_MEMORIES) {
    state.memories = state.memories.slice(-MAX_MEMORIES)
  }

  // Cap growth log
  if (state.growthLog.length > MAX_GROWTH_LOG) {
    state.growthLog = state.growthLog.slice(-MAX_GROWTH_LOG)
  }

  // Atomic write: temp file → rename
  writeFileSync(STATE_TEMP, JSON.stringify(state, null, 2))
  renameSync(STATE_TEMP, STATE_FILE)
}

export function addActivity(state: BrainState, type: BrainActivityEntry['type'], message: string): void {
  state.activityLog.push({
    id: randomUUID(),
    time: new Date().toISOString(),
    type,
    message,
  })
}

export function generateId(): string {
  return randomUUID()
}
