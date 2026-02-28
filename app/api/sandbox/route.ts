import { NextRequest, NextResponse } from 'next/server'
import {
  createV0Sandbox,
  syncV0Files,
  destroyV0Sandbox,
  getV0SandboxStatus,
  isV0SandboxConfigured,
} from '@/lib/v0-sandbox'
import { sandboxLimiter } from '@/lib/rate-limit'

// POST /api/sandbox — Create sandbox with project files
export async function POST(req: NextRequest) {
  try {
    // Rate limit — 5 sandbox creations/minute per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const limit = sandboxLimiter(ip)
    if (!limit.ok) {
      return NextResponse.json(
        { error: 'Rate limited. Too many sandbox requests.' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.resetIn / 1000)) } },
      )
    }

    const { projectId, files } = await req.json()

    if (!projectId || !files) {
      return NextResponse.json({ error: 'projectId and files are required' }, { status: 400 })
    }

    if (!isV0SandboxConfigured()) {
      return NextResponse.json(
        { error: 'v0 Sandbox not configured. Set V0_API_KEY environment variable.' },
        { status: 503 },
      )
    }

    const result = await createV0Sandbox(projectId, files)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create sandbox' },
      { status: 500 },
    )
  }
}

// GET /api/sandbox?projectId=xxx — Get sandbox status
// GET /api/sandbox?check=true — Check if v0 Sandbox is configured
export async function GET(req: NextRequest) {
  const check = req.nextUrl.searchParams.get('check')
  if (check) {
    return NextResponse.json({ available: isV0SandboxConfigured() })
  }

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const status = getV0SandboxStatus(projectId)
  if (!status) {
    return NextResponse.json({ active: false })
  }

  return NextResponse.json({ active: true, ...status })
}

// PUT /api/sandbox — Sync files to running sandbox
export async function PUT(req: NextRequest) {
  try {
    const { projectId, files } = await req.json()

    if (!projectId || !files) {
      return NextResponse.json({ error: 'projectId and files are required' }, { status: 400 })
    }

    const result = await syncV0Files(projectId, files)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to sync files' },
      { status: 500 },
    )
  }
}

// DELETE /api/sandbox — Destroy sandbox
export async function DELETE(req: NextRequest) {
  try {
    const { projectId } = await req.json()
    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }

    const result = await destroyV0Sandbox(projectId)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to destroy sandbox' },
      { status: 500 },
    )
  }
}
