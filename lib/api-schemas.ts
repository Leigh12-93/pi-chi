import { z } from 'zod'

// ── Shared primitives ──────────────────────────────────

export const uuidSchema = z.string().uuid()
export const filePathSchema = z.string()
  .min(1)
  .max(260)
  .refine(p => !p.includes('..') && !p.startsWith('/') && !p.startsWith('\\') && !/[<>:"|?*\x00-\x1f]/.test(p), {
    message: 'Invalid file path',
  })

// ── POST /api/projects ────────────────────────────────

export const createProjectSchema = z.object({
  name: z.string()
    .transform(s => s.trim())
    .pipe(z.string().min(1, 'Project name required').max(100, 'Project name too long (max 100 chars)'))
    .refine(n => /^[\w\s\-.()]+$/.test(n), { message: 'Project name contains invalid characters' }),
  description: z.string().max(500).optional().default(''),
  framework: z.enum(['nextjs', 'vite-react', 'static', 'react']).optional().default('nextjs'),
  github_repo_url: z.string().url().startsWith('https://github.com/').optional(),
})

// ── PUT /api/projects/[id] ────────────────────────────

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  framework: z.string().max(50).optional(),
  github_repo_url: z.string().url().optional(),
  vercel_url: z.string().url().optional(),
  memory: z.record(z.unknown()).optional(),
  files: z.record(filePathSchema, z.string()).optional(),
}).refine(
  body => {
    if (!body.files) return true
    const paths = Object.keys(body.files)
    if (paths.length > 500) return false
    let total = 0
    for (const v of Object.values(body.files)) {
      total += v.length
      if (total > 10 * 1024 * 1024) return false
    }
    return true
  },
  { message: 'Files exceed limits (max 500 files, 10MB total)' },
)

// ── POST /api/db/query ────────────────────────────────

export const dbQuerySchema = z.object({
  query: z.string().min(1, 'query is required').max(5000),
})

// ── POST /api/projects/[id]/connect ───────────────────

export const connectProjectSchema = z.object({
  github_repo_url: z.string().url().startsWith('https://github.com/').optional(),
  vercel_project_id: z.string().min(1).max(100).optional(),
}).refine(
  body => body.github_repo_url || body.vercel_project_id,
  { message: 'No connection parameters provided' },
)

// ── PUT /api/settings ─────────────────────────────────

export const updateSettingsSchema = z.object({
  apiKey: z.string().startsWith('sk-ant-').optional(),
  vercelToken: z.string().min(1).optional(),
  supabaseUrl: z.string().url().optional(),
  supabaseKey: z.string().startsWith('ey').optional(),
  supabaseAccessToken: z.string().min(1).optional(),
  preferredModel: z.string().max(100).optional(),
  preferences: z.record(z.unknown()).optional(),
  googleClientId: z.string().includes('.apps.googleusercontent.com').optional(),
  googleClientSecret: z.string().min(1).optional(),
  googleApiKey: z.string().startsWith('AIza').optional(),
  googleServiceAccount: z.union([z.string(), z.record(z.unknown())]).optional(),
  stripeSecretKey: z.string().regex(/^sk_(live|test)_/).optional(),
  stripePublishableKey: z.string().regex(/^pk_(live|test)_/).optional(),
  stripeWebhookSecret: z.string().startsWith('whsec_').optional(),
  aussieSmsApiKey: z.string().min(1).optional(),
  skipValidation: z.boolean().optional(),
})

// ── Utility: parse body with Zod schema ───────────────

export function parseBody<T>(schema: z.ZodType<T>, data: unknown): { data: T } | { error: string } {
  const result = schema.safeParse(data)
  if (!result.success) {
    const firstError = result.error.errors[0]
    return { error: firstError?.message || 'Invalid request body' }
  }
  return { data: result.data }
}
