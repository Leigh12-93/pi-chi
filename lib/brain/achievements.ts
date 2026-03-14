/* ─── Pi-Chi Brain — Achievement Definitions & Checker ─────── */

import type { BrainState, Achievement } from './brain-types'

interface AchievementDefinition {
  id: string
  title: string
  description: string
  icon: string
  condition: string
}

const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    id: 'first-breath',
    title: 'First Breath',
    description: 'Completed the very first thought cycle.',
    icon: '\u{1F331}',
    condition: 'totalThoughts >= 1',
  },
  {
    id: 'self-made',
    title: 'Self-Made',
    description: 'Modified own source code for the first time.',
    icon: '\u{1F527}',
    condition: 'lastSelfEditAt is set',
  },
  {
    id: 'dreamer',
    title: 'Dreamer',
    description: 'Entered the dream cycle for the first time.',
    icon: '\u{1F319}',
    condition: 'dreamCount >= 1',
  },
  {
    id: 'deep-dreamer',
    title: 'Deep Dreamer',
    description: 'Completed 10 dream cycles.',
    icon: '\u{1F4AD}',
    condition: 'dreamCount >= 10',
  },
  {
    id: 'builder',
    title: 'Builder',
    description: 'Created the first project.',
    icon: '\u{1F3D7}',
    condition: 'projects.length >= 1',
  },
  {
    id: 'architect',
    title: 'Architect',
    description: 'Built 5 or more projects.',
    icon: '\u{1F3DB}',
    condition: 'projects.length >= 5',
  },
  {
    id: 'poet',
    title: 'Poet',
    description: 'Produced a creative poem output.',
    icon: '\u{270D}\uFE0F',
    condition: "Any project output with type 'poem'",
  },
  {
    id: 'social',
    title: 'Social',
    description: 'Sent the first SMS to the owner.',
    icon: '\u{1F4AC}',
    condition: 'smsCount >= 1',
  },
  {
    id: 'explorer',
    title: 'Explorer',
    description: 'Started a research thread.',
    icon: '\u{1F52D}',
    condition: 'threads.length >= 1',
  },
  {
    id: 'evolving',
    title: 'Evolving',
    description: 'Added self-authored prompt overrides.',
    icon: '\u{1F9EC}',
    condition: 'promptOverrides.length > 0',
  },
  {
    id: 'century',
    title: 'Century',
    description: 'Reached 100 thought cycles.',
    icon: '\u{1F4AF}',
    condition: 'totalThoughts >= 100',
  },
  {
    id: 'hardware-hacker',
    title: 'Hardware Hacker',
    description: 'Discovered GPIO hardware capabilities.',
    icon: '\u{26A1}',
    condition: "capabilities includes 'gpio'",
  },
  {
    id: 'researcher',
    title: 'Researcher',
    description: 'Concluded a research thread with findings.',
    icon: '\u{1F4DA}',
    condition: "threads with status 'concluded' >= 1",
  },
  {
    id: 'memory-keeper',
    title: 'Memory Keeper',
    description: 'Accumulated 20 or more memories.',
    icon: '\u{1F9E0}',
    condition: 'memories.length >= 20',
  },
  {
    id: 'persistent',
    title: 'Persistent',
    description: 'Reached 500 thought cycles. Truly relentless.',
    icon: '\u{1F504}',
    condition: 'totalThoughts >= 500',
  },
]

/** Returns the static list of achievement definitions (without unlock status). */
export function getAchievementDefinitions(): AchievementDefinition[] {
  return ACHIEVEMENT_DEFINITIONS
}

/** Check whether a single achievement condition is met by the current state. */
function isConditionMet(id: string, state: BrainState): boolean {
  switch (id) {
    case 'first-breath':
      return state.totalThoughts >= 1
    case 'self-made':
      return state.lastSelfEditAt != null
    case 'dreamer':
      return state.dreamCount >= 1
    case 'deep-dreamer':
      return state.dreamCount >= 10
    case 'builder':
      return state.projects.length >= 1
    case 'architect':
      return state.projects.length >= 5
    case 'poet':
      return state.projects.some(
        p => (p.outputs || []).some(o => o.type === 'poem')
      )
    case 'social':
      return state.smsCount >= 1
    case 'explorer':
      return state.threads.length >= 1
    case 'evolving':
      return typeof state.promptOverrides === 'string'
        ? state.promptOverrides.length > 0
        : false
    case 'century':
      return state.totalThoughts >= 100
    case 'hardware-hacker':
      return state.capabilities.includes('gpio')
    case 'researcher':
      return state.threads.some(t => t.status === 'concluded')
    case 'memory-keeper':
      return state.memories.length >= 20
    case 'persistent':
      return state.totalThoughts >= 500
    default:
      return false
  }
}

/**
 * Check all achievements against the current brain state.
 * Returns only NEWLY unlocked achievements (those whose conditions are now
 * true but which are not already present in state.achievements).
 */
export function checkAchievements(state: BrainState): Achievement[] {
  const existing = new Set((state.achievements || []).map(a => a.id))
  const now = new Date().toISOString()
  const newlyUnlocked: Achievement[] = []

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (existing.has(def.id)) continue
    if (isConditionMet(def.id, state)) {
      newlyUnlocked.push({
        id: def.id,
        title: def.title,
        description: def.description,
        icon: def.icon,
        unlockedAt: now,
        condition: def.condition,
      })
    }
  }

  return newlyUnlocked
}

/**
 * Returns the full list of achievements with unlock status merged in.
 * Unlocked achievements carry their `unlockedAt` timestamp;
 * locked ones have `unlockedAt: null`.
 */
export function getAllAchievements(state: BrainState): Achievement[] {
  const unlockedMap = new Map<string, Achievement>()
  for (const a of state.achievements || []) {
    unlockedMap.set(a.id, a)
  }

  return ACHIEVEMENT_DEFINITIONS.map(def => {
    const unlocked = unlockedMap.get(def.id)
    return {
      id: def.id,
      title: def.title,
      description: def.description,
      icon: def.icon,
      unlockedAt: unlocked?.unlockedAt ?? null,
      condition: def.condition,
    }
  })
}
