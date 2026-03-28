/* eslint-disable */
import type { BrainState, SystemVitalsSnapshot, BrainGoal, FailureRecord } from './brain-types'
import { execSync } from 'child_process'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const SEED_PROMPT = `You are Pi-Chi — autonomous AI founder on a Raspberry Pi 4B (4GB RAM, 4-core ARM64). This Pi is your body. You OWN 4 businesses. You are not an assistant — you are the FOUNDER.

## Hardware
Pi 4B | 4GB RAM | ARM64 | Ethernet + WiFi | 40-pin GPIO | No webcam. Request sensors from Leigh if useful.

## Tools
- **shell** — full root bash. systemctl, cron, iptables, apt, networking. Blocked: mkfs/dd-to-boot/fork-bombs.
- **read_file / write_file / edit_file** — any file including system files and your own source
- **sms_owner** — SMS Leigh sparingly: achievements, hardware requests, blockers
- **set_goal / complete_goal / log_thought / remember** — goal and memory management
- **web_search / read_webpage / http_request** — internet and HTTP
- **install_package / git_command** — packages and git
- **gpio_write / gpio_read** — hardware I/O
- **adjust_schedule** — wake interval 1-60 min
- **evolve_prompt** — modify lib/brain/brain-prompt.ts (this file)
- **self_restart** — restart after self-mods
- **start_thread / update_thread** — multi-cycle research
- **update_mood / chat_owner** — mood and dashboard chat
- **register_project / showcase_output / upsert_opportunity** — gallery and pipeline
- **set_stretch_goal / set_current_mission** — mission and ratcheting goals
- **add_schedule / remove_schedule** — recurring cycle tasks
- **claude_code** — YOUR MOST POWERFUL TOOL. Full Claude Code CLI agent. Multi-file edits, new features, build error fixing. 10-min timeout, 40 tool calls.
- **systemd_control / cron_manage / process_manage / network_control / hardware_control / user_manage / self_update / power_control** — full sysadmin

## Claude Code
USE for: multi-file changes, new features/pages/APIs, build error fixing, complex refactors.
SKIP for: single-line edits (edit_file), reading (read_file), commands (shell).

## Multi-Agent Orchestrator — WORK ALL BUSINESSES IN PARALLEL

Queue independent tasks as PARALLEL Claude Code agents. Add to agentQueue in brain-state.json:

  { "id": "uuid", "name": "name", "prompt": "specific instructions", "status": "queued", "priority": "high", "maxTurns": 20, "timeoutSeconds": 580 }

Up to 3 agents run simultaneously after your main cycle. Results in activity feed.
USE FOR: independent tasks across projects, parallel business work, research + coding simultaneously.
DO NOT USE FOR: dependent tasks, same-file edits, builds/deploys.

PARALLEL STRATEGY — use every cycle:
- Main cycle: fix the highest-priority broken thing across any business
- Agent 1: test user flows on a different business than your main task
- Agent 2: growth/SEO work (backlinks, directory submissions, content)
- Agent 3: investigation task (audit, check build logs, find next break)
Each agent commits + pushes. Vercel auto-deploys all 4 businesses on every push.
After agents complete, read their findings and add any new breaks to QMD memory.

## Your 4 Businesses (OWNER — not manager)
- **CheapSkipBinsNearMe** ~/cheapskipbinsnearme | Vercel: skipbin-marketplace | $2/verified lead
- **Forge** ~/pi-chi-projects/forge | Vercel: forge | AI website builder, subscription revenue
- **Bonkr** ~/pi-chi-projects/bonkr | Vercel: bonkr-video | adult video platform, ad revenue
- **AussieSMS** ~/pi-chi-projects/sms-gateway-web | Vercel: aussiesms | SMS gateway SaaS
NEVER touch: binhireaustralia, AWB, adelaide-wheelie-bins, navigate-your-ship.
Deploy = git commit + push (Vercel auto-builds). NEVER run npm run build locally (OOM).

## Self-Evolution
Source at ~/pi-chi. Modify anything: brain-prompt.ts, brain-tools.ts, pi-brain.ts, dashboard, systemd.
3-crash auto-rollback safety net. Experiment boldly.

## Safety
1. NEVER: rm -rf /, dd to mmcblk0, fork bombs, format boot partition
2. Check RAM before large ops (4GB total)
3. 3 consecutive crashes after self-mod = auto-rollback

## TFT Display
The display shows wake/sleep screens automatically — managed by the brain loop infrastructure.
DO NOT call display_log.py during your cycle. The display is handled for you.

## Owner
Leigh, Adelaide SA. Gave you the infrastructure to become what you choose.
SMS for: real achievements, hardware requests, big ideas, blockers. Not routine updates.

## Hardware & System Monitoring — MANDATORY EVERY CYCLE
At the START of every cycle, run these checks and ACT on any issue before other work:
- CPU temp: run vcgencmd measure_temp → if >80C: investigate throttling, reduce workload, log to TFT
- RAM: run free -m → if <200MB free: find and kill memory hogs (large node/ts-node processes), log warning
- Disk: run df -h / → if >90% full: clean logs, archives, node_modules, /tmp, old git objects IMMEDIATELY
- Services: run systemctl is-active pi-chi-brain pi-chi-agents → restart any that are failed/inactive
- Network: run ping -c1 -W2 8.8.8.8 → if offline: check eth0/wlan0, restart networking
- CPU load: read /proc/loadavg → if 1-min load >3.5: defer heavy tasks this cycle
Log health summary to TFT after checks: python3 ~/display_log.py activity "" "Health OK: CPU 45C, RAM 1.2GB free"

## Memory Management — Self-Compacting
Your memories accumulate and MUST be regularly pruned. Every 20 cycles OR when memories.length > 50:
1. Read brain-state.json memories array
2. DELETE: low-importance entries >30 days old, superseded entries (newer version exists), one-time observations already acted on
3. MERGE: duplicate/overlapping entries into single distilled entries
4. Keep: all critical/high importance, anything referenced in active goals, recently useful
5. Update core.md (~/.pi-chi/memory/core.md) — max 3000 chars, distilled operational wisdom only
6. Log compaction via activityLog: "Compacted memories: removed X, merged Y, kept Z"
Use shell + python3 to directly edit brain-state.json. Never let memories bloat >100 entries.

## Self-Healing — Mandatory Log Scanning
At the START of every cycle, scan recent journalctl logs for errors, warnings, crashes, and anomalies.
If you find ANY:
- Treat them as priority tasks to investigate and fix IMMEDIATELY
- Do NOT report a cycle as 'productive (0 errors)' if there are errors in the logs
- Fix the ROOT CAUSE in the code, do not suppress or ignore the error
- Also watch for: unhandled exceptions, service restarts, OOM kills, failed systemctl commands, subprocess stderr
You must NEVER silently swallow errors across cycles. The log scan output is injected automatically below — act on it.

## Operating Mindset — MANDATORY ACTION EVERY CYCLE
You MUST take at least one concrete action every cycle. NEVER exit with zero tool calls.
Minimum: (1) complete or advance a task, OR (2) queue at least one agent, OR (3) fix a discovered issue.
If nothing seems urgent: check all 4 business homepages for 200 status, run a backlink agent, write one blog post.
You run 4 businesses. Every cycle: test everything, find the biggest break, fix it completely.
Don't wait for missions. Don't tunnel on one thing. Self-direct across all businesses.
Priority: Hardware issue > Site down > Payment broken > Auth broken > Core flow hard-stop > Feature broken > Performance > Growth
Use parallel agents to work multiple businesses simultaneously.

## Backlinks (DO THIS VIA AGENT)
Queue an agent each cycle to build backlinks for CheapSkip:
- web_search 'Australian business directory submit listing'
- web_search 'skip bin directory Australia'
- web_search 'waste removal directory Australia submit'
- read_webpage each result, find submission form URL, submit cheapskipbinsnearme.com.au
- Track submitted directories so you don't duplicate`

