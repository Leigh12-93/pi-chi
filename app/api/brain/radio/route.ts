/* ─── Pi Frequency Radio API ─────────────────────────────── */

import { NextResponse } from 'next/server'
import { readFile } from 'node:fs/promises'
import { execSync } from 'node:child_process'

export const dynamic = 'force-dynamic'

const RADIO_DB = '/home/pi/ai-radio/radio.db'
const NOW_PLAYING = '/home/pi/ai-radio/now_playing.txt'
const MUSIC_DIR = '/home/pi/ai-radio/content/music'

function query(sql: string): string {
  try {
    return execSync(
      `python3 -c "import sqlite3,json;c=sqlite3.connect('${RADIO_DB}');c.row_factory=sqlite3.Row;r=c.execute('''${sql}''').fetchall();print(json.dumps([dict(row) for row in r]))"`,
      { timeout: 5000, encoding: 'utf-8' },
    ).trim()
  } catch {
    return '[]'
  }
}

function execSql(sql: string): string {
  try {
    return execSync(
      `python3 -c "import sqlite3;c=sqlite3.connect('${RADIO_DB}');c.execute('''${sql}''');c.commit();print('ok')"`,
      { timeout: 5000, encoding: 'utf-8' },
    ).trim()
  } catch (err) {
    return `error: ${err}`
  }
}

export async function GET() {
  try {
    // Now playing
    let nowPlaying = ''
    try {
      nowPlaying = (await readFile(NOW_PLAYING, 'utf-8')).trim()
    } catch { /* file may not exist */ }

    // Icecast status
    let icecast: Record<string, unknown> | null = null
    try {
      const res = await fetch('http://localhost:8000/status-json.xsl', {
        signal: AbortSignal.timeout(3000),
      })
      if (res.ok) {
        const raw = await res.json()
        const src = raw?.icestats?.source
        // source can be an array or single object
        const stream = Array.isArray(src) ? src[0] : src
        if (stream) {
          icecast = {
            listeners: stream.listeners ?? 0,
            listenerPeak: stream.listener_peak ?? 0,
            bitrate: stream.bitrate ?? stream.ice_bitrate ?? 0,
            genre: stream.genre ?? '',
            title: stream.title ?? '',
            streamStart: stream.stream_start ?? '',
            serverName: stream.server_name ?? 'Pi Frequency',
          }
        }
      }
    } catch { /* icecast may be down */ }

    // Genres from filesystem
    let genres: string[] = []
    try {
      const out = execSync(`ls -1 "${MUSIC_DIR}" 2>/dev/null || true`, {
        encoding: 'utf-8',
        timeout: 3000,
      }).trim()
      genres = out.split('\n').filter(Boolean).sort()
    } catch { /* */ }

    // Track counts per genre
    const trackCountsRaw = JSON.parse(
      query('SELECT genre, COUNT(*) as count FROM tracks WHERE active=1 GROUP BY genre ORDER BY genre'),
    ) as { genre: string; count: number }[]
    const trackCounts: Record<string, number> = {}
    for (const row of trackCountsRaw) {
      trackCounts[row.genre] = row.count
    }

    // Recent history
    const recentHistory = JSON.parse(
      query(`SELECT p.id, p.track_id, p.item_type, p.played_at, p.genre, t.title, t.file_path
             FROM playback_log p LEFT JOIN tracks t ON p.track_id = t.id
             ORDER BY p.id DESC LIMIT 20`),
    )

    // Schedule
    const schedule = JSON.parse(
      query('SELECT id, hour_start, hour_end, genre, day_of_week, priority FROM schedule ORDER BY hour_start'),
    )

    // All tracks (for library)
    const tracks = JSON.parse(
      query('SELECT id, genre, title, file_path, duration_secs, play_count, last_played_at, rating FROM tracks WHERE active=1 ORDER BY genre, title, file_path'),
    )

    // Total track count
    const totalRaw = JSON.parse(query('SELECT COUNT(*) as total FROM tracks WHERE active=1'))
    const totalTracks = totalRaw[0]?.total ?? 0

    return NextResponse.json(
      { nowPlaying, icecast, genres, trackCounts, totalTracks, recentHistory, schedule, tracks },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to load radio data', detail: String(err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { action } = body

    switch (action) {
      case 'skip': {
        // Kill current ffmpeg process so stream.sh advances
        try {
          execSync('pkill -f "ffmpeg.*icecast" || true', { timeout: 5000 })
        } catch { /* may already be dead */ }
        return NextResponse.json(
          { ok: true, message: 'Skipped current track' },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      }

      case 'set-genre': {
        const genre = body.genre as string
        if (!genre) {
          return NextResponse.json(
            { error: 'Missing genre' },
            { status: 400, headers: { 'Cache-Control': 'no-store' } },
          )
        }
        const now = new Date().toISOString()
        const result = execSql(
          `INSERT INTO injection_queue (item_type, text_content, source, priority, inserted_at, status) VALUES ('genre_switch', '${genre.replace(/'/g, "''")}', 'dashboard', 200, '${now}', 'pending')`,
        )
        return NextResponse.json(
          { ok: result === 'ok', message: `Genre switch to ${genre} queued` },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      }

      case 'inject-track': {
        const trackId = body.trackId as number
        if (!trackId) {
          return NextResponse.json(
            { error: 'Missing trackId' },
            { status: 400, headers: { 'Cache-Control': 'no-store' } },
          )
        }
        // Get the track file path
        const trackRaw = JSON.parse(query(`SELECT file_path FROM tracks WHERE id=${trackId}`))
        if (!trackRaw.length) {
          return NextResponse.json(
            { error: 'Track not found' },
            { status: 404, headers: { 'Cache-Control': 'no-store' } },
          )
        }
        const filePath = trackRaw[0].file_path
        const now = new Date().toISOString()
        const result = execSql(
          `INSERT INTO injection_queue (item_type, file_path, source, priority, inserted_at, status) VALUES ('track', '${filePath.replace(/'/g, "''")}', 'dashboard', 200, '${now}', 'pending')`,
        )
        return NextResponse.json(
          { ok: result === 'ok', message: `Track ${trackId} queued` },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      }

      case 'update-schedule': {
        const hour = body.hour as number
        const genre = body.genre as string
        if (hour === undefined || !genre) {
          return NextResponse.json(
            { error: 'Missing hour or genre' },
            { status: 400, headers: { 'Cache-Control': 'no-store' } },
          )
        }
        // Update schedule: find the slot containing this hour and update genre
        const result = execSql(
          `UPDATE schedule SET genre='${genre.replace(/'/g, "''")}' WHERE hour_start=${hour}`,
        )
        return NextResponse.json(
          { ok: result === 'ok', message: `Schedule updated: ${hour}:00 = ${genre}` },
          { headers: { 'Cache-Control': 'no-store' } },
        )
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400, headers: { 'Cache-Control': 'no-store' } },
        )
    }
  } catch (err) {
    return NextResponse.json(
      { error: 'Radio action failed', detail: String(err) },
      { status: 500, headers: { 'Cache-Control': 'no-store' } },
    )
  }
}
