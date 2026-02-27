import { NextRequest, NextResponse } from 'next/server'
import { mcpManager } from '@/lib/mcp-client'
import { MCP_SERVER_REGISTRY, getServersByTag, getRecommendedServers } from '@/lib/mcp-registry'

// GET /api/mcp - List available MCP servers and their status
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const tag = searchParams.get('tag')
  const recommended = searchParams.get('recommended') === 'true'

  try {
    let servers
    
    if (recommended) {
      servers = getRecommendedServers()
    } else if (tag) {
      servers = getServersByTag(tag)
    } else {
      servers = mcpManager.getServers()
    }

    // Add connection status to each server
    const serversWithStatus = await Promise.all(
      servers.map(async (server) => {
        const isConnected = await mcpManager.checkServerHealth(server.id)
        return {
          ...server,
          connected: isConnected,
          tools: mcpManager.getAvailableTools().filter(tool => tool.serverId === server.id)
        }
      })
    )

    return NextResponse.json({
      servers: serversWithStatus,
      registry: Object.keys(MCP_SERVER_REGISTRY)
    })
  } catch (error) {
    console.error('Error listing MCP servers:', error)
    return NextResponse.json(
      { error: 'Failed to list MCP servers' },
      { status: 500 }
    )
  }
}

// POST /api/mcp - Add or update MCP server configuration
export async function POST(req: NextRequest) {
  try {
    const config = await req.json()
    
    // Validate required fields
    if (!config.id || !config.name || !config.endpoint) {
      return NextResponse.json(
        { error: 'Missing required fields: id, name, endpoint' },
        { status: 400 }
      )
    }

    mcpManager.addServer(config)
    
    return NextResponse.json({ 
      success: true, 
      message: `Server ${config.name} configured successfully` 
    })
  } catch (error) {
    console.error('Error configuring MCP server:', error)
    return NextResponse.json(
      { error: 'Failed to configure MCP server' },
      { status: 500 }
    )
  }
}

// PUT /api/mcp/[serverId]/connect - Connect to an MCP server
export async function PUT(req: NextRequest) {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/')
  const serverId = pathParts[pathParts.length - 2] // Get serverId from path
  const action = pathParts[pathParts.length - 1] // Get action (connect/disconnect)

  if (!serverId) {
    return NextResponse.json(
      { error: 'Server ID is required' },
      { status: 400 }
    )
  }

  try {
    if (action === 'connect') {
      const success = await mcpManager.connectServer(serverId)
      if (success) {
        const tools = mcpManager.getAvailableTools().filter(tool => tool.serverId === serverId)
        return NextResponse.json({ 
          success: true, 
          message: `Connected to ${serverId}`,
          tools: tools.map(tool => ({
            name: tool.name,
            description: tool.description
          }))
        })
      } else {
        return NextResponse.json(
          { error: `Failed to connect to ${serverId}` },
          { status: 500 }
        )
      }
    } else if (action === 'disconnect') {
      await mcpManager.disconnectServer(serverId)
      return NextResponse.json({ 
        success: true, 
        message: `Disconnected from ${serverId}` 
      })
    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use connect or disconnect' },
        { status: 400 }
      )
    }
  } catch (error) {
    console.error(`Error ${action}ing MCP server ${serverId}:`, error)
    return NextResponse.json(
      { error: `Failed to ${action} MCP server` },
      { status: 500 }
    )
  }
}

// DELETE /api/mcp/[serverId] - Remove MCP server configuration
export async function DELETE(req: NextRequest) {
  const url = new URL(req.url)
  const serverId = url.pathname.split('/').pop()

  if (!serverId) {
    return NextResponse.json(
      { error: 'Server ID is required' },
      { status: 400 }
    )
  }

  try {
    mcpManager.removeServer(serverId)
    return NextResponse.json({ 
      success: true, 
      message: `Server ${serverId} removed successfully` 
    })
  } catch (error) {
    console.error(`Error removing MCP server ${serverId}:`, error)
    return NextResponse.json(
      { error: 'Failed to remove MCP server' },
      { status: 500 }
    )
  }
}