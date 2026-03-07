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
