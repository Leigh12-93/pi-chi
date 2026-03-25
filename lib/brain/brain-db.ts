import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { BrainActivityEntry, BrainGoal, BrainState } from './brain-types'

const STATE_DIR = join(homedir(), '.pi-chi')
const DB_PATH = join(STATE_DIR, 'brain.db')
const SNAPSHOT_PATH = join(STATE_DIR, 'brain-db-sync.json')
const SCRIPT_PATH = join(homedir(), 'pi-chi', 'lib', 'brain', 'brain-db.py')

let initDone = false
let lastSyncHash = ''

function runPython(args: string[]): string {
  const output = execFileSync('python3', [SCRIPT_PATH, ...args], {
    cwd: STATE_DIR,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  return String(output || '').trim()
}

function activeGoal(state: BrainState): BrainGoal | undefined {
  return state.goals
    .filter(goal => goal.status === 'active')
    .sort((a, b) => ({ high: 3, medium: 2, low: 1 }[b.priority] - { high: 3, medium: 2, low: 1 }[a.priority]))[0]
}

function nextTask(state: BrainState): string {
  const goal = activeGoal(state)
  if (!goal) return ''
  const task = goal.tasks.find(item => item.status === 'pending' || item.status === 'running')
  return task?.title || ''
}

function latestMeaningfulActivity(state: BrainState): BrainActivityEntry | undefined {
  return [...state.activityLog].reverse().find(entry => entry.message && entry.type !== 'gpio')
}

function buildSnapshot(state: BrainState) {
  const goal = activeGoal(state)
  const currentMission = state.currentMission || null
  const latest = latestMeaningfulActivity(state)
  const goals = state.goals.map(goalItem => ({
    ...goalItem,
    tasks: (goalItem.tasks || []).map(task => ({
      ...task,
      status: task.status || 'pending',
      result: task.result || '',
    })),
  }))
  const voice = [
    'first-person',
    'direct',
    'concise',
    'excited to report progress',
    'professional on-screen',
  ].join(', ')

  const values = [
    'protect operator time',
    'prefer verified changes',
    'keep businesses healthy',
    'explain why work matters',
  ]

  const styleRules = [
    'Speak in short first-person blurbs on the display.',
    'Explain why a task matters when idle.',
    'Prefer concrete actions, outcomes, and next steps over generic status words.',
  ]

  return {
    profile: {
      name: state.name,
      ownerName: state.ownerName || null,
      birthTimestamp: state.birthTimestamp,
      voice,
      temperament: state.personalityTraits?.length
        ? state.personalityTraits.slice(0, 4).join(', ')
        : 'curious, pragmatic, persistent, founder-minded',
    },
    traits: state.personalityTraits?.length
      ? state.personalityTraits
      : ['curious', 'pragmatic', 'persistent', 'protective', 'founder-minded'],
    values,
    styleRules,
    operatorPreferences: {
      display_style: 'clean-news-reel',
      display_density: 'large-type',
      display_mode: 'single-live-canvas',
    },
    mission: currentMission
      ? {
          id: currentMission.id,
          title: currentMission.title,
          rationale: currentMission.rationale || '',
          progressLabel: currentMission.progressLabel || '',
          status: currentMission.status,
        }
      : null,
    goals,
    memories: state.memories,
    activityEvents: state.activityLog.slice(-400),
    reasoningSnapshot: {
      id: randomUUID(),
      summary: state.lastThought || latest?.message || (goal?.title ?? 'Keeping things healthy'),
      why: currentMission?.rationale || goal?.reasoning || '',
      nextStep: nextTask(state),
      mode: currentMission?.type || 'maintain',
      createdAt: new Date().toISOString(),
    },
  }
}

function snapshotHash(snapshot: unknown): string {
  return createHash('sha1').update(JSON.stringify(snapshot)).digest('hex')
}

export function getBrainDbPath(): string {
  return DB_PATH
}

export function ensureBrainDb(state?: BrainState): void {
  if (!existsSync(STATE_DIR)) {
    mkdirSync(STATE_DIR, { recursive: true })
  }
  if (initDone && existsSync(DB_PATH)) return
  runPython(['init', DB_PATH])
  initDone = true
  if (state) syncBrainDb(state, true)
}

export function syncBrainDb(state: BrainState, force = false): void {
  ensureBrainDb()
  const snapshot = buildSnapshot(state)
  const hash = snapshotHash(snapshot)
  if (!force && hash === lastSyncHash) return
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2))
  runPython(['sync', DB_PATH, SNAPSHOT_PATH])
  lastSyncHash = hash
}

export function readBrainDbBlurb(kind: 'idle' | 'why' | 'next' | 'mode' = 'idle'): string {
  ensureBrainDb()
  return runPython(['blurb', DB_PATH, kind])
}