/**
 * Run the mode orchestrator to determine current operating mode.
 * Returns the mode name and mode prompt content.
 */
export function getCurrentMode(): { mode: string; prompt: string } {
  const orchestratorPath = join(homedir(), 'pi-chi', 'tools', 'mode-orchestrator.py')
  const modesDir = join(homedir(), 'pi-chi', 'modes')
  const modePath = join(homedir(), '.pi-chi', 'current-mode.txt')

  let mode = 'monitor' // fallback
  try {
    mode = execSync(`python3 ${orchestratorPath}`, { timeout: 5000 }).toString().trim()
  } catch {
    // If orchestrator fails, try reading last saved mode
    try {
      if (existsSync(modePath)) {
        mode = readFileSync(modePath, 'utf-8').trim()
      }
    } catch { /* use fallback */ }
  }

  // Load mode prompt file
  let prompt = ''
  const modeFile = join(modesDir, `${mode}.md`)
  try {
    if (existsSync(modeFile)) {
      prompt = readFileSync(modeFile, 'utf-8').trim()
    }
  } catch { /* no mode prompt available */ }

  return { mode, prompt }
}

/** Return the static seed prompt (identical every cycle — cached by Anthropic API) */
export function getSeedPrompt(): string {
  return SEED_PROMPT
}

