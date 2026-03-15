import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const run = promisify(exec)

async function mpc(cmd: string): Promise<string> {
  try {
    const { stdout } = await run(`mpc ${cmd}`, { timeout: 5000 })
    return stdout.trim()
  } catch (e: unknown) {
    const err = e as { stderr?: string; message?: string }
    return err.stderr || err.message || 'error'
  }
}

// GET — current MPD status
export async function GET() {
  const status = await mpc('status')
  const current = await mpc('current')

  const isPlaying = status.includes('[playing]')
  const volumeMatch = status.match(/volume:\s*(\d+)/)
  const volume = volumeMatch ? parseInt(volumeMatch[1]) : 50

  return NextResponse.json({ playing: isPlaying, current, volume, raw: status })
}

// POST — control MPD
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, url, volume } = body as {
    action: 'play' | 'stop' | 'volume'
    url?: string
    volume?: number
  }

  switch (action) {
    case 'play': {
      if (!url) return NextResponse.json({ error: 'url required' }, { status: 400 })
      await mpc('clear')
      await mpc(`add "${url}"`)
      const result = await mpc('play')
      return NextResponse.json({ ok: true, result })
    }
    case 'stop': {
      await mpc('stop')
      await mpc('clear')
      return NextResponse.json({ ok: true })
    }
    case 'volume': {
      if (volume === undefined) return NextResponse.json({ error: 'volume required' }, { status: 400 })
      const clamped = Math.max(0, Math.min(100, Math.round(volume)))
      await mpc(`volume ${clamped}`)
      return NextResponse.json({ ok: true, volume: clamped })
    }
    default:
      return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  }
}
