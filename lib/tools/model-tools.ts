import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'

export function createModelTools(_ctx: ToolContext) {
  return {
    select_model: tool({
      description: 'Switch to a different Claude model for the remainder of this session. Use when a task requires more reasoning power (Opus) or when a simple task can be handled faster (Haiku).',
      inputSchema: z.object({
        model: z.enum(['haiku', 'sonnet', 'opus']).describe('Model to switch to: haiku (fast), sonnet (balanced), opus (most capable)'),
        reason: z.string().optional().describe('Why you are switching models'),
      }),
      execute: async ({ model, reason }) => {
        const modelMap: Record<string, string> = {
          haiku: 'claude-haiku-4-5-20251001',
          sonnet: 'claude-sonnet-4-20250514',
          opus: 'claude-opus-4-6',
        }
        return {
          ok: true,
          selectedModel: modelMap[model] || modelMap.sonnet,
          reason: reason || `Switched to ${model}`,
          __model_override: modelMap[model] || modelMap.sonnet,
        }
      },
    }),
  }
}
