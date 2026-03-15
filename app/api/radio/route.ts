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

      // Try Icecast title, fall back to now_playing.txt
      let title = mount?.title || ''
      if (!title || title === 'Unknown') {
        try {
          const { stdout } = await run('cat /home/pi/ai-radio/now_playing.txt 2>/dev/null', { timeout: 2000 })
          title = stdout.trim() || 'Unknown'
        } catch { title = title || 'Unknown' }
      }

      // Clean up title: "genre - genre_20260316_001953" → "Genre - Track 1953"
      const clean = title.replace(/_\d{8}_\d{4}(\d{2})$/, ' #$1').replace(/_/g, ' ')
      const displayTitle = clean.split(' ').map((w: string) =>
        w.length > 1 ? w.charAt(0).toUpperCase() + w.slice(1) : w
      ).join(' ')

      return NextResponse.json({
        title: displayTitle,
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