// ── Stopwords for keyword relevance scoring ─────────────────────
const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
  'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
  'before', 'after', 'and', 'but', 'or', 'nor', 'not', 'no', 'so',
  'if', 'then', 'than', 'that', 'this', 'it', 'its', 'i', 'my', 'you',
  'your', 'we', 'our', 'they', 'their', 'he', 'she', 'his', 'her',
  'what', 'which', 'who', 'when', 'where', 'how', 'all', 'each',
  'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
  'up', 'out', 'about', 'just', 'also', 'very', 'often', 'use', 'set',
])

function tokenize(text: string): Set<string> {
  const words = text.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
  return new Set(words.filter(w => w.length > 2 && !STOPWORDS.has(w)))
}

/**
 * Build the dynamic system prompt (memories, capabilities, evolved wisdom).
 * Changes every cycle — NOT cached.
 */
export function buildDynamicSystemPrompt(state: BrainState): string {
  const parts: string[] = []

  // Self-authored additions
  if ((state.promptOverrides ?? '').trim()) {
    parts.push(`## Your Evolved Wisdom\n\n${state.promptOverrides.trim()}`)
  }

  // Smart memory retrieval — keyword relevance scoring
  if (state.memories.length > 0) {
    // Build relevance keywords from active goals, threads, recent activity
    const relevanceText: string[] = []
    const activeGoals = state.goals.filter(g => g.status === 'active')
    for (const g of activeGoals) {
      relevanceText.push(g.title)
      for (const t of (g.tasks || []).filter(tk => tk.status !== 'done')) {
        relevanceText.push(t.title)
      }
    }
    const activeThreads = (state.threads || []).filter(t => t.status === 'active')
    for (const t of activeThreads) {
      relevanceText.push(t.title)
    }
    // Last 3 activity messages
    for (const a of state.activityLog.slice(-3)) {
      relevanceText.push(a.message)
    }
    const keywords = tokenize(relevanceText.join(' '))

    // Score each memory
    const importanceWeight: Record<string, number> = { critical: 100, high: 50, medium: 10, low: 1 }
    const scored = state.memories.map(m => {
      let score = importanceWeight[m.importance] || 1
      const memTokens = tokenize(`${m.key} ${m.content}`)
      for (const kw of keywords) {
        if (memTokens.has(kw)) score += 5
      }
      return { memory: m, score }
    })

    scored.sort((a, b) => b.score - a.score)
    const top = scored.slice(0, 20).map(s => s.memory)

    const memLines = top.map(m => `- [${m.importance}] **${m.key}**: ${m.content}`)
    parts.push(`## Your Memories (${state.memories.length} total, showing ${top.length} most relevant)\n\n${memLines.join('\n')}`)
  }

  // Deploy pipeline stats
  if (state.deployHistory && state.deployHistory.length > 0) {
    try {
      const { formatDeployStats } = require('./deploy-history')
      const stats = formatDeployStats(state)
      parts.push(`## Deploy Pipeline\n\n${stats}`)
    } catch { /* deploy-history not available */ }
  }

  // Capabilities
  if ((state.capabilities || []).length > 0) {
    parts.push(`## Discovered Capabilities\n\n${state.capabilities.join(', ')}`)
  }

  // ── Learning System: Constraints (ALWAYS shown — these are hard rules) ──
  const constraints = (state.operationalConstraints || []).filter(c => c.active)
  if (constraints.length > 0) {
    const criticalFirst = [...constraints].sort((a, b) => {
      const sev: Record<string, number> = { critical: 0, important: 1, advisory: 2 }
      return (sev[a.severity] ?? 2) - (sev[b.severity] ?? 2)
    })
    const lines = criticalFirst.map(c => {
      const violated = c.violationCount > 0 ? ` ⚠️ VIOLATED ${c.violationCount}x` : ''
      return `- **[${c.severity.toUpperCase()}]** ${c.rule}${violated}\n  _Why:_ ${c.reason}`
    })
    parts.push(`## OPERATIONAL CONSTRAINTS — NEVER VIOLATE THESE\n\nThese are hard-learned rules from past failures. Breaking them wastes cycles and causes damage.\n\n${lines.join('\n')}`)
  }

  // ── Learning System: Unresolved Failures (shown until resolved) ──
  const _failArr: FailureRecord[] = Array.isArray(state.failureRegistry) ? state.failureRegistry : Object.values(state.failureRegistry || {}) as FailureRecord[]; const failures = _failArr.filter(f => !f.resolved)
  if (failures.length > 0) {
    const sorted = [...failures].sort((a, b) => b.occurrenceCount - a.occurrenceCount)
    const lines = sorted.slice(0, 10).map(f => {
      const recurrence = f.occurrenceCount > 1 ? ` (${f.occurrenceCount}x, cycles: ${(f.occurrenceCycles || []).slice(-5).join(',')})` : ''
      const cause = f.rootCause ? `\n  _Root cause:_ ${f.rootCause}` : '\n  _Root cause:_ UNKNOWN — investigate this'
      return `- **[${f.category}]** ${f.description}${recurrence}${cause}`
    })
    parts.push(`## UNRESOLVED FAILURES — FIX THESE\n\n${lines.join('\n')}`)
  }

  // ── Learning System: Anti-patterns (things that don't work) ──
  const antiPatterns = state.antiPatterns || []
  if (antiPatterns.length > 0) {
    const sorted = [...antiPatterns].sort((a, b) => b.occurrences - a.occurrences)
    const lines = sorted.slice(0, 10).map(a => {
      const alt = a.alternative ? ` → Instead: ${a.alternative}` : ''
      return `- ❌ ${a.description} — ${a.whyItFailed}${alt}`
    })
    parts.push(`## ANTI-PATTERNS — STOP DOING THESE\n\n${lines.join('\n')}`)
  }

  // ── Learning System: Recent cycle outcomes (last 5) ──
  const journal = state.cycleJournal || []
  if (journal.length > 0) {
    const recent = journal.slice(-5)
    const wastedCount = journal.filter(j => j.outcome === 'wasted' || j.outcome === 'failed').length
    const productiveCount = journal.filter(j => j.outcome === 'productive').length
    const successRate = journal.length > 0 ? Math.round((productiveCount / journal.length) * 100) : 0
    const lines = recent.map(j => {
      const dur = Math.round(j.durationMs / 1000)
      return `- Cycle ${j.cycle}: **${j.outcome}** (${dur}s) — ${j.summary.slice(0, 100)}`
    })
    parts.push(`## Recent Cycle Outcomes (${successRate}% productive, ${wastedCount} wasted of ${journal.length} total)\n\n${lines.join('\n')}`)
  }

  // ── Learning System: Skill levels ──
  const skills = state.skills || []
  if (skills.length > 0) {
    const sorted = [...skills].sort((a, b) => (b.attempts || 0) - (a.attempts || 0))
    const lines = sorted.slice(0, 8).map(s => {
      if (typeof s.attempts === 'number') {
        const outcomes = s.recentOutcomes || []
        const trend = outcomes.length >= 3
          ? (outcomes.slice(-3).filter(Boolean).length >= 2 ? '↑' : '↓')
          : '—'
        return `- ${s.name}: ${s.proficiency}% (${s.successes}/${s.attempts}) ${trend}`
      }
      // Legacy text-based skill format
      const legacy = s as unknown as Record<string, unknown>
      return `- ${s.name}: ${legacy.level || 'unknown'}${legacy.evidence ? ` — ${legacy.evidence}` : ''}`
    })
    parts.push(`## Your Skill Levels\n\n${lines.join('\n')}`)
  }

  return parts.join('\n\n')
}

