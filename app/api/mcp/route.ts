import { NextRequest, NextResponse } from 'next/server'
import { mcpClient, type MCPServerConfig } from '@/lib/mcp-client'
import { MCP_SERVER_TEMPLATES, MCP_CATEGORIES } from '@/lib/mcp-registry'
import { getSession } from '@/lib/auth'

// GET /api/mcp — List configured servers, their status, and available templates
export async function GET() {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  const servers = mcpClient.getServers().map(s => ({
    id: s.config.id,
    name: s.config.name,
    description: s.config.description,
    url: s.config.url,
    enabled: s.config.enabled,
    connected: s.connected,
    tools: s.tools.map(t => ({ name: t.name, description: t.description })),
    error: s.error,
    tags: s.config.tags,
  }))

  return NextResponse.json({
    servers,
    templates: MCP_SERVER_TEMPLATES.map(t => ({
      id: t.id,
      name: t.name,
      description: t.description,
      urlPlaceholder: t.urlPlaceholder,
      authType: t.authType,
      authHint: t.authHint,
      tags: t.tags,
      docsUrl: t.docsUrl,
    })),
    categories: MCP_CATEGORIES,
  })
}

// POST /api/mcp — Add a server and optionally connect
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  try {
    const body = await req.json()
    const { url, name, token, tags, connect: autoConnect } = body

    if (!url || !name) {
      return NextResponse.json({ error: 'url and name are required' }, { status: 400 })
    }

    const config: MCPServerConfig = {
      id: `mcp-${Date.now()}`,
      name,
      description: body.description || '',
      url,
      enabled: true,
      tags: tags || [],
    }

    if (token) {
      config.auth = { type: 'bearer', token }
    }

    mcpClient.addServer(config)

    if (autoConnect !== false) {
      const state = await mcpClient.connect(config.id)
      return NextResponse.json({
        ok: true,
        server: {
          id: config.id,
          name: config.name,
          connected: state.connected,
          tools: state.tools.map(t => ({ name: t.name, description: t.description })),
          error: state.error,
        },
      })
    }

    return NextResponse.json({ ok: true, server: { id: config.id, name: config.name } })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add server' },
      { status: 500 },
    )
  }
}

// PUT /api/mcp — Connect or disconnect a server
export async function PUT(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  try {
    const { serverId, action } = await req.json()

    if (!serverId || !action) {
      return NextResponse.json({ error: 'serverId and action are required' }, { status: 400 })
    }

    if (action === 'connect') {
      const state = await mcpClient.connect(serverId)
      return NextResponse.json({
        ok: true,
        connected: state.connected,
        tools: state.tools.map(t => ({ name: t.name, description: t.description })),
        error: state.error,
      })
    }

    if (action === 'disconnect') {
      mcpClient.disconnect(serverId)
      return NextResponse.json({ ok: true, connected: false })
    }

    return NextResponse.json({ error: 'action must be connect or disconnect' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    )
  }
}

// DELETE /api/mcp — Remove a server
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  try {
    const { serverId } = await req.json()
    if (!serverId) {
      return NextResponse.json({ error: 'serverId is required' }, { status: 400 })
    }

    mcpClient.disconnect(serverId)
    mcpClient.removeServer(serverId)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed' },
      { status: 500 },
    )
  }
}
