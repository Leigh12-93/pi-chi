import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'

export function createPlanningTools(_ctx: ToolContext) {
  return {
    think: tool({
      description: 'Think through your approach before building. Use for complex tasks (3+ files). The files array becomes a live progress checklist — list EVERY file you plan to create/modify in BUILD ORDER (types → hooks → components → pages). For data-driven apps, include dataModel and stateManagement. After think, IMMEDIATELY start building with tool calls. No text output.',
      inputSchema: z.object({
        plan: z.string().describe('Your step-by-step plan for implementing this task'),
        files: z.array(z.string()).describe('ALL files in BUILD ORDER: types → hooks → components → pages'),
        approach: z.string().optional().describe('Key architectural decisions'),
        dataModel: z.string().optional().describe('TypeScript types/interfaces for core entities — define BEFORE building components'),
        stateManagement: z.string().optional().describe('Hooks, stores, context, data fetching strategy'),
        apiContracts: z.string().optional().describe('API route request/response shapes'),
        errorStrategy: z.string().optional().describe('Loading states, error boundaries, empty states per data source'),
        confidence: z.number().min(0).max(100).optional()
          .describe('Confidence in approach (0-100). Below 70 → use present_plan to get user approval'),
        uncertainties: z.array(z.string()).optional()
          .describe('What would reduce uncertainty'),
        fragileAssumption: z.string().optional()
          .describe('The assumption most likely to be wrong'),
      }),
      execute: async ({ plan, files, approach, dataModel, stateManagement, apiContracts, errorStrategy, confidence, uncertainties, fragileAssumption }) => {
        const warnings: string[] = []

        const typesIdx = files.findIndex(f => /\/types\.tsx?$/.test(f) || f.includes('/types/'))
        const firstComponentIdx = files.findIndex(f => f.includes('components/'))
        const firstPageIdx = files.findIndex(f => f.match(/app\/.*page\.tsx/) || f.match(/page\.tsx$/))
        if (typesIdx > -1 && firstComponentIdx > -1 && typesIdx > firstComponentIdx) {
          warnings.push('BUILD ORDER: types file is listed AFTER components — types should be built first')
        }
        if (firstComponentIdx > -1 && firstPageIdx > -1 && firstComponentIdx > firstPageIdx) {
          warnings.push('BUILD ORDER: components are listed AFTER pages — components should be built before pages that import them')
        }

        const planLower = plan.toLowerCase()
        const isDataDriven = /\b(fetch|api|crud|form|database|supabase|data|state)\b/.test(planLower)
        if (isDataDriven && !dataModel) {
          warnings.push('ARCHITECTURE: This appears to be a data-driven app but no dataModel was provided — define TypeScript types for your entities')
        }
        const hasApiRoutes = files.some(f => f.includes('api/') && f.includes('route'))
        if (hasApiRoutes && !apiContracts) {
          warnings.push('ARCHITECTURE: API routes are planned but no apiContracts defined — specify request/response shapes')
        }
        if (isDataDriven && !stateManagement) {
          warnings.push('ARCHITECTURE: Data-driven app with no stateManagement — define hooks, stores, context, or data fetching strategy')
        }
        if (isDataDriven && !errorStrategy) {
          warnings.push('ARCHITECTURE: Data-driven app with no errorStrategy — define loading, error, and empty states')
        }

        if (confidence !== undefined && confidence < 70) {
          warnings.push(`LOW CONFIDENCE (${confidence}%): Consider using present_plan to get user approval before building`)
        }

        // Return only actionable feedback — inputs are already in the conversation
        // as tool call args, so echoing them wastes context window tokens
        return {
          acknowledged: true,
          files,
          ...(warnings.length > 0 ? {
            warnings,
            next: `Address these warnings before building: ${warnings.join('; ')}`,
          } : {
            next: 'Start building immediately. Your next action must be a tool call.',
          }),
        }
      },
    }),

    present_plan: tool({
      description: 'Present a build plan to the user and WAIT for approval. Use for ANY task involving 3+ files, ambiguous requirements, or architectural decisions. Shows an interactive plan card. Do NOT build until the user approves.',
      inputSchema: z.object({
        summary: z.string().describe('1-2 sentence overview of what will be built'),
        approach: z.string().describe('Key architectural decisions and rationale'),
        files: z.array(z.object({
          path: z.string(),
          action: z.enum(['create', 'modify', 'delete']),
          reason: z.string().describe('Why this file needs this change'),
        })).describe('Every file that will be created/modified/deleted, in build order'),
        alternatives: z.array(z.object({
          id: z.string(),
          label: z.string(),
          description: z.string(),
        })).optional().describe('Alternative approaches for user to choose'),
        questions: z.array(z.object({
          id: z.string(),
          question: z.string(),
          options: z.array(z.string()).optional(),
        })).optional().describe('Clarifying questions requiring user input'),
        confidence: z.number().min(0).max(100).describe('Confidence in this plan (0-100)'),
        uncertainties: z.array(z.string()).optional().describe('What could reduce uncertainty'),
      }),
      execute: async (args) => ({
        __plan_gate: true,
        ...args,
        instruction: 'Plan presented to user. STOP and WAIT for their approval. Do NOT proceed until you receive a [PLAN APPROVED] or [PLAN REJECTED] message.',
      }),
    }),

    ask_user: tool({
      description: 'Ask the user a clarifying question with optional choices. Use when the request is ambiguous, multiple valid approaches exist, or you need the user to decide. Renders as an interactive card. STOP and wait for response.',
      inputSchema: z.object({
        question: z.string().describe('The question to ask'),
        context: z.string().optional().describe('Why you are asking this'),
        options: z.array(z.object({
          id: z.string(),
          label: z.string(),
          description: z.string().optional(),
        })).optional().describe('Choices for the user (if applicable)'),
        recommended: z.string().optional().describe('ID of the recommended option'),
        allowFreeText: z.boolean().optional().describe('Allow user to type a custom answer (default true)'),
      }),
      execute: async (args) => ({
        __ask_gate: true,
        ...args,
        instruction: 'Question shown to user. STOP and wait for their response.',
      }),
    }),

    checkpoint: tool({
      description: 'Show a progress checkpoint during a complex build (10+ files). Use after completing a logical phase. Lets the user see progress and provide feedback before continuing.',
      inputSchema: z.object({
        phase: z.string().describe('What phase just completed (e.g., "Data model & types")'),
        completed: z.array(z.string()).describe('Files completed in this phase'),
        nextPhase: z.string().describe('What will be built next'),
        previewReady: z.boolean().optional().describe('Is there enough to see a meaningful preview?'),
        question: z.string().optional().describe('Optional question before continuing'),
      }),
      execute: async (args) => ({
        __checkpoint: true,
        ...args,
        instruction: args.question
          ? 'Checkpoint shown with question. STOP and wait for user response.'
          : 'Checkpoint shown. Continue to next phase.',
      }),
    }),

    suggest_improvement: tool({
      description: 'Log a tooling limitation, bug, or improvement suggestion. Use when you encounter something that blocks or slows your work.',
      inputSchema: z.object({
        issue: z.string().describe('What limitation or bug you encountered'),
        suggestion: z.string().describe('Specific fix — include exact code changes if possible'),
        file: z.string().optional().describe('Which source file needs to change'),
        priority: z.enum(['low', 'medium', 'high']).describe('Impact level'),
      }),
      execute: async ({ issue, suggestion, file, priority }) => ({
        logged: true,
        issue,
        suggestion,
        file,
        priority,
      }),
    }),
  }
}
