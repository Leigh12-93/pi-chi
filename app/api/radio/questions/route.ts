import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

const RADIO_DB = '/home/pi/ai-radio/radio.db'

async function runSqlite(query: string, params: string[] = []): Promise<string> {
  // Build parameterized query (simple escaping for SQLite CLI)
  let sql = query
  for (const param of params) {
    const escaped = param.replace(/'/g, "''")
    sql = sql.replace('?', `'${escaped}'`)
  }

  try {
    const { stdout } = await execAsync(
      `sqlite3 -json "${RADIO_DB}" "${sql.replace(/"/g, '\\"')}"`,
      { timeout: 5000 }
    )
    return stdout.trim()
  } catch {
    return '[]'
  }
}

// GET — List recent questions
export async function GET() {
  try {
    const result = await runSqlite(
      `SELECT id, name, question, status, answer_text, submitted_at, answered_at
       FROM listener_questions
       ORDER BY submitted_at DESC
       LIMIT 20`
    )
    const questions = result ? JSON.parse(result) : []
    return NextResponse.json({ questions })
  } catch (error) {
    return NextResponse.json({ questions: [], error: 'Failed to fetch questions' })
  }
}

// POST — Submit a new question
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, question } = body

    if (!question || typeof question !== 'string' || question.trim().length < 3) {
      return NextResponse.json({ error: 'Question must be at least 3 characters' }, { status: 400 })
    }

    if (question.length > 500) {
      return NextResponse.json({ error: 'Question must be under 500 characters' }, { status: 400 })
    }

    const safeName = (name || 'Anonymous').slice(0, 50)
    const safeQuestion = question.trim().slice(0, 500)
    const now = new Date().toISOString()

    await runSqlite(
      `INSERT INTO listener_questions (name, question, source, submitted_at) VALUES (?, ?, 'web', ?)`,
      [safeName, safeQuestion, now]
    )

    return NextResponse.json({ success: true, message: 'Question submitted! It may be answered on air.' })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to submit question' }, { status: 500 })
  }
}
