import { NextRequest, NextResponse } from 'next/server'
import {
  createSandbox,
  syncFiles,
  destroySandbox,
  getSandboxStatus,
  isVercelSandboxConfigured,
} from '@/lib/vercel-sandbox'
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

    const { projectId, files, framework } = await req.json()

    if (!projectId || !files) {
      return NextResponse.json({ error: 'projectId and files are required' }, { status: 400 })
    }

    if (!isVercelSandboxConfigured()) {
      return NextResponse.json(
        { error: 'Vercel Sandbox not configured. Run `vercel link && vercel env pull` for local dev.' },
        { status: 503 },
      )
    }

    const result = await createSandbox(projectId, files, framework)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create sandbox' },
      { status: 500 },
    )
  }
}

// GET /api/sandbox?projectId=xxx — Get sandbox status
// GET /api/sandbox?check=true — Check if Vercel Sandbox is configured
export async function GET(req: NextRequest) {
  const check = req.nextUrl.searchParams.get('check')
  if (check) {
    return NextResponse.json({ available: isVercelSandboxConfigured() })
  }

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const status = getSandboxStatus(projectId)
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

    const result = await syncFiles(projectId, files)
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

    const result = await destroySandbox(projectId)
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to destroy sandbox' },
      { status: 500 },
    )
  }
}
