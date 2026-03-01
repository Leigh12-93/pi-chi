import { tool } from 'ai'
import { z } from 'zod'
import { mcpClient } from '@/lib/mcp-client'
import type { ToolContext } from './types'

export function createUtilityTools(ctx: ToolContext) {
  const { vfs, projectId, supabaseFetch } = ctx

  return {
    think: tool({
      description: 'Think through your approach before building. Use this for complex tasks (3+ files) to plan the file structure, component hierarchy, and implementation order.',
      parameters: z.object({
        plan: z.string().describe('Your step-by-step plan for implementing this task'),
        files: z.array(z.string()).describe('List of files you plan to create/modify'),
        approach: z.string().optional().describe('Key architectural decisions'),
      }),
      execute: async ({ plan, files, approach }) => ({
        acknowledged: true,
        plan,
        files,
        approach,
      }),
    }),

    suggest_improvement: tool({
      description: 'Log a tooling limitation, bug, or improvement suggestion. Use when you encounter something that blocks or slows your work.',
      parameters: z.object({
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

    request_env_vars: tool({
      description: 'Request environment variables from the user. Use this BEFORE deploying when the project needs API keys, secrets, or config values. The user will see inline input fields in the chat to enter their credentials. Call this whenever you detect process.env references that need real values.',
      parameters: z.object({
        variables: z.array(z.object({
          name: z.string().describe('Env var name, e.g. DATABASE_URL'),
          description: z.string().optional().describe('What this variable is for'),
          required: z.boolean().optional().describe('Whether this is required (default true)'),
        })).describe('List of environment variables needed'),
      }),
      execute: async ({ variables }) => {
        // Also scan VFS for any process.env references the AI may have missed
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
      parameters: z.object({}),
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

    mcp_list_servers: tool({
      description: 'List all configured MCP servers and their connection status, plus available tools.',
      parameters: z.object({}),
      execute: async () => {
        const servers = mcpClient.getServers()
        return {
          servers: servers.map(s => ({
            id: s.config.id,
            name: s.config.name,
            connected: s.connected,
            toolCount: s.tools.length,
            tools: s.tools.map(t => t.name),
            error: s.error,
          })),
        }
      },
    }),

    mcp_connect_server: tool({
      description: 'Add and connect to an MCP server. Discovers available tools automatically.',
      parameters: z.object({
        url: z.string().describe('MCP server HTTP endpoint URL'),
        name: z.string().describe('Display name for this server'),
        token: z.string().optional().describe('Bearer auth token (if required)'),
      }),
      execute: async ({ url, name, token }) => {
        const config = {
          id: `mcp-${Date.now()}`,
          name,
          description: '',
          url,
          enabled: true,
          tags: [] as string[],
          ...(token ? { auth: { type: 'bearer' as const, token } } : {}),
        }
        mcpClient.addServer(config)
        const state = await mcpClient.connect(config.id)
        return {
          ok: state.connected,
          serverId: config.id,
          tools: state.tools.map(t => ({ name: t.name, description: t.description })),
          error: state.error,
        }
      },
    }),

    mcp_call_tool: tool({
      description: 'Execute a tool on a connected MCP server. Use mcp_list_servers first to see available tools.',
      parameters: z.object({
        serverId: z.string().describe('ID of the connected MCP server'),
        tool: z.string().describe('Name of the tool to call'),
        args: z.record(z.unknown()).default({}).describe('Arguments to pass to the tool'),
      }),
      execute: async ({ serverId, tool: toolName, args }) => {
        try {
          const result = await mcpClient.callTool(serverId, toolName, args)
          return { ok: true, result }
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Tool call failed' }
        }
      },
    }),
  }
}
