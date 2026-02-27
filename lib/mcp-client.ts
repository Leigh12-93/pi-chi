import { Client } from '@modelcontextprotocol/client'
import { z } from 'zod'

// MCP Server Configuration
export interface MCPServerConfig {
  id: string
  name: string
  description: string
  endpoint: string
  transport: 'http' | 'stdio' | 'websocket'
  auth?: {
    type: 'bearer' | 'basic' | 'api-key'
    token?: string
    username?: string
    password?: string
    apiKey?: string
    header?: string
  }
  enabled: boolean
  tags: string[]
}

// MCP Tool Definition
export interface MCPTool {
  serverId: string
  name: string
  description: string
  inputSchema: z.ZodSchema
  handler: (args: any) => Promise<any>
}

// MCP Client Manager
export class MCPClientManager {
  private clients = new Map<string, Client>()
  private tools = new Map<string, MCPTool>()
  private servers: MCPServerConfig[] = []

  constructor() {
    // Initialize with default servers
    this.servers = [
      {
        id: 'supabase-local',
        name: 'Supabase Local',
        description: 'Local Supabase database operations',
        endpoint: 'http://localhost:54321/functions/v1/mcp-server/mcp',
        transport: 'http',
        enabled: false,
        tags: ['database', 'supabase']
      },
      {
        id: 'filesystem',
        name: 'Filesystem',
        description: 'File system operations beyond basic read/write',
        endpoint: 'stdio://filesystem-mcp',
        transport: 'stdio',
        enabled: false,
        tags: ['filesystem', 'files']
      },
      {
        id: 'git',
        name: 'Git Operations',
        description: 'Advanced Git operations and repository management',
        endpoint: 'stdio://git-mcp',
        transport: 'stdio',
        enabled: false,
        tags: ['git', 'version-control']
      }
    ]
  }

  // Get all configured servers
  getServers(): MCPServerConfig[] {
    return [...this.servers]
  }

  // Add or update server configuration
  addServer(config: MCPServerConfig): void {
    const index = this.servers.findIndex(s => s.id === config.id)
    if (index >= 0) {
      this.servers[index] = config
    } else {
      this.servers.push(config)
    }
  }

  // Remove server configuration
  removeServer(serverId: string): void {
    this.servers = this.servers.filter(s => s.id !== serverId)
    this.disconnectServer(serverId)
  }

  // Connect to an MCP server
  async connectServer(serverId: string): Promise<boolean> {
    const config = this.servers.find(s => s.id === serverId)
    if (!config || !config.enabled) {
      return false
    }

    try {
      let client: Client

      if (config.transport === 'http') {
        // HTTP transport
        const { HttpTransport } = await import('@modelcontextprotocol/client')
        const transport = new HttpTransport(config.endpoint)
        client = new Client({ transport })
      } else if (config.transport === 'stdio') {
        // STDIO transport (for local MCP servers)
        const { StdioTransport } = await import('@modelcontextprotocol/client')
        const transport = new StdioTransport({
          command: config.endpoint.replace('stdio://', ''),
          args: []
        })
        client = new Client({ transport })
      } else {
        throw new Error(`Unsupported transport: ${config.transport}`)
      }

      // Connect and initialize
      await client.connect()
      
      // Get available tools from the server
      const toolsResponse = await client.request({
        method: 'tools/list',
        params: {}
      })

      // Register tools from this server
      if (toolsResponse.tools) {
        for (const tool of toolsResponse.tools) {
          const mcpTool: MCPTool = {
            serverId,
            name: tool.name,
            description: tool.description || '',
            inputSchema: z.object(tool.inputSchema?.properties || {}),
            handler: async (args: any) => {
              return await client.request({
                method: 'tools/call',
                params: {
                  name: tool.name,
                  arguments: args
                }
              })
            }
          }
          this.tools.set(`${serverId}:${tool.name}`, mcpTool)
        }
      }

      this.clients.set(serverId, client)
      return true
    } catch (error) {
      console.error(`Failed to connect to MCP server ${serverId}:`, error)
      return false
    }
  }

  // Disconnect from an MCP server
  async disconnectServer(serverId: string): Promise<void> {
    const client = this.clients.get(serverId)
    if (client) {
      try {
        await client.disconnect()
      } catch (error) {
        console.error(`Error disconnecting from ${serverId}:`, error)
      }
      this.clients.delete(serverId)
    }

    // Remove tools from this server
    for (const [key] of this.tools) {
      if (key.startsWith(`${serverId}:`)) {
        this.tools.delete(key)
      }
    }
  }

  // Get all available tools from connected servers
  getAvailableTools(): MCPTool[] {
    return Array.from(this.tools.values())
  }

  // Get a specific tool
  getTool(serverId: string, toolName: string): MCPTool | undefined {
    return this.tools.get(`${serverId}:${toolName}`)
  }

  // Execute a tool
  async executeTool(serverId: string, toolName: string, args: any): Promise<any> {
    const tool = this.getTool(serverId, toolName)
    if (!tool) {
      throw new Error(`Tool ${toolName} not found on server ${serverId}`)
    }

    return await tool.handler(args)
  }

  // Connect to all enabled servers
  async connectAllServers(): Promise<void> {
    const enabledServers = this.servers.filter(s => s.enabled)
    await Promise.allSettled(
      enabledServers.map(server => this.connectServer(server.id))
    )
  }

  // Disconnect from all servers
  async disconnectAllServers(): Promise<void> {
    await Promise.allSettled(
      Array.from(this.clients.keys()).map(serverId => this.disconnectServer(serverId))
    )
  }

  // Health check for a server
  async checkServerHealth(serverId: string): Promise<boolean> {
    const client = this.clients.get(serverId)
    if (!client) return false

    try {
      await client.request({
        method: 'ping',
        params: {}
      })
      return true
    } catch {
      return false
    }
  }
}

// Global MCP client manager instance
export const mcpManager = new MCPClientManager()