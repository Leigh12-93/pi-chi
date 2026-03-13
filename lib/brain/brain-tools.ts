/* ─── Pi-Chi Brain — Autonomous Tool Definitions ─────────────── */

import { tool } from 'ai'
import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { executeCommand, isBlocked } from '../tools/terminal-tools'
import { sendSms } from './brain-sms'
import { addActivity } from './brain-state'
import type { BrainState, BrainGoal } from './brain-types'

const MAX_OUTPUT = 10_000 // Cap shell output at 10KB

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
      description: 'Write content to a file. Creates parent directories if needed.',
      inputSchema: z.object({
        path: z.string().describe('Absolute path to write'),
        content: z.string().describe('File content'),
      }),
      execute: async ({ path, content }) => {
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
      description: 'Edit a file by replacing a specific string with another.',
      inputSchema: z.object({
        path: z.string().describe('Absolute path to the file'),
        old_string: z.string().describe('The exact string to find and replace'),
        new_string: z.string().describe('The replacement string'),
      }),
      execute: async ({ path, old_string, new_string }) => {
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
      description: 'Run a git operation (clone, status, add, commit, push, pull, branch, log, diff).',
      inputSchema: z.object({
        command: z.string().describe('The git command (e.g. "status", "add -A", "commit -m \\"msg\\"")'),
        cwd: z.string().optional().describe('Repository directory'),
      }),
      execute: async ({ command, cwd }) => {
        state.totalToolCalls++
        const fullCmd = `git ${command}`
        addActivity(state, 'action', `Git: ${fullCmd.slice(0, 80)}`)
        const result = await executeCommand(fullCmd, {
          cwd: cwd || process.env.HOME || '/home/pi',
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
  }
}
