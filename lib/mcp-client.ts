/**
 * Lightweight MCP Client for Forge
 *
 * Speaks MCP protocol over HTTP (Streamable HTTP transport) using fetch().
 * No external SDK needed — works on Vercel serverless.
 *
 * MCP Streamable HTTP = JSON-RPC 2.0 over POST requests.
 * Reference: https://modelcontextprotocol.io/docs/concepts/transports#streamable-http
 */

import { z } from 'zod'

// ─── Types ──────────────────────────────────────────────────────────

export interface MCPServerConfig {
  id: string
  name: string
  description: string
  url: string                // Base URL of the MCP server's HTTP endpoint
  auth?: {
    type: 'bearer' | 'header'
    token?: string
    headerName?: string      // Custom header name (e.g. 'x-api-key')
    headerValue?: string
  }
  enabled: boolean
  tags: string[]
}

export interface MCPToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>  // JSON Schema from the server
}

export interface MCPServerState {
  config: MCPServerConfig
  connected: boolean
  tools: MCPToolDef[]
  error?: string
}

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id: number
  method: string
  params?: Record<string, unknown>
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: any
  error?: { code: number; message: string; data?: any }
}

// ─── MCP Client ─────────────────────────────────────────────────────

export class MCPClient {
  private servers = new Map<string, MCPServerState>()
  private requestId = 0

  /** Send a JSON-RPC request to an MCP server */
  private async rpc(config: MCPServerConfig, method: string, params?: Record<string, unknown>): Promise<any> {
    const body: JsonRpcRequest = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      ...(params ? { params } : {}),
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    if (config.auth) {
      if (config.auth.type === 'bearer' && config.auth.token) {
        headers['Authorization'] = `Bearer ${config.auth.token}`
      } else if (config.auth.type === 'header' && config.auth.headerName && config.auth.headerValue) {
        headers[config.auth.headerName] = config.auth.headerValue
      }
    }

    const res = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      throw new Error(`MCP server ${config.id} returned ${res.status}: ${res.statusText}`)
    }

    const contentType = res.headers.get('content-type') || ''

    // Handle JSON response (standard Streamable HTTP)
    if (contentType.includes('application/json')) {
      const json: JsonRpcResponse = await res.json()
      if (json.error) {
        throw new Error(`MCP error ${json.error.code}: ${json.error.message}`)
      }
      return json.result
    }

    // Handle SSE response (some servers send SSE for long-running tools)
    if (contentType.includes('text/event-stream')) {
      const text = await res.text()
      const lines = text.split('\n')
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const json: JsonRpcResponse = JSON.parse(line.slice(6))
            if (json.error) throw new Error(`MCP error ${json.error.code}: ${json.error.message}`)
            return json.result
          } catch { /* skip non-JSON lines */ }
        }
      }
      throw new Error('No valid JSON-RPC response in SSE stream')
    }

    throw new Error(`Unexpected content type: ${contentType}`)
  }

  /** Add a server configuration */
  addServer(config: MCPServerConfig): void {
    this.servers.set(config.id, {
      config,
      connected: false,
      tools: [],
    })
  }

  /** Remove a server */
  removeServer(id: string): void {
    this.servers.delete(id)
  }

  /** Connect to a server — initializes and discovers tools */
  async connect(serverId: string): Promise<MCPServerState> {
    const state = this.servers.get(serverId)
    if (!state) throw new Error(`Server ${serverId} not configured`)

    try {
      // 1. Initialize the connection
      await this.rpc(state.config, 'initialize', {
        protocolVersion: '2025-03-26',
        capabilities: {},
        clientInfo: { name: 'forge', version: '1.0.0' },
      })

      // 2. Send initialized notification (no response expected, but we send via RPC)
      try {
        await this.rpc(state.config, 'notifications/initialized', {})
      } catch {
        // Some servers don't respond to notifications — that's OK
      }

      // 3. Discover available tools
      const toolsResult = await this.rpc(state.config, 'tools/list', {})
      const tools: MCPToolDef[] = (toolsResult?.tools || []).map((t: any) => ({
        name: t.name,
        description: t.description || '',
        inputSchema: t.inputSchema || {},
      }))

      state.connected = true
      state.tools = tools
      state.error = undefined
      return state
    } catch (err) {
      state.connected = false
      state.tools = []
      state.error = err instanceof Error ? err.message : 'Connection failed'
      return state
    }
  }

  /** Disconnect from a server */
  disconnect(serverId: string): void {
    const state = this.servers.get(serverId)
    if (state) {
      state.connected = false
      state.tools = []
    }
  }

  /** Execute a tool on a connected server */
  async callTool(serverId: string, toolName: string, args: Record<string, unknown>): Promise<any> {
    const state = this.servers.get(serverId)
    if (!state) throw new Error(`Server ${serverId} not configured`)
    if (!state.connected) throw new Error(`Server ${serverId} not connected`)

    const result = await this.rpc(state.config, 'tools/call', {
      name: toolName,
      arguments: args,
    })

    // MCP tools return content array — extract text content
    if (result?.content && Array.isArray(result.content)) {
      const textParts = result.content
        .filter((c: any) => c.type === 'text')
        .map((c: any) => c.text)
      if (textParts.length === 1) return textParts[0]
      if (textParts.length > 1) return textParts.join('\n')
      // If no text content, return the raw result
      return result.content[0]
    }

    return result
  }

  /** Get all configured servers with their state */
  getServers(): MCPServerState[] {
    return Array.from(this.servers.values())
  }

  /** Get a specific server state */
  getServer(id: string): MCPServerState | undefined {
    return this.servers.get(id)
  }

  /** Get all tools from all connected servers */
  getAllTools(): Array<MCPToolDef & { serverId: string }> {
    const tools: Array<MCPToolDef & { serverId: string }> = []
    for (const [serverId, state] of this.servers) {
      if (state.connected) {
        for (const tool of state.tools) {
          tools.push({ ...tool, serverId })
        }
      }
    }
    return tools
  }

  /** Connect to all enabled servers */
  async connectAll(): Promise<MCPServerState[]> {
    const results: MCPServerState[] = []
    for (const [_, state] of this.servers) {
      if (state.config.enabled) {
        results.push(await this.connect(state.config.id))
      }
    }
    return results
  }
}

// ─── Singleton ──────────────────────────────────────────────────────

// Note: On Vercel serverless, this resets per invocation.
// For persistent connections, servers need to be re-connected per request.
// In practice, MCP HTTP servers are stateless per-request anyway.
export const mcpClient = new MCPClient()
