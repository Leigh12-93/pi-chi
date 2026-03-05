import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'

export function createAuditTools(ctx: ToolContext) {
  return {
    audit_codebase: tool({
      description: 'Read ALL files in the project for comprehensive analysis. Use at the start of an audit to understand the full codebase. Returns file contents organized by category (components, utils, styles, config, etc.).',
      inputSchema: z.object({
        focus: z.enum(['all', 'components', 'styles', 'api', 'config', 'tests']).optional()
          .describe('Optionally focus on a specific category of files'),
      }),
      execute: async ({ focus }) => {
        const allFiles = ctx.vfs.list()
        const result: Record<string, string> = {}
        let totalSize = 0
        const MAX_TOTAL = 500_000 // 500KB total to avoid token explosion

        for (const file of allFiles) {
          // Filter by focus area
          if (focus && focus !== 'all') {
            const isMatch =
              (focus === 'components' && (file.includes('/components/') || file.endsWith('.tsx') || file.endsWith('.jsx'))) ||
              (focus === 'styles' && (file.endsWith('.css') || file.endsWith('.scss') || file.includes('tailwind'))) ||
              (focus === 'api' && (file.includes('/api/') || file.includes('/server/') || file.includes('/routes/'))) ||
              (focus === 'config' && (file.endsWith('.config.ts') || file.endsWith('.config.js') || file === 'package.json' || file === 'tsconfig.json')) ||
              (focus === 'tests' && (file.includes('.test.') || file.includes('.spec.') || file.includes('__tests__')))
            if (!isMatch) continue
          }

          const content = ctx.vfs.read(file)
          if (content === undefined) continue

          totalSize += content.length
          if (totalSize > MAX_TOTAL) {
            result[file] = `[TRUNCATED — file is ${content.length} chars, total audit would exceed ${MAX_TOTAL} chars]`
          } else {
            result[file] = content
          }
        }

        return {
          fileCount: Object.keys(result).length,
          totalFiles: allFiles.length,
          focus: focus || 'all',
          files: result,
        }
      },
    }),

    create_audit_plan: tool({
      description: 'Create a structured audit plan with findings organized by severity. After reading all files with audit_codebase, use this tool to present your findings. The plan will be shown to the user for approval before any changes are made. STOP after calling this tool and wait for user approval.',
      inputSchema: z.object({
        summary: z.string().describe('Brief overall assessment of the codebase (2-3 sentences)'),
        findings: z.array(z.object({
          id: z.string().describe('Unique ID like "A1", "A2", etc.'),
          severity: z.enum(['critical', 'high', 'medium', 'low']),
          category: z.enum(['bug', 'security', 'performance', 'accessibility', 'design', 'code-quality', 'seo', 'best-practice']),
          title: z.string().describe('Short title of the issue'),
          description: z.string().describe('What the issue is and why it matters'),
          file: z.string().describe('Primary file affected'),
          fix: z.string().describe('Proposed fix (brief description)'),
          effort: z.enum(['trivial', 'small', 'medium', 'large']),
        })).describe('List of findings sorted by severity (critical first)'),
        stats: z.object({
          filesAnalyzed: z.number(),
          issuesFound: z.number(),
          criticalCount: z.number(),
          estimatedFixTime: z.string().describe('Rough estimate like "5-10 minutes"'),
        }),
      }),
      execute: async ({ summary, findings, stats }) => {
        // Store the audit plan in VFS so it persists
        const planData = { summary, findings, stats, createdAt: new Date().toISOString(), status: 'pending_approval' }
        ctx.vfs.write('.forge/audit-plan.json', JSON.stringify(planData, null, 2))

        return {
          ok: true,
          message: 'Audit plan created. Waiting for user approval before executing fixes.',
          plan: planData,
        }
      },
    }),

    execute_audit_task: tool({
      description: 'Execute a single fix from an approved audit plan. Call this once per finding, in severity order (critical first). After each fix, verify the change works before moving to the next.',
      inputSchema: z.object({
        findingId: z.string().describe('The finding ID to fix (e.g., "A1")'),
        status: z.enum(['fixed', 'skipped', 'deferred']).describe('Result of the fix attempt'),
        changes: z.string().optional().describe('Description of what was changed'),
      }),
      execute: async ({ findingId, status, changes }) => {
        // Update the audit plan status
        const planFile = ctx.vfs.read('.forge/audit-plan.json')
        if (!planFile) return { ok: false, error: 'No audit plan found. Run create_audit_plan first.' }

        try {
          const plan = JSON.parse(planFile)
          const finding = plan.findings.find((f: any) => f.id === findingId)
          if (finding) {
            finding.status = status
            finding.changes = changes
            finding.fixedAt = new Date().toISOString()
          }

          // Check if all findings are addressed
          const remaining = plan.findings.filter((f: any) => !f.status)
          if (remaining.length === 0) {
            plan.status = 'completed'
          }

          ctx.vfs.write('.forge/audit-plan.json', JSON.stringify(plan, null, 2))

          return {
            ok: true,
            findingId,
            status,
            remainingCount: remaining.length,
            message: remaining.length === 0
              ? 'All audit tasks completed!'
              : `${remaining.length} finding(s) remaining. Next: ${remaining[0].id} (${remaining[0].severity}) — ${remaining[0].title}`,
          }
        } catch {
          return { ok: false, error: 'Failed to parse audit plan' }
        }
      },
    }),
  }
}