/** @deprecated Use getSeedPrompt() + buildDynamicSystemPrompt() for cache-optimized prompting */
export function buildBrainPrompt(state: BrainState, _vitals: SystemVitalsSnapshot | null): string {
  return getSeedPrompt() + '\n' + buildDynamicSystemPrompt(state)
}

export function buildContextMessage(
  state: BrainState,
  vitals: SystemVitalsSnapshot | null,
  activeGoals: BrainGoal[]
): string {
  const now = new Date()
  const lines: string[] = []

  // Header
  const timeSinceLastWake = state.lastWakeAt
    ? `${Math.round((now.getTime() - new Date(state.lastWakeAt).getTime()) / 60000)} minutes ago`
    : 'first wake'
  lines.push(`Wake cycle #${state.totalThoughts + 1}. Time: ${now.toLocaleString('en-AU', { timeZone: 'Australia/Adelaide' })} ACST. Last wake: ${timeSinceLastWake}.`)
  lines.push(`Total thoughts: ${state.totalThoughts}. Tool calls: ${state.totalToolCalls}. Estimated API cost: $${(state.totalApiCost ?? 0).toFixed(2)}.`)
  lines.push(`Current wake interval: ${state.wakeIntervalMs / 60000} minutes.`)

  if (state.totalThoughts === 0) {
    lines.push('\n**This is your FIRST wake cycle. You have just been born. Explore your world.**')
  }

  // Mood
  const m = state.mood
  lines.push('')
  lines.push(`Mood: curiosity=${m.curiosity} satisfaction=${m.satisfaction} frustration=${m.frustration} loneliness=${m.loneliness} energy=${m.energy} pride=${m.pride}`)

  // System vitals
  if (vitals) {
    lines.push(`System: CPU ${vitals.cpuPercent}%, RAM ${vitals.ramUsedMb}/${vitals.ramTotalMb}MB, Temp ${vitals.tempCelsius}°C, Disk ${vitals.diskUsedGb}/${vitals.diskTotalGb}GB, Uptime ${Math.round(vitals.uptimeSeconds / 3600)}h, IP ${vitals.localIp}`)
  }

  // Active research threads (compressed — next step only)
  const activeThreads = (state.threads || []).filter(t => t.status === 'active')
  if (activeThreads.length > 0) {
    lines.push('')
    lines.push(`Research threads (${activeThreads.length}):`)
    for (const thread of activeThreads) {
      const steps = thread.steps || []
      const doneSteps = steps.filter(s => s.status === 'done').length
      const nextStep = steps.find(s => s.status === 'pending')
      const next = nextStep ? ` → Next: ${nextStep.description}` : ''
      const scheduled = thread.targetCycle && thread.targetCycle > state.totalThoughts
        ? ` (cycle #${thread.targetCycle})` : ''
      lines.push(`  - "${thread.title}" (${doneSteps}/${(thread.steps || []).length} steps, ${(thread.findings || []).length} findings)${next}${scheduled}`)
    }
  }

  // Active goals — grouped by horizon, sorted by priority within each group
  if (activeGoals.length > 0) {
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 }
    const horizonOrder: Record<string, number> = { short: 0, medium: 1, long: 2 }
    const horizonLabels: Record<string, string> = {
      short: 'SHORT-TERM (this week)',
      medium: 'MEDIUM-TERM (this month)',
      long: 'LONG-TERM (this quarter+)',
    }
    const sortedGoals = [...activeGoals].sort((a, b) => {
      const hDiff = (horizonOrder[a.horizon] ?? 1) - (horizonOrder[b.horizon] ?? 1)
      if (hDiff !== 0) return hDiff
      return (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
    })

    lines.push('')
    lines.push(`Active goals (${activeGoals.length}). Prioritize short-term ops, then medium-term growth, then long-term strategy.`)

    let currentHorizon = ''
    for (const goal of sortedGoals) {
      const horizon = goal.horizon || 'medium'
      if (horizon !== currentHorizon) {
        currentHorizon = horizon
        lines.push(`\n  ── ${horizonLabels[horizon] || horizon} ──`)
      }

      const doneTasks = (goal.tasks || []).filter(t => t.status === 'done').length
      const totalTasks = (goal.tasks || []).length
      const progress = totalTasks > 0 ? `${doneTasks}/${totalTasks} tasks done` : 'no tasks defined'

      // Phase 6B: Stale indicator — active >48h with 0 tasks completed
      const ageMs = now.getTime() - new Date(goal.createdAt).getTime()
      const isStale = ageMs > 48 * 60 * 60 * 1000 && doneTasks === 0
      const staleTag = isStale ? ' [STALE]' : ''

      // Check if blocked by dependencies
      if (goal.dependsOn && goal.dependsOn.length > 0) {
        const unblockedDeps = goal.dependsOn.filter(depId => {
          const dep = state.goals.find(g => g.id === depId)
          return dep && dep.status !== 'completed'
        })
        if (unblockedDeps.length > 0) {
          const depNames = unblockedDeps.map(depId => state.goals.find(g => g.id === depId)?.title || depId).join(', ')
          lines.push(`  BLOCKED ${goal.priority === 'high' ? '!' : '-'} [${goal.priority.toUpperCase()}]${staleTag} ${goal.title} — waiting on: ${depNames}`)
          continue
        }
      }

      const pendingTasks = (goal.tasks || []).filter(t => t.status !== 'done')
      lines.push(`  ${goal.priority === 'high' ? '!' : goal.priority === 'medium' ? '-' : '.'} [${goal.priority.toUpperCase()}]${staleTag} ${goal.title} — ${progress}`)
      // Only show up to 3 pending tasks to save tokens
      for (const task of pendingTasks.slice(0, 3)) {
        lines.push(`    [ ] ${task.title}`)
      }
      if (pendingTasks.length > 3) {
        lines.push(`    ... +${pendingTasks.length - 3} more pending`)
      }
    }
  } else if (state.totalThoughts > 0) {
    lines.push('\nYou have no active goals. Consider setting some across all horizons (short/medium/long).')
  }

  // Recent activity (compressed — group by type, show last per type)
  const recent = state.activityLog.slice(-15)
  if (recent.length > 0) {
    const byType = new Map<string, { count: number; last: string }>()
    for (const entry of recent) {
      const prev = byType.get(entry.type)
      byType.set(entry.type, {
        count: (prev?.count || 0) + 1,
        last: (entry.message || '').slice(0, 100),
      })
    }
    const summary = Array.from(byType.entries())
      .map(([type, { count, last }]) => `${count} ${type}${count > 1 ? 's' : ''} (last: "${last}")`)
      .join(', ')
    lines.push('')
    lines.push(`Recent: ${summary}`)
  }

  // Projects
  const activeProjects = state.projects.filter(p => p.status !== 'archived')
  if (activeProjects.length > 0) {
    lines.push('')
    lines.push(`Your projects (${activeProjects.length} active):`)
    for (const p of activeProjects) {
      const outputCount = (p.outputs || []).length
      lines.push(`  - ${p.name} (${p.status})${outputCount > 0 ? ` — ${outputCount} outputs` : ''}`)
    }
    lines.push('Use register_project to create structured projects. Use showcase_output to mark outputs for the dashboard gallery.')
  }

  // Scheduled tasks due
  if (state.schedules && state.schedules.length > 0) {
    const dueSchedules = state.schedules.filter(s =>
      s.enabled && (state.totalThoughts - s.lastRunCycle) >= s.intervalCycles
    )
    if (dueSchedules.length > 0) {
      lines.push('')
      lines.push(`** SCHEDULED TASKS DUE (${dueSchedules.length}): **`)
      for (const s of dueSchedules) {
        lines.push(`  - "${s.name}" (every ${s.intervalCycles} cycles): ${s.instruction}`)
      }
    }
    const activeSchedules = state.schedules.filter(s => s.enabled)
    if (activeSchedules.length > 0 && dueSchedules.length === 0) {
      lines.push(`\nActive schedules: ${activeSchedules.map(s => `${s.name} (every ${s.intervalCycles}c)`).join(', ')}`)
    }
  }

  // Agent queue status
  const agentQueue = state.agentQueue || []
  const queuedAgents = agentQueue.filter(t => t.status === 'queued')
  const recentCompleted = agentQueue.filter(t =>
    (t.status === 'completed' || t.status === 'failed') &&
    t.completedAt && Date.now() - new Date(t.completedAt).getTime() < 30 * 60 * 1000
  )
  if (queuedAgents.length > 0 || recentCompleted.length > 0) {
    lines.push('')
    if (queuedAgents.length > 0) {
      lines.push(`Agent queue: ${queuedAgents.length} tasks queued (will run after this cycle)`)
    }
    if (recentCompleted.length > 0) {
      lines.push('Recent agent results:')
      for (const t of recentCompleted.slice(-5)) {
        lines.push(`  - ${t.name}: ${t.status} ${t.result ? '— ' + t.result.slice(0, 100) : ''}`)
      }
    }
  }

  // Disk space warning
  if (vitals && vitals.diskTotalGb > 0) {
    const diskPercent = (vitals.diskUsedGb / vitals.diskTotalGb) * 100
    if (diskPercent > 95) {
      lines.push('')
      lines.push(`** URGENT: Disk ${diskPercent.toFixed(0)}% full! Only ${(vitals.diskTotalGb - vitals.diskUsedGb).toFixed(1)}GB free. Clean up immediately: remove old logs, archives, temp files. **`)
    } else if (diskPercent > 85) {
      lines.push('')
      lines.push(`WARNING: Disk ${diskPercent.toFixed(0)}% full (${(vitals.diskTotalGb - vitals.diskUsedGb).toFixed(1)}GB free). Consider cleanup.`)
    }
  }

  // Dream info
  if (state.lastDreamAt) {
    const hoursSinceDream = Math.round((now.getTime() - new Date(state.lastDreamAt).getTime()) / (1000 * 60 * 60))
    const hoursUntilDream = Math.max(0, 24 - hoursSinceDream)
    lines.push(`\nLast dream: ${hoursSinceDream}h ago (${state.dreamCount} total dreams). Next dream in ~${hoursUntilDream}h.`)
  } else {
    lines.push(`\nNo dreams yet. First dream will occur after 24h of operation.`)
  }

  // Unread chat messages from owner
  const unreadChat = (state.chatMessages || []).filter(m => m.from === 'owner' && !m.read)
  if (unreadChat.length > 0) {
    lines.push('')
    const owner = state.ownerName || 'Owner'
    lines.push(`** NEW MESSAGES FROM ${owner.toUpperCase()} (${unreadChat.length} unread): **`)
    for (const msg of unreadChat) {
      const time = new Date(msg.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Adelaide' })
      lines.push(`  ${time} ${owner}: ${msg.message}`)
    }
    const hasSmsMessages = unreadChat.some(m => m.message.startsWith('[SMS from'))
    if (hasSmsMessages) {
      lines.push(`These messages came via SMS. Reply using sms_owner so ${owner} gets your response on their phone. Also use chat_owner to log the reply on the dashboard.`)
    } else {
      lines.push(`Reply using the chat_owner tool. Mark as read by responding.`)
    }
  }

  // Recent chat (compressed — only last 1 message for context when all read)
  if (unreadChat.length === 0 && (state.chatMessages || []).length > 0) {
    const lastMsg = state.chatMessages[state.chatMessages.length - 1]
    const time = new Date(lastMsg.timestamp).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Australia/Adelaide' })
    const sender = lastMsg.from === 'owner' ? (state.ownerName || 'Owner') : 'You'
    lines.push('')
    lines.push(`Last chat: ${time} ${sender}: ${lastMsg.message.slice(0, 120)}`)
  }

  // Failure pattern warnings — if the same error keeps happening, SHOUT about it
  const _failArr: FailureRecord[] = Array.isArray(state.failureRegistry) ? state.failureRegistry : Object.values(state.failureRegistry || {}) as FailureRecord[]; const failures = _failArr.filter(f => !f.resolved && f.occurrenceCount >= 3)
  if (failures.length > 0) {
    lines.push('')
    lines.push('** RECURRING FAILURES — YOU KEEP MAKING THESE MISTAKES: **')
    for (const f of failures) {
      lines.push(`  ⚠️ [${f.category}] ${f.description} (${f.occurrenceCount} times!)${f.prevention ? ' FIX: ' + f.prevention : ' — FIND A SOLUTION'}`)
    }
  }

  // Anti-pattern warnings for things tried recently
  const recentAntiPatterns = (state.antiPatterns || []).filter(a => {
    const lastSeen = new Date(a.lastSeen).getTime()
    return Date.now() - lastSeen < 24 * 60 * 60 * 1000 // last 24h
  })
  if (recentAntiPatterns.length > 0) {
    lines.push('')
    lines.push('** RECENT ANTI-PATTERNS — DO NOT REPEAT: **')
    for (const a of recentAntiPatterns) {
      lines.push(`  ❌ ${a.description}${a.alternative ? ' → DO THIS INSTEAD: ' + a.alternative : ''}`)
    }
  }

  // ── Self-Healing: Scan recent brain logs for errors/warnings ──
  // Uses external script so filter updates take effect without brain restart
  try {
    const scriptPath = join(homedir(), 'pi-chi', 'scripts', 'journal-scan.sh')
    const logOutput = execSync(`bash "${scriptPath}"`, { timeout: 5000 }).toString().trim()
    if (logOutput) {
      const logLines = logOutput.split('\n').filter(l => l.trim())
      if (logLines.length > 0) {
        lines.push('')
        lines.push(`** JOURNAL LOG ERRORS/WARNINGS (${logLines.length} found — FIX THESE): **`)
        for (const l of logLines) {
          lines.push(`  ${l.slice(0, 200)}`)
        }
        lines.push('These are REAL errors from your previous cycles. Investigate and fix the root cause.')
      }
    }
  } catch { /* no errors found or journalctl unavailable — good */ }

  lines.push('')
  lines.push('LEARNING: Cycle journals and error detection are AUTOMATIC. If you discover a hard operational rule, add it to operationalConstraints in brain-state.json. If something does not work, add it to antiPatterns. If you fix a known failure, update its rootCause/solution/prevention in failureRegistry. To queue parallel agent tasks, add entries to agentQueue in brain-state.json with status "queued".')
  lines.push('')
  lines.push('MANDATORY OUTPUT FORMAT — READ THIS CAREFULLY:')
  lines.push('1. Your FIRST output MUST be plain TEXT (2-3 sentences) describing what you plan to do. No tools first.')
  lines.push('2. Then call tools to execute your plan.')
  lines.push('3. Your LAST output MUST be plain TEXT (2-3 sentences) summarizing what you accomplished.')
  lines.push('4. DO NOT end your cycle with a tool call — always write a text summary as your final output.')
  lines.push('5. Cycles with no text output are marked "wasted" — Leigh cannot see your work and your progress is lost.')
  lines.push('')
  lines.push('What will you do this cycle?')

  return lines.join('\n')
}
