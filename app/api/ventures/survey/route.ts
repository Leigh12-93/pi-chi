import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { answers, trade, location, email } = body

    if (!answers || typeof answers !== 'object') {
      return NextResponse.json({ error: 'Missing answers' }, { status: 400 })
    }

    // Store in Supabase — use a generic survey_responses table
    // If table doesn't exist, fall back to logging
    const record = {
      survey_id: 'tradie-analytics-v1',
      answers,
      trade: trade || null,
      location: location || null,
      email: email || null,
      created_at: new Date().toISOString(),
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
    }

    const { error } = await supabase
      .from('pi_survey_responses')
      .insert(record)

    if (error) {
      // Table might not exist yet — log and still return success
      console.error('[survey] Supabase insert failed:', error.message)
      // Fall back: write to local file
      const fs = await import('fs/promises')
      const logPath = '/home/pi/.pi-chi/survey-responses.jsonl'
      await fs.appendFile(logPath, JSON.stringify(record) + '\n')
      console.log('[survey] Wrote to local fallback:', logPath)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[survey] Error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
