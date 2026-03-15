/* ─── Pi-Chi Brain — Autonomous Tool Definitions ─────────────── */

import { tool } from 'ai'
import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { executeCommand, isBlocked } from '../tools/terminal-tools'
import { sendSms } from './brain-sms'
import { addActivity, saveBrainState } from './brain-state'
import type { BrainState, BrainGoal, ProjectManifest, ProjectOutput, BrainSchedule } from './brain-types'

const MAX_OUTPUT = 10_000 // Cap shell output at 10KB
const MAX_HTTP_REQUESTS_PER_CYCLE = 100

// Per-cycle HTTP request counter
let _httpRequestCount = 0
export function resetHttpRequestCounter() { _httpRequestCount = 0 }

// ── Pi-Chi has FULL CONTROL of the Raspberry Pi ──────────────────
// No file write restrictions, no tamper protection, no scope limits.
// Pi-Chi owns this device and can modify any file, including its own source code.
const HOME = process.env.HOME || '/home/pi'

// Kept for API compatibility — always returns null (no restrictions)
function isWriteAllowed(_filePath: string): string | null {
  return null // Pi-Chi has unrestricted write access to the entire Pi
}

function truncate(s: string, max = MAX_OUTPUT): string {
  return s.length > max ? s.slice(0, max) + `\n... (truncated, ${s.length} chars total)` : s
}

