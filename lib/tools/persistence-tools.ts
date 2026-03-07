import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'

export function createPersistenceTools(ctx: ToolContext) {
  const { vfs, projectId, supabaseFetch } = ctx

  return {
    request_env_vars: tool({
      description: 'Request environment variables from the user. Use this BEFORE deploying when the project needs API keys, secrets, or config values. The user will see inline input fields in the chat.',
      inputSchema: z.object({
        variables: z.array(z.object({
          name: z.string().describe('Env var name, e.g. DATABASE_URL'),
          description: z.string().optional().describe('What this variable is for'),
          required: z.boolean().optional().describe('Whether this is required (default true)'),
        })).describe('List of environment variables needed'),
      }),
      execute: async ({ variables }) => {
        const detected = new Set(variables.map(v => v.name))
        for (const [, content] of vfs.files) {
          const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)
          for (const match of matches) {
            if (!detected.has(match[1]) && !match[1].startsWith('NODE_') && match[1] !== 'NODE_ENV') {
              detected.add(match[1])
              variables.push({ name: match[1], description: `Detected in project source`, required: true })
            }
          }
        }
        return { variables, count: variables.length }
      },
    }),

    get_stored_env_vars: tool({
      description: `Load the user's stored global environment variables (API keys, secrets, tokens). These are pre-saved by the user in the Environment panel and encrypted at rest.

Use this tool:
- BEFORE deploying — auto-inject stored env vars into Vercel deployment
- When project needs API keys — check if the user already has them stored before asking
- To auto-populate .env files — write stored keys into project .env.local
- When connecting services — check for existing keys (STRIPE_SECRET_KEY, SUPABASE_URL, etc.)

Returns key names and values. NEVER expose values in chat — only reference by name.`,
      inputSchema: z.object({
        filter: z.string().optional().describe('Optional prefix filter, e.g. "STRIPE" to only get Stripe-related vars'),
      }),
      execute: async ({ filter }) => {
        if (!ctx.githubUsername) return { error: 'No authenticated user' }

        try {
          // Fetch from internal API — handles decryption of both credential columns and global_env_vars
          const columns = 'encrypted_supabase_url,encrypted_supabase_key,encrypted_api_key,encrypted_google_api_key,global_env_vars'
          const result = await supabaseFetch(
            `/forge_user_settings?github_username=eq.${encodeURIComponent(ctx.githubUsername)}&select=${columns}`,
          )

          if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) {
            return { variables: [], count: 0, message: 'No stored environment variables found. User can add them in the Environment sidebar panel.' }
          }

          const row = result.data[0] as Record<string, unknown>

          // Decrypt global_env_vars (encrypted JSON array)
          let variables: Array<{ key: string; value: string }> = []
          const rawEnvVars = row.global_env_vars as string | null
          if (rawEnvVars) {
            try {
              const { decryptToken } = await import('@/lib/auth')
              const decrypted = await decryptToken(rawEnvVars.replace(/^v1:/, ''))
              variables = JSON.parse(decrypted)
            } catch {
              try { variables = JSON.parse(rawEnvVars) } catch { /* skip */ }
            }
          }

          // Apply filter if provided
          if (filter) {
            const prefix = filter.toUpperCase()
            variables = variables.filter(v => v.key.toUpperCase().includes(prefix))
          }

          return {
            variables: variables.map(v => ({ key: v.key, value: v.value })),
            count: variables.length,
            message: variables.length > 0
              ? `Found ${variables.length} stored env var(s): ${variables.map(v => v.key).join(', ')}`
              : 'No matching stored environment variables. User can add them in the Environment sidebar panel.',
          }
        } catch (err) {
          return { error: `Failed to load stored env vars: ${err instanceof Error ? err.message : String(err)}` }
        }
      },
    }),

    load_chat_history: tool({
      description: 'Load previous chat messages for this project from the database.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!projectId) return { error: 'No project ID available' }

        const result = await supabaseFetch(`/forge_chat_messages?project_id=eq.${projectId}&order=created_at.asc&limit=100`)
        if (!result.ok) return { error: `Failed to load chat history: ${JSON.stringify(result.data)}` }

        const messages = Array.isArray(result.data) ? result.data : []
        return {
          messages: messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            tool_invocations: msg.tool_invocations,
            created_at: msg.created_at,
          })),
          count: messages.length
        }
      },
    }),

    save_memory: tool({
      description: 'Save a project insight to persistent memory. Memory persists across sessions for this project. Max 5KB total per project.',
      inputSchema: z.object({
        key: z.string().describe('Memory key (e.g., "framework", "conventions", "known_issues")'),
        value: z.string().describe('The value to remember'),
      }),
      execute: async ({ key, value }) => {
        if (!projectId) return { error: 'Cannot save memory without a project' }

        const getResult = await supabaseFetch(`/forge_projects?id=eq.${projectId}&select=memory`)
        if (!getResult.ok) return { error: 'Failed to load project memory' }
        const existing = (Array.isArray(getResult.data) && getResult.data[0]?.memory) || {}
        const memory = typeof existing === 'object' ? { ...existing } : {}

        memory[key] = value
        const serialized = JSON.stringify(memory)
        if (serialized.length > 5120) {
          return { error: `Memory would exceed 5KB limit (${serialized.length} bytes). Remove some entries first.` }
        }

        const saveResult = await supabaseFetch(`/forge_projects?id=eq.${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memory }),
        })
        if (!saveResult.ok) return { error: `Failed to save memory: ${JSON.stringify(saveResult.data)}` }
        return { ok: true, key, value, totalKeys: Object.keys(memory).length, sizeBytes: serialized.length }
      },
    }),

    load_memory: tool({
      description: 'Load all saved memory entries for this project.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!projectId) return { error: 'Cannot load memory without a project' }

        const result = await supabaseFetch(`/forge_projects?id=eq.${projectId}&select=memory`)
        if (!result.ok) return { error: 'Failed to load project memory' }
        const memory = (Array.isArray(result.data) && result.data[0]?.memory) || {}
        const keys = typeof memory === 'object' ? Object.keys(memory) : []
        return {
          memory: typeof memory === 'object' ? memory : {},
          count: keys.length,
          message: keys.length === 0
            ? 'No memory saved for this project yet.'
            : `Loaded ${keys.length} memory entries: ${keys.join(', ')}`,
        }
      },
    }),

    connect_service: tool({
      description: `Prompt the user to connect an external service by showing an inline card with input fields. Use this when the user needs to set up credentials for a service, or when you detect that a service is needed but not configured.

Supported services:
- "stripe" — Stripe payment processing (secret key + optional publishable key, webhook secret)
- "supabase" — Supabase database (project URL + service role key)
- "anthropic" — Anthropic API (API key starting with sk-ant-)
- "vercel" — Vercel deployment (deploy token)
- "google" — Google Cloud (API key starting with AIza)
- "github" — GitHub OAuth (shows sign-in button)
- "aussiesms" — AussieSMS gateway (API key for SMS/OTP)

You can also provide custom fields to collect any credentials not covered by the defaults.`,
      inputSchema: z.object({
        service: z.enum(['stripe', 'supabase', 'anthropic', 'vercel', 'google', 'github', 'aussiesms']).describe('Which service to connect'),
        message: z.string().optional().describe('Custom message to show above the connection form'),
        fields: z.array(z.object({
          name: z.string().describe('Display label for the field'),
          key: z.string().describe('API settings key (e.g. stripeSecretKey)'),
          placeholder: z.string().optional(),
          required: z.boolean().optional(),
          sensitive: z.boolean().optional(),
        })).optional().describe('Override default fields with custom ones'),
      }),
      execute: async ({ service, message, fields }) => {
        return {
          __connect_gate: true,
          service,
          message: message || undefined,
          fields: fields || undefined,
        }
      },
    }),

    save_preference: tool({
      description: 'Save a learned user preference for future sessions. Preferences persist across projects.',
      inputSchema: z.object({
        key: z.string().describe('Preference key'),
        value: z.string().describe('The preference value or description'),
      }),
      execute: async ({ key, value }) => {
        if (!ctx.projectId) return { error: 'Cannot save preferences without a session' }

        const result = await supabaseFetch('/forge_user_preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            github_username: ctx.githubUsername || 'unknown',
            preference_key: key,
            preference_value: value,
            updated_at: new Date().toISOString(),
          }),
        })
        if (!result.ok) return { error: `Failed to save preference: ${JSON.stringify(result.data)}` }
        return { saved: true, key, value }
      },
    }),

    load_preferences: tool({
      description: 'Load all saved user preferences.',
      inputSchema: z.object({}),
      execute: async () => {
        const result = await supabaseFetch(`/forge_user_preferences?github_username=eq.${encodeURIComponent(ctx.githubUsername || 'unknown')}&order=updated_at.desc`)
        if (!result.ok) return { error: `Failed to load preferences: ${JSON.stringify(result.data)}` }
        const prefs = Array.isArray(result.data) ? result.data : []
        if (prefs.length === 0) return { preferences: [], message: 'No saved preferences yet. Learn and save them as you work.' }
        return {
          preferences: prefs.map((p: any) => ({
            key: p.preference_key,
            value: p.preference_value,
            updated: p.updated_at,
          })),
          message: `Loaded ${prefs.length} preference(s). Apply these to your outputs.`,
        }
      },
    }),
  }
}
