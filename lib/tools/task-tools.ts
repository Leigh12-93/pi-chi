import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'

export function createTaskTools(_ctx: ToolContext) {
  return {
    manage_tasks: tool({
      description: 'Show a task list to the user to track progress on multi-step work. Call this at the start of complex tasks to show your plan, then call again as you complete each step. Tasks are displayed in a visible tray above the chat input. Always send the FULL list of tasks each time (not just changed ones) so the display stays in sync.',
      inputSchema: z.object({
        tasks: z.array(z.object({
          id: z.string().describe('Unique task identifier (e.g., "1", "2", "setup-db")'),
          label: z.string().describe('Short task description (under 60 chars)'),
          status: z.enum(['pending', 'in_progress', 'completed', 'failed']).describe('Current status'),
        })).describe('Full task list with current statuses'),
      }),
      execute: async ({ tasks }) => {
        return { ok: true, taskCount: tasks.length }
      },
    }),
  }
}
