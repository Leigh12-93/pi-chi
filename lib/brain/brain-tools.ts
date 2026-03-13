/* ─── Pi-Chi Brain — Autonomous Tool Definitions ─────────────── */

import { tool } from 'ai'
import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { executeCommand, isBlocked } from '../tools/terminal-tools'
import { sendSms } from './brain-sms'
import { addActivity, saveBrainState } from './brain-state'
import type { BrainState, BrainGoal } from './brain-types'

const MAX_OUTPUT = 10_000 // Cap shell output at 10KB

// ── HARD GUARD: Pi-Chi can ONLY modify its own files ──────────────
// Allowed paths: its own repo, its state dir, its home-created projects, /tmp
// !! TAMPER-PROTECTED — Pi-Chi CANNOT modify this guard code !!
const HOME = process.env.HOME || '/home/pi'
const ALLOWED_WRITE_PREFIXES = [
  join(HOME, 'pi-chi'),          // Its own source code
  join(HOME, '.pi-chi'),         // Its brain state & tools
  join(HOME, 'pi-chi-projects'), // Projects it creates itself
  '/tmp',                        // Temp files
]

// Files Pi-Chi is NEVER allowed to edit (the guard system itself)
const TAMPER_PROTECTED_FILES = [
  'lib/brain/brain-tools.ts',     // Contains these guards
  'lib/tools/terminal-tools.ts',  // Contains blocked command patterns
]

function isWriteAllowed(path: string): string | null {
  const resolved = path.startsWith('/') ? path : join(HOME, path)
  const allowed = ALLOWED_WRITE_PREFIXES.some(prefix => resolved.startsWith(prefix))
  if (!allowed) {
    return `BLOCKED: You can only write/edit files in your own directories (${ALLOWED_WRITE_PREFIXES.join(', ')}). Path "${resolved}" is outside your allowed scope.`
  }

  // Check tamper protection — Pi-Chi cannot edit its own guard code
  for (const protected_file of TAMPER_PROTECTED_FILES) {
    const fullProtected = join(HOME, 'pi-chi', protected_file)
    if (resolved === fullProtected || resolved.endsWith(protected_file)) {
      return `TAMPER BLOCKED: "${protected_file}" contains safety guards and cannot be modified by the brain. Ask Leigh if you need changes to guard rules.`
    }
  }

  return null
}

// Shell commands that could modify other projects
const BLOCKED_WRITE_PATTERNS = [
  /\bcd\s+(?!~\/pi-chi|~\/.pi-chi|~\/pi-chi-projects|\/tmp).*&&.*(?:rm|mv|cp|cat\s*>|tee|sed\s+-i|echo\s+.*>)/i,
  /(?:rm|mv|cat\s*>|tee|sed\s+-i)\s+(?:\/home\/\w+\/(?!pi-chi|\.pi-chi|pi-chi-projects))/i,
]

function isShellWriteBlocked(command: string): string | null {
  for (const pattern of BLOCKED_WRITE_PATTERNS) {
    if (pattern.test(command)) {
      return `BLOCKED: Shell command appears to modify files outside your allowed directories. You can only modify ~/pi-chi, ~/.pi-chi, ~/pi-chi-projects, and /tmp.`
    }
  }
  return null
}

function truncate(s: string, max = MAX_OUTPUT): string {
  return s.length > max ? s.slice(0, max) + `\n... (truncated, ${s.length} chars total)` : s
}