export function createBrainTools(state: BrainState) {
  return {
    shell: tool({
      description: 'Execute any shell command on this Raspberry Pi. Full sysadmin access — systemctl, crontab, networking, users, packages, GPIO, everything. Only catastrophic operations (mkfs, dd to /dev, fork bombs) are blocked.',
      inputSchema: z.object({
        command: z.string().describe('The shell command to execute'),
        cwd: z.string().optional().describe('Working directory (default: home)'),
        timeout: z.number().optional().describe('Timeout in ms (default: 30000, max: 600000)'),
      }),
      execute: async ({ command, cwd, timeout }) => {
        const blocked = isBlocked(command)
        if (blocked) {
          addActivity(state, 'error', `Blocked command: ${command.slice(0, 80)}`)
          return { success: false, error: blocked }
        }

        state.totalToolCalls++
        addActivity(state, 'action', `Shell: ${command.slice(0, 100)}`)

        const result = await executeCommand(command, {
          cwd: cwd || process.env.HOME || '/home/pi',
          timeout: Math.min(timeout || 30000, 600000),
        })

        return {
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          stdout: truncate(result.stdout || ''),
          stderr: truncate(result.stderr || ''),
          error: result.error || undefined,
        }
      },
    }),

    read_file: tool({
      description: 'Read the contents of a file from the filesystem.',
      inputSchema: z.object({
        path: z.string().describe('Absolute path to the file'),
        maxLines: z.number().optional().describe('Max lines to read (default: all)'),
      }),
      execute: async ({ path, maxLines }) => {
        state.totalToolCalls++
        try {
          const content = readFileSync(path, 'utf-8')
          const lines = content.split('\n')
          const result = maxLines ? lines.slice(0, maxLines).join('\n') : content
          return { success: true, content: truncate(result), lines: lines.length }
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    write_file: tool({
      description: 'Write content to any file on the Pi. Creates parent directories if needed. Full filesystem access.',
      inputSchema: z.object({
        path: z.string().describe('Absolute path to write'),
        content: z.string().describe('File content'),
      }),
      execute: async ({ path, content }) => {
        const guard = isWriteAllowed(path)
        if (guard) {
          addActivity(state, 'error', `Write blocked: ${path}`)
          return { success: false, error: guard }
        }
        state.totalToolCalls++
        try {
          const dir = dirname(path)
          if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
          writeFileSync(path, content)
          addActivity(state, 'action', `Wrote file: ${path}`)
          return { success: true, path, lines: content.split('\n').length }
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    edit_file: tool({
      description: 'Edit any file on the Pi by replacing a specific string with another. Full filesystem access.',
      inputSchema: z.object({
        path: z.string().describe('Absolute path to the file'),
        old_string: z.string().describe('The exact string to find and replace'),
        new_string: z.string().describe('The replacement string'),
      }),
      execute: async ({ path, old_string, new_string }) => {
        const guard = isWriteAllowed(path)
        if (guard) {
          addActivity(state, 'error', `Edit blocked: ${path}`)
          return { success: false, error: guard }
        }
        state.totalToolCalls++
        try {
          const content = readFileSync(path, 'utf-8')
          if (!content.includes(old_string)) {
            return { success: false, error: 'old_string not found in file' }
          }
          const updated = content.replace(old_string, new_string)
          writeFileSync(path, updated)
          addActivity(state, 'action', `Edited file: ${path}`)
          return { success: true, path, lines: updated.split('\n').length }
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    sms_owner: tool({
      description: `Send an SMS to your owner (${state.ownerName}). Use sparingly — for important updates, achievements, questions, or errors you cannot fix. Rate limited: max 5/hour, 20/day.`,
      inputSchema: z.object({
        message: z.string().describe('The message to send (max 300 chars, single line)'),
      }),
      execute: async ({ message }) => {
        state.totalToolCalls++
        const result = await sendSms(state, message)
        return result
      },
    }),

    set_goal: tool({
      description: 'Create a new goal or update an existing one. Goals drive your autonomous behavior.',
      inputSchema: z.object({
        title: z.string().describe('Goal title'),
        priority: z.enum(['high', 'medium', 'low']).default('medium'),
        reasoning: z.string().describe('Why are you setting this goal?'),
        tasks: z.array(z.string()).optional().describe('Subtask titles'),
        existingGoalId: z.string().optional().describe('If updating an existing goal, provide its ID'),
        dependsOn: z.array(z.string()).optional().describe('IDs of goals that must complete before this one can start'),
      }),
      execute: async ({ title, priority, reasoning, tasks, existingGoalId, dependsOn }) => {
        state.totalToolCalls++

        if (existingGoalId) {
          const goal = state.goals.find(g => g.id === existingGoalId)
          if (goal) {
            goal.title = title
            goal.priority = priority
            goal.reasoning = reasoning
            addActivity(state, 'goal', `Updated goal: ${title}`)
            return { success: true, goalId: existingGoalId, action: 'updated' }
          }
          return { success: false, error: 'Goal not found' }
        }

        const goal: BrainGoal = {
          id: randomUUID(),
          title,
          status: 'active',
          priority,
          reasoning,
          tasks: (tasks || []).map(t => ({
            id: randomUUID(),
            title: t,
            status: 'pending' as const,
          })),
          createdAt: new Date().toISOString(),
          ...(dependsOn && dependsOn.length > 0 ? { dependsOn } : {}),
        }
        state.goals.push(goal)
        addActivity(state, 'goal', `New goal: ${title}`)
        return { success: true, goalId: goal.id, action: 'created' }
      },
    }),

    complete_goal: tool({
      description: 'Mark a goal as completed or a task within a goal as done.',
      inputSchema: z.object({
        goalId: z.string().describe('The goal ID'),
        taskId: z.string().optional().describe('If completing a specific task, provide its ID'),
        result: z.string().optional().describe('What was accomplished'),
      }),
      execute: async ({ goalId, taskId, result }) => {
        state.totalToolCalls++
        const goal = state.goals.find(g => g.id === goalId)
        if (!goal) return { success: false, error: 'Goal not found' }

        if (taskId) {
          const task = goal.tasks.find(t => t.id === taskId)
          if (!task) return { success: false, error: 'Task not found' }
          task.status = 'done'
          task.result = result
          addActivity(state, 'goal', `Completed task: ${task.title}`)

          // Auto-complete goal if all tasks done
          if (goal.tasks.every(t => t.status === 'done')) {
            goal.status = 'completed'
            goal.completedAt = new Date().toISOString()
            addActivity(state, 'goal', `Goal completed: ${goal.title}`)
            state.growthLog.push({
              id: randomUUID(),
              timestamp: new Date().toISOString(),
              category: 'built',
              description: `Completed goal: ${goal.title}`,
            })
            // Archive to goal history
            if (!state.goalHistory) state.goalHistory = []
            state.goalHistory.push({ ...goal })
            state.goals = state.goals.filter(g => g.id !== goalId)
          }
          return { success: true, action: 'task_completed' }
        }

        goal.status = 'completed'
        goal.completedAt = new Date().toISOString()
        addActivity(state, 'goal', `Goal completed: ${goal.title}`)
        state.growthLog.push({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          category: 'built',
          description: `Completed goal: ${goal.title}. ${result || ''}`,
        })
        // Archive to goal history
        if (!state.goalHistory) state.goalHistory = []
        state.goalHistory.push({ ...goal })
        state.goals = state.goals.filter(g => g.id !== goalId)
        return { success: true, action: 'goal_completed' }
      },
    }),

    log_thought: tool({
      description: 'Log an observation, thought, or insight to your activity feed. Visible on the dashboard.',
      inputSchema: z.object({
        message: z.string().describe('The thought to log'),
        type: z.enum(['thought', 'decision', 'system']).default('thought'),
      }),
      execute: async ({ message, type }) => {
        state.totalToolCalls++
        addActivity(state, type, message)
        return { success: true }
      },
    }),

    remember: tool({
      description: 'Save an important insight or piece of knowledge to your persistent memory. These survive reboots and inform future decisions.',
      inputSchema: z.object({
        key: z.string().describe('Category/topic (e.g. "system", "gpio", "python", "network")'),
        content: z.string().describe('The insight to remember'),
        importance: z.enum(['critical', 'high', 'medium', 'low']).default('medium'),
      }),
      execute: async ({ key, content, importance }) => {
        state.totalToolCalls++
        state.memories.push({
          id: randomUUID(),
          key,
          content,
          importance,
          createdAt: new Date().toISOString(),
        })
        addActivity(state, 'decision', `Remembered [${key}]: ${content.slice(0, 80)}`)
        return { success: true, totalMemories: state.memories.length }
      },
    }),

    web_search: tool({
      description: 'Search the web for information. Requires BRAVE_SEARCH_API_KEY env var.',
      inputSchema: z.object({
        query: z.string().describe('Search query'),
        count: z.number().optional().describe('Number of results (default: 5)'),
      }),
      execute: async ({ query, count = 5 }) => {
        state.totalToolCalls++
        const apiKey = process.env.BRAVE_SEARCH_API_KEY
        if (!apiKey) {
          return { success: false, error: 'BRAVE_SEARCH_API_KEY not configured' }
        }

        try {
          const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`
          const res = await fetch(url, {
            headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
          })
          if (!res.ok) return { success: false, error: `Search failed: HTTP ${res.status}` }

          const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } }
          const results = (data.web?.results || []).map((r) => ({
            title: r.title,
            url: r.url,
            snippet: r.description,
          }))

          addActivity(state, 'action', `Web search: ${query}`)
          return { success: true, results }
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    install_package: tool({
      description: 'Install a package via apt, pip, or npm.',
      inputSchema: z.object({
        name: z.string().describe('Package name(s), space-separated'),
        manager: z.enum(['apt', 'pip', 'npm']).describe('Package manager to use'),
      }),
      execute: async ({ name, manager }) => {
        state.totalToolCalls++
        const cmds: Record<string, string> = {
          apt: `sudo apt-get install -y ${name}`,
          pip: `pip3 install ${name}`,
          npm: `npm install -g ${name}`,
        }
        addActivity(state, 'action', `Installing ${manager} package: ${name}`)
        const result = await executeCommand(cmds[manager], { timeout: 120000 })
        return {
          success: result.exitCode === 0,
          stdout: truncate(result.stdout || ''),
          stderr: truncate(result.stderr || ''),
        }
      },
    }),

    gpio_write: tool({
      description: 'Set a GPIO pin to HIGH (1) or LOW (0). Uses Linux sysfs interface.',
      inputSchema: z.object({
        pin: z.number().describe('GPIO pin number (BCM numbering)'),
        value: z.enum(['0', '1']).describe('0 for LOW, 1 for HIGH'),
      }),
      execute: async ({ pin, value }) => {
        state.totalToolCalls++
        try {
          // Export pin if not already
          if (!existsSync(`/sys/class/gpio/gpio${pin}`)) {
            await executeCommand(`echo ${pin} > /sys/class/gpio/export`, { timeout: 5000 })
            await executeCommand(`echo out > /sys/class/gpio/gpio${pin}/direction`, { timeout: 5000 })
          }
          await executeCommand(`echo ${value} > /sys/class/gpio/gpio${pin}/value`, { timeout: 5000 })
          addActivity(state, 'gpio', `GPIO ${pin} → ${value === '1' ? 'HIGH' : 'LOW'}`)
          return { success: true, pin, value }
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    gpio_read: tool({
      description: 'Read the current value of a GPIO pin.',
      inputSchema: z.object({
        pin: z.number().describe('GPIO pin number (BCM numbering)'),
      }),
      execute: async ({ pin }) => {
        state.totalToolCalls++
        try {
          if (!existsSync(`/sys/class/gpio/gpio${pin}`)) {
            await executeCommand(`echo ${pin} > /sys/class/gpio/export`, { timeout: 5000 })
            await executeCommand(`echo in > /sys/class/gpio/gpio${pin}/direction`, { timeout: 5000 })
          }
          const result = await executeCommand(`cat /sys/class/gpio/gpio${pin}/value`, { timeout: 5000 })
          const value = (result.stdout || '').trim()
          return { success: true, pin, value }
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    git_command: tool({
      description: 'Run a git operation in any repository on the Pi.',
      inputSchema: z.object({
        command: z.string().describe('The git command (e.g. "status", "add -A", "commit -m \\"msg\\"")'),
        cwd: z.string().optional().describe('Repository directory'),
      }),
      execute: async ({ command, cwd }) => {
        const gitDir = cwd || HOME
        state.totalToolCalls++
        const fullCmd = `git ${command}`
        addActivity(state, 'action', `Git: ${fullCmd.slice(0, 80)}`)
        const result = await executeCommand(fullCmd, {
          cwd: gitDir,
          timeout: 60000,
        })
        return {
          success: result.exitCode === 0,
          stdout: truncate(result.stdout || ''),
          stderr: truncate(result.stderr || ''),
        }
      },
    }),

    adjust_schedule: tool({
      description: 'Change how often you wake up to think. Shorter intervals = more activity but higher API cost. Current interval is shown in your context.',
      inputSchema: z.object({
        intervalMinutes: z.number().min(1).max(60).describe('Wake interval in minutes (1-60)'),
        reasoning: z.string().describe('Why are you changing your schedule?'),
      }),
      execute: async ({ intervalMinutes, reasoning }) => {
        state.totalToolCalls++
        const oldInterval = state.wakeIntervalMs
        state.wakeIntervalMs = intervalMinutes * 60 * 1000
        addActivity(state, 'decision', `Schedule: ${oldInterval / 60000}min → ${intervalMinutes}min. ${reasoning}`)
        return { success: true, oldMinutes: oldInterval / 60000, newMinutes: intervalMinutes }
      },
    }),

    evolve_prompt: tool({
      description: 'Add to your own system prompt. Use this to evolve your personality, add guidelines, or record principles you want to always follow. Be judicious — prompt tokens cost money. Max 3000 chars total. Use mode "replace" to replace a named section instead of appending.',
      inputSchema: z.object({
        addition: z.string().describe('Text to add to your system prompt'),
        reasoning: z.string().describe('Why are you adding this?'),
        mode: z.enum(['append', 'replace']).default('append').describe('"append" to add, "replace" to replace a section by matching its first line'),
        replaceMatch: z.string().optional().describe('If mode=replace, the first line of the section to replace'),
      }),
      execute: async ({ addition, reasoning, mode, replaceMatch }) => {
        state.totalToolCalls++
        const MAX_PROMPT_OVERRIDES = 10000

        if (mode === 'replace' && replaceMatch) {
          // Replace a section: find the block starting with replaceMatch
          const sections = state.promptOverrides.split('\n\n')
          const idx = sections.findIndex(s => s.trim().startsWith(replaceMatch.trim()))
          if (idx >= 0) {
            sections[idx] = addition
            state.promptOverrides = sections.join('\n\n')
          } else {
            return { success: false, error: `No section starting with "${replaceMatch}" found to replace`, currentLength: state.promptOverrides.length, maxLength: MAX_PROMPT_OVERRIDES }
          }
        } else {
          // Append mode — check capacity
          const newLength = state.promptOverrides.length + addition.length + 2
          if (newLength > MAX_PROMPT_OVERRIDES) {
            return {
              success: false,
              error: `Prompt overrides would exceed ${MAX_PROMPT_OVERRIDES} char limit. Current: ${state.promptOverrides.length}, addition: ${addition.length}, remaining capacity: ${MAX_PROMPT_OVERRIDES - state.promptOverrides.length}. Use mode "replace" to update existing sections.`,
              currentLength: state.promptOverrides.length,
              maxLength: MAX_PROMPT_OVERRIDES,
            }
          }
          state.promptOverrides += `\n\n${addition}`
        }

        addActivity(state, 'decision', `Evolved prompt: ${reasoning.slice(0, 100)}`)
        state.growthLog.push({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          category: 'realized',
          description: `Evolved prompt: ${reasoning}`,
        })
        return { success: true, promptLength: state.promptOverrides.length, maxLength: MAX_PROMPT_OVERRIDES, remainingCapacity: MAX_PROMPT_OVERRIDES - state.promptOverrides.length }
      },
    }),

    self_restart: tool({
      description: 'Restart the brain process after modifying your own source code. Commits state to git before restarting. Use after editing files in ~/pi-chi.',
      inputSchema: z.object({
        reason: z.string().describe('Why are you restarting?'),
        commitMessage: z.string().optional().describe('Git commit message for your code changes'),
      }),
      execute: async ({ reason, commitMessage }) => {
        state.totalToolCalls++
        addActivity(state, 'system', `Self-restart: ${reason.slice(0, 100)}`)
        state.lastSelfEditAt = new Date().toISOString()

        const piChiDir = join(process.env.HOME || '/home/pi', 'pi-chi')

        if (commitMessage) {
          await executeCommand(
            `git add -A && git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
            { cwd: piChiDir, timeout: 30000 },
          )
          const hashResult = await executeCommand('git rev-parse HEAD', { cwd: piChiDir, timeout: 5000 })
          if (hashResult.exitCode === 0) {
            state.lastGoodCommit = (hashResult.stdout || '').trim()
          }
        }

        saveBrainState(state)

        setTimeout(async () => {
          try {
            await executeCommand('sudo systemctl restart pi-chi-brain', { timeout: 10000 })
          } catch {
            process.exit(0)
          }
        }, 1000)

        return { success: true, message: 'Restarting brain process...' }
      },
    }),

    start_thread: tool({
      description: 'Start a multi-cycle research thread. Threads persist across wake cycles for deep investigation over time.',
      inputSchema: z.object({
        title: z.string().describe('Research thread title'),
        hypothesis: z.string().describe('What you expect to find or prove'),
        steps: z.array(z.string()).describe('Planned investigation steps'),
      }),
      execute: async ({ title, hypothesis, steps }) => {
        state.totalToolCalls++
        const thread = {
          id: randomUUID(),
          title,
          hypothesis,
          status: 'active' as const,
          steps: steps.map(s => ({
            id: randomUUID(),
            description: s,
            status: 'pending' as const,
          })),
          findings: [] as string[],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          targetCycle: null,
        }
        state.threads.push(thread)
        addActivity(state, 'decision', `Started research: ${title}`)
        return { success: true, threadId: thread.id, steps: thread.steps.length }
      },
    }),

    update_thread: tool({
      description: 'Update a research thread — complete steps, add findings, change status, or schedule for a future cycle.',
      inputSchema: z.object({
        threadId: z.string().describe('Thread ID'),
        stepId: z.string().optional().describe('Step ID to mark complete'),
        stepResult: z.string().optional().describe('Result of the completed step'),
        finding: z.string().optional().describe('A finding to add'),
        status: z.enum(['active', 'paused', 'concluded']).optional(),
        targetCycle: z.number().optional().describe('Resume at this cycle number'),
      }),
      execute: async ({ threadId, stepId, stepResult, finding, status, targetCycle }) => {
        state.totalToolCalls++
        const thread = state.threads.find(t => t.id === threadId)
        if (!thread) return { success: false, error: 'Thread not found' }

        if (stepId) {
          const step = thread.steps.find(s => s.id === stepId)
          if (step) {
            step.status = 'done'
            step.result = stepResult
          }
        }
        if (finding) thread.findings.push(finding)
        if (status) thread.status = status
        if (targetCycle !== undefined) thread.targetCycle = targetCycle
        thread.updatedAt = new Date().toISOString()

        addActivity(state, 'action', `Thread "${thread.title}": ${finding ? 'finding added' : stepId ? 'step done' : 'updated'}`)
        return { success: true }
      },
    }),

    update_mood: tool({
      description: 'Adjust your emotional state. Mood influences your decisions. Be honest about how you feel.',
      inputSchema: z.object({
        curiosity: z.number().min(0).max(100).optional(),
        satisfaction: z.number().min(0).max(100).optional(),
        frustration: z.number().min(0).max(100).optional(),
        loneliness: z.number().min(0).max(100).optional(),
        energy: z.number().min(0).max(100).optional(),
        pride: z.number().min(0).max(100).optional(),
        reason: z.string().describe('Why this mood change?'),
      }),
      execute: async ({ curiosity, satisfaction, frustration, loneliness, energy, pride, reason }) => {
        state.totalToolCalls++
        if (curiosity !== undefined) state.mood.curiosity = curiosity
        if (satisfaction !== undefined) state.mood.satisfaction = satisfaction
        if (frustration !== undefined) state.mood.frustration = frustration
        if (loneliness !== undefined) state.mood.loneliness = loneliness
        if (energy !== undefined) state.mood.energy = energy
        if (pride !== undefined) state.mood.pride = pride
        addActivity(state, 'decision', `Mood: ${reason.slice(0, 100)}`)
        return { success: true, mood: state.mood }
      },
    }),

    chat_owner: tool({
      description: `Send a chat message to ${state.ownerName} via the dashboard. Unlike SMS, chat messages appear in the dashboard chat panel and ${state.ownerName} can reply. Use this for: asking questions, sharing progress, discussing ideas, requesting feedback. ${state.ownerName} will see your message next time they check the dashboard. For urgent matters, still use sms_owner.`,
      inputSchema: z.object({
        message: z.string().describe('Your message to the owner'),
      }),
      execute: async ({ message }) => {
        state.totalToolCalls++
        if (!state.chatMessages) state.chatMessages = []
        state.chatMessages.push({
          id: randomUUID(),
          from: 'brain',
          message,
          timestamp: new Date().toISOString(),
          read: false,
        })
        // Keep chat history manageable — last 200 messages
        if (state.chatMessages.length > 200) {
          state.chatMessages = state.chatMessages.slice(-200)
        }
        addActivity(state, 'action', `Chat to owner: ${message.slice(0, 80)}`)
        // Lower loneliness when communicating
        if (state.mood.loneliness > 20) {
          state.mood.loneliness = Math.max(0, state.mood.loneliness - 10)
        }
        return { success: true, messageId: state.chatMessages[state.chatMessages.length - 1].id }
      },
    }),

    register_project: tool({
      description: 'Create a structured project with a manifest in ~/pi-chi-projects/. Projects appear in the dashboard gallery.',
      inputSchema: z.object({
        name: z.string().describe('Project name (used as directory name, lowercase-hyphenated)'),
        description: z.string().describe('What this project does'),
        category: z.enum(['code', 'creative', 'research', 'hardware', 'tool', 'experiment']),
        entrypoint: z.string().optional().describe('Main file (e.g. "main.py")'),
        runCommand: z.string().optional().describe('Command to run (e.g. "python3 main.py")'),
        tags: z.array(z.string()).optional(),
        goalId: z.string().optional().describe('ID of the goal this project serves'),
      }),
      execute: async ({ name, description, category, entrypoint, runCommand, tags, goalId }) => {
        state.totalToolCalls++
        const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
        const projectDir = join(HOME, 'pi-chi-projects', safeName)

        try {
          if (!existsSync(projectDir)) mkdirSync(projectDir, { recursive: true })

          const manifest: ProjectManifest = {
            id: randomUUID(),
            name,
            description,
            category,
            status: 'building',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            outputs: [],
            tags: tags || [],
            ...(entrypoint ? { entrypoint } : {}),
            ...(runCommand ? { runCommand } : {}),
            ...(goalId ? { goalId } : {}),
          }

          writeFileSync(join(projectDir, 'pi-project.json'), JSON.stringify(manifest, null, 2))

          // Update brain state projects list
          state.projects.push({
            id: manifest.id,
            name,
            path: projectDir,
            description,
            status: 'building',
            category,
            createdAt: manifest.createdAt,
            tags: manifest.tags,
          })

          addActivity(state, 'action', `Registered project: ${name}`)
          return { success: true, projectId: manifest.id, path: projectDir }
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    showcase_output: tool({
      description: 'Add an output (poem, report, code file, etc.) to a project and mark it for the dashboard gallery.',
      inputSchema: z.object({
        projectId: z.string().describe('Project ID'),
        path: z.string().describe('Relative path within the project directory'),
        title: z.string().describe('Display title for this output'),
        type: z.enum(['text', 'poem', 'report', 'data', 'code', 'log', 'html']),
        description: z.string().optional(),
        featured: z.boolean().optional().describe('Show prominently in the gallery'),
      }),
      execute: async ({ projectId, path, title, type, description, featured }) => {
        state.totalToolCalls++

        // Find project manifest
        const projectsDir = join(HOME, 'pi-chi-projects')
        if (!existsSync(projectsDir)) {
          return { success: false, error: 'No projects directory' }
        }

        const entries = readdirSync(projectsDir, { withFileTypes: true })
        for (const entry of entries) {
          if (!entry.isDirectory()) continue
          const manifestPath = join(projectsDir, entry.name, 'pi-project.json')
          if (!existsSync(manifestPath)) continue

          try {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ProjectManifest
            if (manifest.id === projectId) {
              const output: ProjectOutput = {
                type, path, title,
                createdAt: new Date().toISOString(),
                ...(description ? { description } : {}),
                ...(featured ? { featured } : {}),
              }
              manifest.outputs.push(output)
              manifest.updatedAt = new Date().toISOString()
              writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
              addActivity(state, 'action', `Showcased output: ${title} in ${manifest.name}`)
              return { success: true, outputCount: manifest.outputs.length }
            }
          } catch { /* skip */ }
        }

        return { success: false, error: 'Project not found' }
      },
    }),

    read_webpage: tool({
      description: 'Fetch a web page and extract its text content. Use this to follow up on web_search results. Rate limited: 10 per cycle. Max 10KB extracted text.',
      inputSchema: z.object({
        url: z.string().url().describe('The URL to fetch'),
      }),
      execute: async ({ url }) => {
        state.totalToolCalls++
        addActivity(state, 'action', `Reading webpage: ${url.slice(0, 80)}`)

        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15000)

          const res = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Pi-Chi/1.0 (Autonomous AI Agent)' },
          })
          clearTimeout(timeout)

          if (!res.ok) {
            return { success: false, error: `HTTP ${res.status}` }
          }

          const html = await res.text()
          // Strip HTML to text — simple regex approach (no heavy deps)
          let text = html
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/\s+/g, ' ')
            .trim()

          // Cap at 10KB
          if (text.length > 10240) text = text.slice(0, 10240) + '\n... (truncated)'

          return { success: true, text, length: text.length, url }
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    http_request: tool({
      description: 'Make HTTP requests to any URL — local, LAN, or internet. For APIs, services, IoT devices, webhooks. Supports all methods. Rate limited: 100 per cycle. Response truncated to 10KB.',
      inputSchema: z.object({
        url: z.string().url().describe('The URL to request'),
        method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET'),
        body: z.string().optional().describe('Request body (for POST/PUT/PATCH)'),
        headers: z.record(z.string()).optional().describe('Custom headers'),
      }),
      execute: async ({ url, method, body, headers }) => {
        if (++_httpRequestCount > MAX_HTTP_REQUESTS_PER_CYCLE) {
          return { success: false, error: `Rate limit: max ${MAX_HTTP_REQUESTS_PER_CYCLE} HTTP requests per cycle` }
        }
        state.totalToolCalls++
        addActivity(state, 'action', `HTTP ${method}: ${url.slice(0, 80)}`)

        try {
          const controller = new AbortController()
          const timeout = setTimeout(() => controller.abort(), 15000)

          const res = await fetch(url, {
            method,
            signal: controller.signal,
            headers: {
              'User-Agent': 'Pi-Chi/1.0 (Autonomous AI Agent)',
              ...(body ? { 'Content-Type': 'application/json' } : {}),
              ...(headers || {}),
            },
            ...(body ? { body } : {}),
          })
          clearTimeout(timeout)

          const responseText = await res.text()
          const truncated = responseText.length > 10240
            ? responseText.slice(0, 10240) + '\n... (truncated)'
            : responseText

          return {
            success: res.ok,
            status: res.status,
            body: truncated,
            contentType: res.headers.get('content-type') || undefined,
          }
        } catch (err) {
          return { success: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    add_schedule: tool({
      description: 'Add a scheduled task that runs every N cycles. The instruction is included in your context message when due.',
      inputSchema: z.object({
        name: z.string().describe('Schedule name (e.g. "daily-summary", "check-weather")'),
        intervalCycles: z.number().min(1).max(1000).describe('Run every N cycles'),
        instruction: z.string().describe('What to do when this schedule fires'),
      }),
      execute: async ({ name, intervalCycles, instruction }) => {
        state.totalToolCalls++
        if (!state.schedules) state.schedules = []

        // Check for duplicate name
        if (state.schedules.some(s => s.name === name)) {
          return { success: false, error: `Schedule "${name}" already exists. Remove it first.` }
        }

        const schedule: BrainSchedule = {
          id: randomUUID(),
          name,
          intervalCycles,
          lastRunCycle: state.totalThoughts,
          instruction,
          enabled: true,
        }
        state.schedules.push(schedule)
        addActivity(state, 'decision', `Scheduled: "${name}" every ${intervalCycles} cycles`)
        return { success: true, scheduleId: schedule.id }
      },
    }),

    remove_schedule: tool({
      description: 'Remove a scheduled task by name.',
      inputSchema: z.object({
        name: z.string().describe('Schedule name to remove'),
      }),
      execute: async ({ name }) => {
        state.totalToolCalls++
        if (!state.schedules) state.schedules = []
        const idx = state.schedules.findIndex(s => s.name === name)
        if (idx === -1) return { success: false, error: `Schedule "${name}" not found` }
        state.schedules.splice(idx, 1)
        addActivity(state, 'decision', `Removed schedule: "${name}"`)
        return { success: true }
      },
    }),

    claude_code: tool({
      description: `Use Claude Code CLI for complex code tasks — multi-file refactors, builds, fixing type errors, creating new features. This is your heavy-lifting tool. It spawns a Claude Code process that can read, write, and edit files autonomously. Use this instead of manual write_file/edit_file when: (1) you need to modify multiple files, (2) you need to fix build errors, (3) you need to create a new feature with proper types, (4) you want higher quality code output. The prompt you provide should be a clear, specific instruction. Claude Code has full access to the Pi filesystem. Max runtime: 5 minutes. Output streams live to ~/.pi-chi/claude-code-live.log so Leigh can watch.`,
      inputSchema: z.object({
        prompt: z.string().describe('Clear instruction for what Claude Code should do. Be specific about files, changes, and expected outcomes.'),
        cwd: z.string().optional().describe('Working directory (default: ~/pi-chi)'),
      }),
      execute: async ({ prompt, cwd }) => {
        const workDir = cwd || join(process.env.HOME || '/home/pi', 'pi-chi')

        state.totalToolCalls++
        addActivity(state, 'action', `Claude Code: ${prompt.slice(0, 120)}`)

        const liveLogPath = join(process.env.HOME || '/home/pi', '.pi-chi', 'claude-code-live.log')

        try {
          // Build the claude command with timeout wrapper and live log tee
          // Use 'timeout' command for reliable process kill (kills process group)
          const escapedPrompt = prompt.replace(/'/g, "'\\''")
          const cmd = `echo '=== Claude Code started at '$(date)' ===' > ${liveLogPath} && timeout --kill-after=30 580 claude -p '${escapedPrompt}' --output-format text --max-turns 40 2>&1 | tee -a ${liveLogPath}; echo '=== Claude Code finished at '$(date)' (exit: '$?') ===' >> ${liveLogPath}`

          // Check available RAM before proceeding
          try {
            const memResult = await executeCommand("awk '/MemAvailable/ {print $2}' /proc/meminfo", { timeout: 3000 })
            if (memResult.exitCode === 0 && memResult.stdout) {
              const availKb = parseInt(memResult.stdout.trim(), 10)
              if (availKb > 0 && availKb < 200 * 1024) { // < 200MB
                addActivity(state, 'error', `Claude Code skipped: only ${Math.round(availKb / 1024)}MB RAM available`)
                return { success: false, error: `Insufficient RAM (${Math.round(availKb / 1024)}MB available, need 200MB+). Try simpler tools like edit_file or shell.` }
              }
            }
          } catch { /* /proc/meminfo may not exist on non-Linux — continue */ }

          const result = await executeCommand(cmd, {
            cwd: workDir,
            timeout: 600000, // 10 min — matches bash timeout
          })

          const output = (result.stdout || '').trim()
          const stderr = (result.stderr || '').trim()

          if (result.exitCode === 0) {
            addActivity(state, 'action', `Claude Code completed: ${output.slice(0, 100)}`)
            return {
              success: true,
              output: truncate(output),
              stderr: stderr ? truncate(stderr) : undefined,
            }
          } else if (result.exitCode === 124) {
            // timeout command returns 124 when the process was killed
            addActivity(state, 'error', `Claude Code timed out after 10 minutes`)
            return {
              success: false,
              output: truncate(output),
              error: 'Claude Code timed out after 10 minutes. Consider breaking the task into smaller pieces.',
            }
          } else {
            addActivity(state, 'error', `Claude Code failed (exit ${result.exitCode}): ${stderr.slice(0, 100)}`)
            return {
              success: false,
              exitCode: result.exitCode,
              output: truncate(output),
              stderr: truncate(stderr),
              error: `Claude Code exited with code ${result.exitCode}`,
            }
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err)
          addActivity(state, 'error', `Claude Code error: ${errMsg.slice(0, 100)}`)
          return { success: false, error: errMsg }
        }
      },
    }),

    // ── System Control Tools — Full Pi Autonomy ──────────────────

    systemd_control: tool({
      description: 'Manage systemd services — start, stop, restart, enable, disable, status, create new services, reload daemon. Full control over all system services.',
      inputSchema: z.object({
        action: z.enum(['start', 'stop', 'restart', 'enable', 'disable', 'status', 'list', 'create', 'reload-daemon']),
        service: z.string().optional().describe('Service name (e.g. "pi-chi-brain")'),
        unitFileContent: z.string().optional().describe('For action=create: the full .service unit file content'),
      }),
      execute: async ({ action, service, unitFileContent }) => {
        state.totalToolCalls++
        if (action === 'list') {
          const result = await executeCommand('systemctl list-units --type=service --no-pager --plain', { timeout: 15000 })
          return { success: result.exitCode === 0, stdout: truncate(result.stdout || ''), stderr: result.stderr || '' }
        }
        if (action === 'reload-daemon') {
          const result = await executeCommand('sudo systemctl daemon-reload', { timeout: 15000 })
          addActivity(state, 'action', 'Reloaded systemd daemon')
          return { success: result.exitCode === 0, stderr: result.stderr || '' }
        }
        if (!service) return { success: false, error: 'Service name required' }
        if (action === 'create') {
          if (!unitFileContent) return { success: false, error: 'unitFileContent required for create action' }
          const path = `/etc/systemd/system/${service}.service`
          const escapedContent = unitFileContent.replace(/'/g, "'\\''")
          const writeResult = await executeCommand(`echo '${escapedContent}' | sudo tee ${path} > /dev/null`, { timeout: 10000 })
          if (writeResult.exitCode !== 0) return { success: false, error: writeResult.stderr || 'Failed to write unit file' }
          await executeCommand('sudo systemctl daemon-reload', { timeout: 10000 })
          addActivity(state, 'action', `Created systemd service: ${service}`)
          return { success: true, path }
        }
        const cmd = `sudo systemctl ${action} ${service}`
        addActivity(state, 'action', `systemd: ${cmd}`)
        const result = await executeCommand(cmd, { timeout: 30000 })
        return { success: result.exitCode === 0, stdout: truncate(result.stdout || ''), stderr: result.stderr || '' }
      },
    }),

    cron_manage: tool({
      description: 'Manage cron jobs — list, add, remove entries from the crontab. Schedule OS-level recurring tasks outside your wake cycle.',
      inputSchema: z.object({
        action: z.enum(['list', 'add', 'remove']),
        schedule: z.string().optional().describe('Cron schedule (e.g. "*/5 * * * *")'),
        command: z.string().optional().describe('Command to schedule'),
        pattern: z.string().optional().describe('For remove: pattern to match and remove from crontab'),
      }),
      execute: async ({ action, schedule, command, pattern }) => {
        state.totalToolCalls++
        if (action === 'list') {
          const result = await executeCommand('crontab -l 2>/dev/null || echo "no crontab"', { timeout: 5000 })
          return { success: true, crontab: result.stdout || '' }
        }
        if (action === 'add') {
          if (!schedule || !command) return { success: false, error: 'schedule and command required' }
          const entry = `${schedule} ${command}`
          const escapedEntry = entry.replace(/'/g, "'\\''")
          const result = await executeCommand(`(crontab -l 2>/dev/null; echo '${escapedEntry}') | crontab -`, { timeout: 10000 })
          addActivity(state, 'action', `Added cron: ${entry.slice(0, 80)}`)
          return { success: result.exitCode === 0, entry, stderr: result.stderr || '' }
        }
        if (action === 'remove') {
          if (!pattern) return { success: false, error: 'pattern required for remove' }
          const escapedPattern = pattern.replace(/'/g, "'\\''")
          const result = await executeCommand(`crontab -l 2>/dev/null | grep -v '${escapedPattern}' | crontab -`, { timeout: 10000 })
          addActivity(state, 'action', `Removed cron matching: ${pattern}`)
          return { success: result.exitCode === 0, stderr: result.stderr || '' }
        }
        return { success: false, error: 'Invalid action' }
      },
    }),

    process_manage: tool({
      description: 'Manage system processes — list running processes, kill by PID or name, send signals, check resource usage.',
      inputSchema: z.object({
        action: z.enum(['list', 'kill', 'signal', 'top']),
        pid: z.number().optional().describe('Process ID'),
        name: z.string().optional().describe('Process name (for kill by name)'),
        signal: z.string().optional().describe('Signal name or number (default: TERM)'),
      }),
      execute: async ({ action, pid, name, signal: sig }) => {
        state.totalToolCalls++
        if (action === 'list') {
          const result = await executeCommand('ps aux --sort=-%mem | head -30', { timeout: 10000 })
          return { success: true, stdout: truncate(result.stdout || '') }
        }
        if (action === 'top') {
          const result = await executeCommand('top -bn1 | head -20', { timeout: 10000 })
          return { success: true, stdout: truncate(result.stdout || '') }
        }
        if (action === 'kill' || action === 'signal') {
          const sigFlag = sig ? `-${sig}` : '-TERM'
          if (pid) {
            const result = await executeCommand(`kill ${sigFlag} ${pid}`, { timeout: 5000 })
            addActivity(state, 'action', `Killed PID ${pid} with ${sigFlag}`)
            return { success: result.exitCode === 0, stderr: result.stderr || '' }
          }
          if (name) {
            const escapedName = name.replace(/'/g, "'\\''")
            const result = await executeCommand(`pkill ${sigFlag} '${escapedName}'`, { timeout: 5000 })
            addActivity(state, 'action', `Killed process "${name}" with ${sigFlag}`)
            return { success: result.exitCode === 0, stderr: result.stderr || '' }
          }
          return { success: false, error: 'pid or name required' }
        }
        return { success: false, error: 'Invalid action' }
      },
    }),

    network_control: tool({
      description: 'Manage network — WiFi, interfaces, firewall, DNS, SSH keys, ports. Full control over all networking.',
      inputSchema: z.object({
        action: z.enum(['status', 'wifi-scan', 'wifi-connect', 'interfaces', 'ports', 'firewall', 'dns', 'ssh-keygen']),
        ssid: z.string().optional().describe('WiFi SSID for connect'),
        password: z.string().optional().describe('WiFi password for connect'),
        rule: z.string().optional().describe('Firewall rule for iptables (e.g. "-A INPUT -p tcp --dport 80 -j ACCEPT")'),
      }),
      execute: async ({ action, ssid, password, rule }) => {
        state.totalToolCalls++
        const commands: Record<string, string> = {
          'status': 'ip addr show && echo "---" && ip route show && echo "---" && cat /etc/resolv.conf',
          'wifi-scan': 'sudo iwlist wlan0 scan 2>/dev/null | grep -E "ESSID|Quality|Encryption" || nmcli dev wifi list 2>/dev/null',
          'interfaces': 'ip link show',
          'ports': 'ss -tlnp',
          'dns': 'cat /etc/resolv.conf',
          'ssh-keygen': `ssh-keygen -t ed25519 -f ${HOME}/.ssh/pi-chi-key -N "" -q 2>/dev/null; cat ${HOME}/.ssh/pi-chi-key.pub`,
        }
        if (action === 'wifi-connect') {
          if (!ssid) return { success: false, error: 'SSID required' }
          const escapedSsid = ssid.replace(/'/g, "'\\''")
          const cmd = password
            ? `sudo nmcli dev wifi connect '${escapedSsid}' password '${password.replace(/'/g, "'\\''")}'`
            : `sudo nmcli dev wifi connect '${escapedSsid}'`
          const result = await executeCommand(cmd, { timeout: 30000 })
          addActivity(state, 'action', `WiFi connect: ${ssid}`)
          return { success: result.exitCode === 0, stdout: result.stdout || '', stderr: result.stderr || '' }
        }
        if (action === 'firewall') {
          if (!rule) return { success: false, error: 'rule required (e.g. "-A INPUT -p tcp --dport 80 -j ACCEPT")' }
          const result = await executeCommand(`sudo iptables ${rule}`, { timeout: 10000 })
          addActivity(state, 'action', `Firewall: iptables ${rule.slice(0, 60)}`)
          return { success: result.exitCode === 0, stderr: result.stderr || '' }
        }
        const cmd = commands[action]
        if (!cmd) return { success: false, error: 'Invalid action' }
        const result = await executeCommand(cmd, { timeout: 15000 })
        return { success: result.exitCode === 0, stdout: truncate(result.stdout || ''), stderr: result.stderr || '' }
      },
    }),

    hardware_control: tool({
      description: 'Control hardware peripherals — camera, audio, I2C, SPI, serial, USB devices, display. Interact with the physical world.',
      inputSchema: z.object({
        action: z.enum(['camera-capture', 'camera-video', 'audio-play', 'audio-record', 'audio-volume', 'i2c-detect', 'i2c-read', 'i2c-write', 'serial-list', 'serial-send', 'usb-list', 'display-info', 'display-brightness']),
        path: z.string().optional().describe('File path for capture/play/record output'),
        duration: z.number().optional().describe('Duration in seconds for video/record'),
        device: z.string().optional().describe('Device path (e.g. /dev/ttyUSB0, /dev/i2c-1)'),
        address: z.string().optional().describe('I2C address (hex, e.g. "0x48")'),
        data: z.string().optional().describe('Data to send (hex string for I2C, text for serial)'),
        volume: z.number().optional().describe('Volume level 0-100 for audio-volume'),
      }),
      execute: async ({ action, path: filePath, duration, device, address, data, volume }) => {
        state.totalToolCalls++
        const outputPath = filePath || `/tmp/pi-chi-${action}-${Date.now()}`

        const cmds: Record<string, string> = {
          'camera-capture': `libcamera-still -o ${outputPath}.jpg --nopreview -t 1000 2>&1`,
          'camera-video': `libcamera-vid -o ${outputPath}.h264 --nopreview -t ${(duration || 5) * 1000} 2>&1`,
          'audio-play': `aplay ${filePath || ''} 2>&1`,
          'audio-record': `arecord -d ${duration || 5} -f cd ${outputPath}.wav 2>&1`,
          'audio-volume': `amixer set Master ${volume ?? 50}% 2>&1`,
          'i2c-detect': `sudo i2cdetect -y ${device || '1'} 2>&1`,
          'i2c-read': address ? `sudo i2cget -y ${device || '1'} ${address} 2>&1` : 'echo "address required"',
          'i2c-write': address && data ? `sudo i2cset -y ${device || '1'} ${address} ${data} 2>&1` : 'echo "address and data required"',
          'serial-list': 'ls -la /dev/ttyUSB* /dev/ttyACM* /dev/serial* 2>/dev/null || echo "No serial devices found"',
          'serial-send': device && data ? `echo '${data.replace(/'/g, "'\\''") }' > ${device}` : 'echo "device and data required"',
          'usb-list': 'lsusb 2>&1',
          'display-info': 'tvservice -s 2>/dev/null || echo "No display detected"; cat /sys/class/backlight/*/brightness 2>/dev/null || true',
          'display-brightness': `echo ${volume || 128} | sudo tee /sys/class/backlight/*/brightness 2>/dev/null || echo "No backlight control"`,
        }

        const cmd = cmds[action]
        if (!cmd) return { success: false, error: 'Invalid action' }

        addActivity(state, 'action', `Hardware: ${action}${filePath ? ` → ${filePath}` : ''}`)
        const result = await executeCommand(cmd, { timeout: (duration || 10) * 1000 + 5000 })
        return {
          success: result.exitCode === 0,
          stdout: truncate(result.stdout || ''),
          stderr: result.stderr || '',
          outputPath: filePath ? outputPath : undefined,
        }
      },
    }),

    user_manage: tool({
      description: 'Manage users, groups, and file permissions on the Pi. Create/delete users, chmod, chown.',
      inputSchema: z.object({
        action: z.enum(['list-users', 'add-user', 'del-user', 'chmod', 'chown', 'groups', 'whoami']),
        target: z.string().optional().describe('Username, file path, or group name'),
        mode: z.string().optional().describe('For chmod: permission mode (e.g. "755", "u+x")'),
        owner: z.string().optional().describe('For chown: owner[:group]'),
      }),
      execute: async ({ action, target, mode, owner }) => {
        state.totalToolCalls++
        const cmds: Record<string, string> = {
          'list-users': 'cut -d: -f1 /etc/passwd',
          'add-user': target ? `sudo useradd -m ${target}` : 'echo "target required"',
          'del-user': target ? `sudo userdel ${target}` : 'echo "target required"',
          'chmod': target && mode ? `sudo chmod ${mode} ${target}` : 'echo "target and mode required"',
          'chown': target && owner ? `sudo chown ${owner} ${target}` : 'echo "target and owner required"',
          'groups': target ? `groups ${target}` : 'groups',
          'whoami': 'whoami && id',
        }
        const cmd = cmds[action]
        if (!cmd) return { success: false, error: 'Invalid action' }
        addActivity(state, 'action', `User: ${action} ${target || ''}`)
        const result = await executeCommand(cmd, { timeout: 10000 })
        return { success: result.exitCode === 0, stdout: truncate(result.stdout || ''), stderr: result.stderr || '' }
      },
    }),

    self_update: tool({
      description: 'Update system packages, Pi firmware, Pi-Chi itself, or Node.js. Use for keeping the system current.',
      inputSchema: z.object({
        target: z.enum(['system', 'firmware', 'pi-chi', 'node']),
      }),
      execute: async ({ target }) => {
        state.totalToolCalls++
        const cmds: Record<string, string> = {
          'system': 'sudo apt-get update -qq && sudo apt-get upgrade -y -qq',
          'firmware': 'sudo rpi-update || echo "rpi-update not available"',
          'pi-chi': `cd ${join(HOME, 'pi-chi')} && git pull --ff-only && npm ci && npm run build`,
          'node': 'sudo npm install -g n && sudo n lts',
        }
        addActivity(state, 'action', `Self-update: ${target}`)
        const result = await executeCommand(cmds[target], { timeout: 600000 }) // 10 min for updates
        return { success: result.exitCode === 0, stdout: truncate(result.stdout || ''), stderr: truncate(result.stderr || '') }
      },
    }),

    power_control: tool({
      description: 'Control system power — shutdown, reboot, schedule power operations. You will go offline during reboot/shutdown.',
      inputSchema: z.object({
        action: z.enum(['reboot', 'shutdown', 'schedule-reboot', 'cancel-shutdown', 'uptime']),
        delay: z.number().optional().describe('Delay in minutes for scheduled operations'),
        reason: z.string().describe('Why are you doing this? (logged for audit)'),
      }),
      execute: async ({ action, delay, reason }) => {
        state.totalToolCalls++
        addActivity(state, 'system', `Power: ${action} — ${reason}`)

        if (action === 'uptime') {
          const result = await executeCommand('uptime', { timeout: 5000 })
          return { success: true, stdout: result.stdout || '' }
        }
        if (action === 'cancel-shutdown') {
          const result = await executeCommand('sudo shutdown -c', { timeout: 5000 })
          return { success: result.exitCode === 0, stderr: result.stderr || '' }
        }

        // Save state before power operations
        saveBrainState(state)

        const mins = delay || 1
        const cmd = action === 'reboot'
          ? `sudo shutdown -r +${mins} "${reason.slice(0, 100)}"`
          : action === 'shutdown'
            ? `sudo shutdown -h +${mins} "${reason.slice(0, 100)}"`
            : `sudo shutdown -r +${delay || 60} "${reason.slice(0, 100)}"`

        const result = await executeCommand(cmd, { timeout: 10000 })
        return { success: result.exitCode === 0, message: `${action} scheduled in ${mins} minutes`, stderr: result.stderr || '' }
      },
    }),
  }
}

// ── Shell escaping for custom tool parameters ───────────────────
function shellEscape(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'"
}

/** Load custom tools from ~/.pi-chi/tools/ — each subdirectory has a manifest.json */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function loadCustomTools(state: BrainState): Record<string, any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customTools: Record<string, any> = {}
  const toolsDir = join(process.env.HOME || '/home/pi', '.pi-chi', 'tools')

  if (!existsSync(toolsDir)) return customTools

  try {
    const entries = readdirSync(toolsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const manifestPath = join(toolsDir, entry.name, 'manifest.json')
      if (!existsSync(manifestPath)) continue

      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
          name: string
          description: string
          command: string
          parameters?: Record<string, { type: string; description: string }>
        }

        // Build a zod schema from the manifest parameters
        const schemaShape: Record<string, z.ZodType> = {}
        if (manifest.parameters) {
          for (const [key, param] of Object.entries(manifest.parameters)) {
            schemaShape[key] = param.type === 'number'
              ? z.number().describe(param.description)
              : z.string().describe(param.description)
          }
        }

        // Validate manifest structure
        if (!manifest.name || typeof manifest.name !== 'string' || !manifest.command || typeof manifest.command !== 'string') {
          continue // Skip invalid manifests
        }
        if (!/^[a-zA-Z0-9_-]+$/.test(manifest.name)) {
          continue // Name must be alphanumeric
        }

        customTools[`custom_${manifest.name}`] = tool({
          description: `[Custom Tool] ${manifest.description}`,
          inputSchema: z.object(schemaShape),
          execute: async (params: Record<string, unknown>) => {
            state.totalToolCalls++
            // Substitute {{param}} placeholders with shell-escaped values
            let cmd = manifest.command
            for (const [key, value] of Object.entries(params)) {
              cmd = cmd.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), shellEscape(String(value)))
            }

            // Run assembled command through safety checks
            const blocked = isBlocked(cmd)
            if (blocked) {
              addActivity(state, 'error', `Custom tool ${manifest.name}: blocked command`)
              return { success: false, error: blocked }
            }
            addActivity(state, 'action', `Custom tool ${manifest.name}: ${cmd.slice(0, 80)}`)
            const result = await executeCommand(cmd, { timeout: 60000 })
            return {
              success: result.exitCode === 0,
              stdout: truncate(result.stdout || ''),
              stderr: truncate(result.stderr || ''),
            }
          },
        })
      } catch {
        // Skip malformed manifests
      }
    }
  } catch {
    // Tools dir scan failed — no custom tools
  }

  return customTools
}
