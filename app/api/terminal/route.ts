// ═══════════════════════════════════════════════════════════════════
// Terminal API — execute commands on the host system
// Used by the xterm.js UI in Mission Control
// ═══════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from 'next/server'
import { executeCommand, isBlocked } from '@/lib/tools/terminal-tools'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    const { command, cwd, timeout } = await req.json()

    if (!command || typeof command !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing command', exitCode: -1, stdout: '', stderr: '' },
        { status: 400 }
      )
    }

    // Safety check
    const blocked = isBlocked(command)
    if (blocked) {
      return NextResponse.json(
        { success: false, error: blocked, exitCode: -1, stdout: '', stderr: '' },
        { status: 403 }
      )
    }

    const result = await executeCommand(command, {
      cwd: cwd || undefined,
      timeout: Math.min(timeout || 30000, 120000),
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        exitCode: -1,
        error: err instanceof Error ? err.message : 'Unknown error',
        stdout: '',
        stderr: '',
      },
      { status: 500 }
    )
  }
}
