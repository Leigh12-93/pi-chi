import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const RADIO_DB = '/home/pi/ai-radio/radio.db'

async function query(sql: string): Promise<unknown[]> {
  try {
    const escaped = sql.replace(/"/g, '\\"')
    const { stdout } = await execAsync(
      `sqlite3 -json "${RADIO_DB}" "${escaped}"`,
      { timeout: 5000 }
    )
    return stdout.trim() ? JSON.parse(stdout.trim()) : []
  } catch {
    return []
  }
}

// GET /api/radio/library?tab=tracks|clips|schedule|stats|questions|injections
export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get('tab') || 'stats'
  const genre = req.nextUrl.searchParams.get('genre')
  const clipType = req.nextUrl.searchParams.get('clipType')
  const limit = Math.min(parseInt(req.nextUrl.searchParams.get('limit') || '50'), 200)

  try {
    switch (tab) {
      case 'stats': {
        const [trackStats, clipStats, recentPlays, totalTracks, totalClips, schedule] = await Promise.all([
          query(`SELECT genre, COUNT(*) as count, ROUND(SUM(duration_secs)/3600, 1) as hours FROM tracks WHERE active=1 GROUP BY genre ORDER BY count DESC`),
          query(`SELECT clip_type, COUNT(*) as count FROM dj_clips WHERE active=1 GROUP BY clip_type ORDER BY count DESC`),
          query(`SELECT item_type, genre, played_at FROM playback_log ORDER BY played_at DESC LIMIT 20`),
          query(`SELECT COUNT(*) as total FROM tracks WHERE active=1`),
          query(`SELECT COUNT(*) as total FROM dj_clips WHERE active=1`),
          query(`SELECT * FROM schedule ORDER BY hour_start`),
        ])
        return NextResponse.json({ trackStats, clipStats, recentPlays, totalTracks, totalClips, schedule })
      }

      case 'tracks': {
        const where = genre ? `AND genre='${genre.replace(/'/g, "''")}'` : ''
        const tracks = await query(
          `SELECT id, genre, title, file_path, duration_secs, bpm, play_count, last_played_at, rating, created_at FROM tracks WHERE active=1 ${where} ORDER BY play_count ASC, last_played_at ASC NULLS FIRST LIMIT ${limit}`
        )
        const genres = await query(`SELECT DISTINCT genre FROM tracks WHERE active=1 ORDER BY genre`)
        return NextResponse.json({ tracks, genres })
      }

      case 'clips': {
        const where = clipType ? `AND clip_type='${clipType.replace(/'/g, "''")}'` : ''
        const clips = await query(
          `SELECT id, clip_type, file_path, text_content, duration_secs, voice, play_count, created_at FROM dj_clips WHERE active=1 ${where} ORDER BY clip_type, play_count ASC LIMIT ${limit}`
        )
        const types = await query(`SELECT DISTINCT clip_type FROM dj_clips WHERE active=1 ORDER BY clip_type`)
        return NextResponse.json({ clips, types })
      }

      case 'schedule': {
        const schedule = await query(`SELECT * FROM schedule ORDER BY hour_start`)
        return NextResponse.json({ schedule })
      }

      case 'questions': {
        const questions = await query(
          `SELECT id, name, question, status, answer_text, submitted_at, answered_at FROM listener_questions ORDER BY submitted_at DESC LIMIT ${limit}`
        )
        const pending = await query(`SELECT COUNT(*) as count FROM listener_questions WHERE status='pending'`)
        return NextResponse.json({ questions, pending })
      }

      case 'injections': {
        const injections = await query(
          `SELECT * FROM injection_queue ORDER BY inserted_at DESC LIMIT ${limit}`
        )
        const pending = await query(`SELECT COUNT(*) as count FROM injection_queue WHERE status='pending'`)
        return NextResponse.json({ injections, pending })
      }

      default:
        return NextResponse.json({ error: 'Unknown tab' }, { status: 400 })
    }
  } catch (error) {
    return NextResponse.json({ error: 'Database query failed' }, { status: 500 })
  }
}
