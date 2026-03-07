import { tool } from 'ai'
import { z } from 'zod'
import { mcpClient } from '@/lib/mcp-client'
import type { ToolContext } from './types'

export function createMcpTools(_ctx: ToolContext) {
  return {
    mcp_list_servers: tool({
      description: 'List all configured MCP servers and their connection status, plus available tools.',
      inputSchema: z.object({}),
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
      inputSchema: z.object({
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
      inputSchema: z.object({
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
