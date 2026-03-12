import { NextRequest, NextResponse } from 'next/server'
import {
  createV0Sandbox,
  syncV0Files,
  destroyV0Sandbox,
  getV0SandboxStatus,
  getV0SandboxStats,
  isV0SandboxConfigured,
} from '@/lib/v0-sandbox'
import { sandboxLimiter, sandboxSyncLimiter } from '@/lib/rate-limit'
import { getSession } from '@/lib/auth'
import { supabaseFetch } from '@/lib/supabase-fetch'

const MAX_BODY = 8 << 20 // 8MB request body guard

/** Validate all file values are strings (not objects, nulls, etc.) */
function validateFileValues(files: Record<string, unknown>): files is Record<string, string> {
  for (const [_key, val] of Object.entries(files)) {
    if (typeof val !== 'string') {
      return false
    }
  }
  return true
}

/** Verify the authenticated user owns the project */
async function verifyOwnership(projectId: string, username: string): Promise<boolean> {
  const check = await supabaseFetch(`/forge_projects?id=eq.${encodeURIComponent(projectId)}&github_username=eq.${encodeURIComponent(username)}&select=id&limit=1`)
  return check.ok && Array.isArray(check.data) && check.data.length > 0
}

/** Timed JSON response wrapper — adds X-Duration-Ms header */
function timedJson(data: unknown, init: { status?: number; headers?: Record<string, string> } = {}, startMs: number) {
  const duration = Date.now() - startMs
  return NextResponse.json(data, {
    ...init,
    headers: { ...init.headers, 'X-Duration-Ms': String(duration) },
  })
}

// POST /api/sandbox — Create sandbox with project files
export async function POST(req: NextRequest) {
  const start = Date.now()
  const session = await getSession()
  if (!session?.user) {
    return timedJson({ error: 'Authentication required' }, { status: 401 }, start)
  }
  try {
    // Rate limit — 5 sandbox creations/minute per IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const limit = sandboxLimiter(ip)
    if (!limit.ok) {
      return timedJson(
        { error: 'Rate limited. Too many sandbox requests.', retryAfter: Math.ceil(limit.resetIn / 1000) },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.resetIn / 1000)) } },
        start,
      )
    }

    // Content-length guard
    const contentLength = parseInt(req.headers.get('content-length') || '0', 10)
    if (contentLength > MAX_BODY) {
      return timedJson(
        { error: `Request too large (${(contentLength / 1024 / 1024).toFixed(1)}MB). Max ${MAX_BODY / 1024 / 1024}MB.` },
        { status: 413 },
        start,
      )
    }

    const { projectId, files } = await req.json()

    if (!projectId || typeof projectId !== 'string') {
      return timedJson({ error: 'projectId (string) is required' }, { status: 400 }, start)
    }
    if (!files || typeof files !== 'object' || Array.isArray(files)) {
      return timedJson({ error: 'files (Record<string, string>) is required' }, { status: 400 }, start)
    }
    if (!validateFileValues(files)) {
      return timedJson({ error: 'All file values must be strings' }, { status: 400 }, start)
    }

    const fileCount = Object.keys(files).length
    if (fileCount === 0) {
      return timedJson({ error: 'No files provided' }, { status: 400 }, start)
    }

    if (!await verifyOwnership(projectId, session.githubUsername)) {
      return timedJson({ error: 'Project not found or access denied' }, { status: 403 }, start)
    }
    if (!isV0SandboxConfigured()) {
      return timedJson(
        { error: 'v0 Sandbox not configured. Set V0_API_KEY environment variable.' },
        { status: 503 },
        start,
      )
    }

    const result = await createV0Sandbox(projectId, files)
    return timedJson(result, {}, start)
  } catch (error) {
    return timedJson(
      { error: error instanceof Error ? error.message : 'Failed to create sandbox' },
      { status: 500 },
      start,
    )
  }
}

// GET /api/sandbox?projectId=xxx — Get sandbox status
// GET /api/sandbox?check=true — Check if v0 Sandbox is configured
// GET /api/sandbox?stats=true — Get aggregate session stats
export async function GET(req: NextRequest) {
  // Auth required for all sandbox queries
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const check = req.nextUrl.searchParams.get('check')
  if (check) {
    return NextResponse.json({ available: isV0SandboxConfigured() })
  }

  const stats = req.nextUrl.searchParams.get('stats')
  if (stats) {
    return NextResponse.json(getV0SandboxStats())
  }

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  // Verify ownership before revealing sandbox status
  if (!await verifyOwnership(projectId, session.githubUsername)) {
    return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 })
  }

  const status = getV0SandboxStatus(projectId)
  if (!status) {
    return NextResponse.json({ active: false })
  }

  return NextResponse.json({ active: true, ...status })
}

// PUT /api/sandbox — Sync files to running sandbox
export async function PUT(req: NextRequest) {
  const start = Date.now()
  const session = await getSession()
  if (!session?.user) {
    return timedJson({ error: 'Authentication required' }, { status: 401 }, start)
  }
  try {
    // Rate limit sync — 20/minute per IP (higher than create since it's debounced)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const limit = sandboxSyncLimiter(ip)
    if (!limit.ok) {
      return timedJson(
        { error: 'Rate limited. Too many sync requests.', retryAfter: Math.ceil(limit.resetIn / 1000) },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.resetIn / 1000)) } },
        start,
      )
    }

    const { projectId, files } = await req.json()

    if (!projectId || typeof projectId !== 'string') {
      return timedJson({ error: 'projectId (string) is required' }, { status: 400 }, start)
    }
    if (!files || typeof files !== 'object' || Array.isArray(files)) {
      return timedJson({ error: 'files (Record<string, string>) is required' }, { status: 400 }, start)
    }
    if (!validateFileValues(files)) {
      return timedJson({ error: 'All file values must be strings' }, { status: 400 }, start)
    }
    if (!await verifyOwnership(projectId, session.githubUsername)) {
      return timedJson({ error: 'Project not found or access denied' }, { status: 403 }, start)
    }

    const result = await syncV0Files(projectId, files)
    return timedJson(result, {}, start)
  } catch (error) {
    return timedJson(
      { error: error instanceof Error ? error.message : 'Failed to sync files' },
      { status: 500 },
      start,
    )
  }
}

// DELETE /api/sandbox — Destroy sandbox
export async function DELETE(req: NextRequest) {
  const session = await getSession()
  if (!session?.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  try {
    // Safe body parsing — DELETE might have empty body
    let projectId: string | undefined
    try {
      const body = await req.json()
      projectId = body?.projectId
    } catch (err) {
      console.error('[sandbox] DELETE parse body failed:', err instanceof Error ? err.message : err)
      return NextResponse.json({ error: 'projectId is required (JSON body)' }, { status: 400 })
    }

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    }
    if (!await verifyOwnership(projectId, session.githubUsername)) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 })
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
