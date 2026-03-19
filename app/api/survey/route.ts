import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { appendFileSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'

const LOCAL_FILE = join(process.env.HOME || '/home/pi', '.pi-chi', 'survey-responses.json')

export async function POST(req: Request) {
  try {
    const body = await req.json()

    const response = {
      id: crypto.randomUUID(),
      answers: body,
      submitted_at: new Date().toISOString(),
      user_agent: req.headers.get('user-agent') || '',
    }

    let stored = false

    // Try Supabase first
    const { error: dbError } = await supabase
      .from('pi_survey_responses')
      .insert({
        answers: body,
        user_agent: response.user_agent,
      })

    if (dbError) {
      console.warn('[survey] Supabase insert failed:', dbError.message)
    } else {
      stored = true
    }

    // Also store locally on Pi (fallback / backup)
    try {
      appendFileSync(LOCAL_FILE, JSON.stringify(response) + '\n')
      stored = true
    } catch {
      // Not on Pi or /tmp not writable
    }

    if (!stored) {
      return NextResponse.json({ error: 'Storage unavailable' }, { status: 503 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }
}

export async function GET() {
  // Return response count for dashboard
  try {
    const { count } = await supabase
      .from('pi_survey_responses')
      .select('*', { count: 'exact', head: true })

    // Also check local file
    let localCount = 0
    try {
      if (existsSync(LOCAL_FILE)) {
        const lines = readFileSync(LOCAL_FILE, 'utf-8').trim().split('\n').filter(Boolean)
        localCount = lines.length
      }
    } catch { /* not on Pi */ }

    return NextResponse.json({
      supabase_count: count || 0,
      local_count: localCount,
      total: Math.max(count || 0, localCount),
    })
  } catch {
    return NextResponse.json({ total: 0 })
  }
}
