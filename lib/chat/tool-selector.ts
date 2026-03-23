// Conditional tool selection — only include tools relevant to the current message

import type { ToolContext } from '@/lib/tools'
import {
  createFileTools,
  createProjectTools,
  createGithubTools,
  createDeployTools,
  createSelfModTools,
  createDbTools,
  createUtilityTools,
  createTerminalTools,
  createTestingTools,
  createAuditTools,
  createTaskTools,
  createGoogleTools,
  createStripeTools,
} from '@/lib/tools'

export const TOOL_CATEGORY_PATTERNS: Record<string, RegExp> = {
  project: /scaffold|new project|template|create.*project|start.*project/i,
  github: /github|git\b|push|pull\b|commit|repo|branch|pr\b|merge/i,
  deploy: /deploy|vercel|env\b|domain|sandbox|preview|live/i,
  selfMod: /yourself|self.*mod|upgrade.*self|improve.*self|pi_|your own|your source|your code/i,
  db: /database|table\b|schema|supabase|query|insert|select\b|row|column|db_/i,
  terminal: /run\b|command|terminal|install|server|npm|start.*dev/i,
  audit: /audit|code review|scan|review.*code/i,
  google: /google|sheet|calendar|gmail|drive|spreadsheet|email/i,
  stripe: /stripe|payment|checkout|billing|subscription|invoice|customer|refund|charge|payout/i,
  mcp: /mcp|plugin|external.*server/i,
  inspection: /validate|coherence|capture.*preview|reference|diagnose/i,
  generation: /generate.*test|dependency.*health/i,
  webSearch: /search.*web|look.*up|find.*out|documentation|how to\b|what is\b/i,
  persistence: /memory|preference|history|chat.*history/i,
}

export function selectTools(
  lastUserText: string,
  ctx: ToolContext,
  isPiOwner: boolean,
  isFirstMessage: boolean,
  fileCount: number,
): Record<string, any> {
  const text = lastUserText.toLowerCase()

  // Core tools — ALWAYS included
  const tools: Record<string, any> = {
    ...createFileTools(ctx),
    ...createTaskTools(ctx),
    ...createTestingTools(ctx), // build verification is mandatory
  }

  // Check which optional categories match
  const matches = new Set<string>()
  for (const [category, pattern] of Object.entries(TOOL_CATEGORY_PATTERNS)) {
    if (pattern.test(text)) matches.add(category)
  }

  // First message: always include persistence (auto-load memory)
  if (isFirstMessage) matches.add('persistence')

  // Building (multi-file) tasks: include inspection + generation
  if (fileCount > 2 || matches.has('project')) {
    matches.add('inspection')
    matches.add('generation')
  }

  // Utility tools: always included (planning, inspection, generation, model, search, persistence, mcp)
  Object.assign(tools, createUtilityTools(ctx))

  // Conditional heavy categories
  if (matches.has('project')) Object.assign(tools, createProjectTools(ctx))
  if (matches.has('github')) Object.assign(tools, createGithubTools(ctx))
  if (matches.has('deploy')) Object.assign(tools, createDeployTools(ctx))
  if (matches.has('selfMod') && isPiOwner) Object.assign(tools, createSelfModTools(ctx))
  if (matches.has('db')) Object.assign(tools, createDbTools(ctx))
  if (matches.has('terminal')) Object.assign(tools, createTerminalTools(ctx))
  if (matches.has('audit')) Object.assign(tools, createAuditTools(ctx))
  if (matches.has('google')) Object.assign(tools, createGoogleTools(ctx))
  if (matches.has('stripe')) Object.assign(tools, createStripeTools(ctx))

  const toolCount = Object.keys(tools).length
  const estimatedSchemaTokens = Math.round(toolCount * 220)
  console.log(`[pi:tools] ${toolCount} tools included (est. ${estimatedSchemaTokens} schema tokens), categories: ${[...matches].join(', ') || 'core-only'}`)

  return tools
}