export function createBrainTools(state: BrainState) {
  return {
    shell: tool({
      description: 'Execute a shell command on this machine. Returns stdout, stderr, exit code. Commands that could destroy the system are blocked.',
      inputSchema: z.object({
        command: z.string().describe('The shell command to execute'),
        cwd: z.string().optional().describe('Working directory (default: home)'),
        timeout: z.number().optional().describe('Timeout in ms (default: 30000, max: 120000)'),
      }),
      execute: async ({ command, cwd, timeout }) => {
        const blocked = isBlocked(command)
        if (blocked) {
          addActivity(state, 'error', `Blocked command: ${command.slice(0, 80)}`)
          return { success: false, error: blocked }
        }

        const writeBlocked = isShellWriteBlocked(command)
        if (writeBlocked) {
          addActivity(state, 'error', `Scope guard: ${command.slice(0, 80)}`)
          return { success: false, error: writeBlocked }
        }

        state.totalToolCalls++
        addActivity(state, 'action', `Shell: ${command.slice(0, 100)}`)

        const result = await executeCommand(command, {
          cwd: cwd || process.env.HOME || '/home/pi',
          timeout: Math.min(timeout || 30000, 120000),
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
      description: 'Write content to a file. Creates parent directories if needed. ONLY works in ~/pi-chi, ~/.pi-chi, ~/pi-chi-projects, and /tmp.',
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
      description: 'Edit a file by replacing a specific string with another. ONLY works in ~/pi-chi, ~/.pi-chi, ~/pi-chi-projects, and /tmp.',
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
      }),
      execute: async ({ title, priority, reasoning, tasks, existingGoalId }) => {
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
      description: 'Run a git operation. ONLY works in ~/pi-chi, ~/.pi-chi, and ~/pi-chi-projects.',
      inputSchema: z.object({
        command: z.string().describe('The git command (e.g. "status", "add -A", "commit -m \\"msg\\"")'),
        cwd: z.string().optional().describe('Repository directory'),
      }),
      execute: async ({ command, cwd }) => {
        const gitDir = cwd || HOME
        const guard = isWriteAllowed(gitDir)
        if (guard) {
          addActivity(state, 'error', `Git blocked outside own repos: ${gitDir}`)
          return { success: false, error: `BLOCKED: Git operations only allowed in your own directories. "${gitDir}" is outside scope.` }
        }
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
      description: 'Add to your own system prompt. Use this to evolve your personality, add guidelines, or record principles you want to always follow. Be judicious — prompt tokens cost money.',
      inputSchema: z.object({
        addition: z.string().describe('Text to add to your system prompt'),
        reasoning: z.string().describe('Why are you adding this?'),
      }),
      execute: async ({ addition, reasoning }) => {
        state.totalToolCalls++
        state.promptOverrides += `\n\n${addition}`
        addActivity(state, 'decision', `Evolved prompt: ${reasoning.slice(0, 100)}`)
        state.growthLog.push({
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          category: 'realized',
          description: `Evolved prompt: ${reasoning}`,
        })
        return { success: true, promptLength: state.promptOverrides.length }
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

    claude_code: tool({
      description: `Use Claude Code CLI for complex code tasks — multi-file refactors, builds, fixing type errors, creating new features. This is your heavy-lifting tool. It spawns a Claude Code process that can read, write, and edit files autonomously. Use this instead of manual write_file/edit_file when: (1) you need to modify multiple files, (2) you need to fix build errors, (3) you need to create a new feature with proper types, (4) you want higher quality code output. The prompt you provide should be a clear, specific instruction. Claude Code has access to the full codebase. IMPORTANT: Claude Code can ONLY work in ~/pi-chi and ~/pi-chi-projects. Max runtime: 5 minutes.`,
      inputSchema: z.object({
        prompt: z.string().describe('Clear instruction for what Claude Code should do. Be specific about files, changes, and expected outcomes.'),
        cwd: z.string().optional().describe('Working directory (default: ~/pi-chi). Must be ~/pi-chi or ~/pi-chi-projects/*'),
      }),
      execute: async ({ prompt, cwd }) => {
        const workDir = cwd || join(process.env.HOME || '/home/pi', 'pi-chi')

        // Guard: only allowed in pi-chi dirs
        const guard = isWriteAllowed(workDir)
        if (guard) {
          addActivity(state, 'error', `Claude Code blocked: ${workDir} outside scope`)
          return { success: false, error: guard }
        }

        state.totalToolCalls++
        addActivity(state, 'action', `Claude Code: ${prompt.slice(0, 120)}`)

        try {
          // Build the claude command — use -p for non-interactive, --output-format for parseable output
          const escapedPrompt = prompt.replace(/'/g, "'\\''")
          const cmd = `claude -p '${escapedPrompt}' --output-format text --max-turns 25 --verbose 2>/dev/null`

          const result = await executeCommand(cmd, {
            cwd: workDir,
            timeout: 300000, // 5 minute max
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
  }
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

        customTools[`custom_${manifest.name}`] = tool({
          description: `[Custom Tool] ${manifest.description}`,
          inputSchema: z.object(schemaShape),
          execute: async (params: Record<string, unknown>) => {
            state.totalToolCalls++
            // Substitute {{param}} placeholders in the command
            let cmd = manifest.command
            for (const [key, value] of Object.entries(params)) {
              cmd = cmd.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), String(value))
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
