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

// GET — current MPD status, or Icecast status if ?icecast=true
export async function GET(req: NextRequest) {
  const icecast = req.nextUrl.searchParams.get('icecast')

  if (icecast) {
    try {
      const res = await fetch('http://localhost:8000/status-json.xsl', { signal: AbortSignal.timeout(3000) })
      const data = await res.json()
      const source = data?.icestats?.source
      // source can be an array (multiple mounts) or single object
      const mount = Array.isArray(source) ? source[0] : source
      return NextResponse.json({
        title: mount?.title || 'Unknown',
        genre: mount?.genre || '',
        listeners: mount?.listeners || 0,
        bitrate: mount?.audio_bitrate || 192,
        online: true,
      })
    } catch {
      return NextResponse.json({ title: 'Offline', genre: '', listeners: 0, online: false })
    }
  }

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
