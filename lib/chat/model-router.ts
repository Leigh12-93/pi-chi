// Model routing — complexity classification, thinking budgets, model config

import { getMessageText } from '@/lib/chat/tool-utils'

// Task complexity classification — used for both model routing and thinking budget
export const COMPLEX_RE = /architect|refactor|redesign|migrate|optimize performance|system design|rewrite|full rewrite|debug.*complex|build.*from scratch|implement.*auth|implement.*database|convert.*to|design.*api|security|performance|complex|multiple.*files|entire/i
export const SIMPLE_RE = /fix typo|rename|change.*color|change.*text|update title|small change|quick fix|add.*comment|what is|what does|explain|how does|remove.*line|delete.*line|change.*to/i

export const ALLOWED_MODELS = [
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
  'claude-opus-4-20250514',
  'claude-opus-4-6',
]

export const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'claude-sonnet-4-20250514': 200000,
  'claude-opus-4-20250514': 200000,
  'claude-opus-4-6': 680000,
  'claude-haiku-4-5-20251001': 200000,
}

export const MODEL_MAX_OUTPUT: Record<string, number> = {
  'claude-opus-4-6': 128000,
  'claude-opus-4-20250514': 64000,
}

export const MODEL_MAX_STEPS: Record<string, number> = {
  'claude-opus-4-6': 120,
  'claude-opus-4-20250514': 100,
  'claude-sonnet-4-20250514': 80,
  'claude-haiku-4-5-20251001': 60,
}

/** Strip 'anthropic/' prefix from legacy AI Gateway format model IDs */
export function normalizeModelId(id: string): string {
  return id.replace(/^anthropic\//, '')
}

export function classifyModelComplexity(messages: any[], fileCount: number): { model: string; reason: string } {
  const lastMsg = messages.findLast((m: any) => m.role === 'user')
  const text = lastMsg ? getMessageText(lastMsg) : ''
  const lower = text.toLowerCase()
  const wordCount = text.split(/\s+/).length

  // Opus indicators: complex architecture, multi-file refactors, system design, debugging
  if (COMPLEX_RE.test(lower) || (wordCount > 200 && fileCount > 10)) {
    return { model: 'claude-opus-4-20250514', reason: 'Complex task detected — using Opus for best reasoning' }
  }

  // Haiku indicators: simple edits, quick fixes, small questions
  const hasAttachments = lastMsg?.parts?.some((p: any) => p.type === 'file')
  if (!hasAttachments && SIMPLE_RE.test(lower) && wordCount < 30 && fileCount <= 5) {
    return { model: 'claude-haiku-4-5-20251001', reason: 'Simple task — using Haiku for speed' }
  }

  // Default: Sonnet for balanced performance
  return { model: 'claude-sonnet-4-20250514', reason: 'Standard task — using Sonnet' }
}

export function getThinkingBudget(model: string, userText: string, fileCount: number): number {
  if (model === 'claude-sonnet-4-20250514') {
    // Sonnet: modest budget. Thinking at $15/M is cheap but improves code quality.
    // Complex tasks get more; simple get baseline.
    if (COMPLEX_RE.test(userText) || fileCount > 10) return 6000
    return 4000
  }

  // Opus 4.6: scale thinking budget by complexity
  const wordCount = userText.split(/\s+/).length

  // Complex architecture / multi-file refactors — give it room to think deeply
  if (COMPLEX_RE.test(userText) || (wordCount > 150 && fileCount > 8)) return 16000

  // Simple edits / questions — minimal thinking needed
  if (SIMPLE_RE.test(userText) && wordCount < 40) return 3000

  // Default: standard budget
  return 8000
}
