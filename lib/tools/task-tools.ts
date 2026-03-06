import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'

export function createTaskTools(_ctx: ToolContext) {
  return {
    manage_tasks: tool({
      description: 'Track multi-step work with dependencies and phases. Tasks with blockedBy cannot start until dependencies complete. Send FULL list each call. Tasks are displayed in a visible tray above the chat input.',
      inputSchema: z.object({
        tasks: z.array(z.object({
          id: z.string().describe('Unique task identifier (e.g., "1", "2", "setup-db")'),
          label: z.string().describe('Short task description (under 60 chars)'),
          description: z.string().optional().describe('Detailed scope of this task'),
          status: z.enum(['pending', 'in_progress', 'completed', 'failed', 'blocked']).describe('Current status'),
          blockedBy: z.array(z.string()).optional().describe('IDs of tasks that must complete first'),
          phase: z.enum(['explore', 'plan', 'build', 'verify', 'deploy']).optional(),
        })).describe('Full task list with current statuses'),
      }),
      execute: async ({ tasks }) => {
        const ids = new Set(tasks.map(t => t.id))
        const warnings: string[] = []
        for (const task of tasks) {
          for (const dep of task.blockedBy || []) {
            if (!ids.has(dep)) warnings.push(`Task "${task.id}" blocked by unknown task "${dep}"`)
          }
          // Auto-block if deps not complete
          if (task.blockedBy?.length && task.status === 'pending') {
            const allDepsComplete = task.blockedBy.every(dep => {
              const depTask = tasks.find(t => t.id === dep)
              return depTask?.status === 'completed'
            })
            if (!allDepsComplete) task.status = 'blocked'
          }
        }
        const completed = tasks.filter(t => t.status === 'completed').length
        const blocked = tasks.filter(t => t.status === 'blocked').length
        return {
          ok: true,
          progress: `${completed}/${tasks.length}${blocked ? ` (${blocked} blocked)` : ''}`,
          warnings: warnings.length ? warnings : undefined,
        }
      },
    }),
  }
}
