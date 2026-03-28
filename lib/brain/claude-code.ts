import type { ExecuteResult } from '@/lib/tools/terminal-tools'
import { executeCommand } from '@/lib/tools/terminal-tools'

export interface ClaudeCodeAuthStatus {
  available: boolean
  authMethod: string | null
  subscriptionType: string | null
  isMaxOAuth: boolean
  raw: string
}

interface RunClaudeCodeOptions {
  promptPath: string
  cwd: string
  maxTurns: number
  timeoutSeconds: number
  killAfterSeconds?: number
  liveLogPath?: string
}

function parseClaudeAuthStatus(raw: string): ClaudeCodeAuthStatus {
  const trimmed = raw.trim()
  let authMethod: string | null = null
  let subscriptionType: string | null = null

  try {
    const parsed = JSON.parse(trimmed) as {
      authMethod?: string
      subscriptionType?: string
    }
    authMethod = parsed.authMethod ?? null
    subscriptionType = parsed.subscriptionType ?? null
  } catch {
    authMethod = trimmed.match(/authMethod["']?\s*[:=]\s*["']?([^\s,"'}]+)/i)?.[1] ?? null
    subscriptionType = trimmed.match(/subscriptionType["']?\s*[:=]\s*["']?([^\s,"'}]+)/i)?.[1] ?? null
    if (!subscriptionType && /\bmax\b/i.test(trimmed)) subscriptionType = 'max'
    if (!authMethod && /(claude\.ai|oauth)/i.test(trimmed)) authMethod = 'claude.ai'
  }

  const auth = (authMethod || '').toLowerCase()
  const sub = (subscriptionType || '').toLowerCase()
  return {
    available: Boolean(trimmed),
    authMethod,
    subscriptionType,
    // If authMethod is claude.ai/oauth, that's sufficient — they're on the subscription.
    // subscriptionType may be unavailable in subprocess environments.
    isMaxOAuth: auth.includes('claude.ai') || auth.includes('oauth') || sub === 'max',
    raw: trimmed,
  }
}

export async function getClaudeCodeAuthStatus(): Promise<ClaudeCodeAuthStatus> {
  const result = await executeCommand(
    'claude auth status 2>/dev/null',
    { timeout: 15_000 },
  )

  const raw = `${result.stdout || ''}\n${result.stderr || ''}`.trim()

  // Fallback: if CLI returned nothing, check credentials file directly
  if (!raw) {
    try {
      const { readFileSync } = await import('node:fs')
      const { homedir } = await import('node:os')
      const { join } = await import('node:path')
      const credsPath = join(homedir(), '.claude', '.credentials.json')
      const creds = JSON.parse(readFileSync(credsPath, 'utf8'))
      if (creds.claudeAiOauth) {
        return {
          available: true,
          authMethod: 'claude.ai',
          subscriptionType: 'max',
          isMaxOAuth: true,
          raw: 'credentials-file-fallback',
        }
      }
    } catch { /* no creds file */ }
  }

  return parseClaudeAuthStatus(raw)
}

export async function ensureClaudeCodeMaxOAuth(): Promise<ClaudeCodeAuthStatus> {
  const status = await getClaudeCodeAuthStatus()
  if (!status.available) {
    throw new Error('Claude Code auth status unavailable. Run `claude auth login` with the Max account first.')
  }
  if (!status.isMaxOAuth) {
    throw new Error(
      `Claude Code must use the claude.ai Max OAuth account, not API keys. Current auth: ${status.authMethod || 'unknown'} / ${status.subscriptionType || 'unknown'}`,
    )
  }
  return status
}

function getEnvUnsets(): string {
  return [
    'ANTHROPIC_API_KEY',
    'ANTHROPIC_AUTH_TOKEN',
    'ANTHROPIC_BASE_URL',
    'ANTHROPIC_MODEL',
  ].map(name => `-u ${name}`).join(' ')
}

export function buildClaudeCodeCommand({
  promptPath,
  maxTurns,
  timeoutSeconds,
  killAfterSeconds = 30,
  liveLogPath,
}: RunClaudeCodeOptions): string {
  const base = `env ${getEnvUnsets()} claude -p - --output-format text --dangerously-skip-permissions --max-turns ${maxTurns}`
  const pipeline = `cat "${promptPath}" | timeout --kill-after=${killAfterSeconds} ${timeoutSeconds} ${base}`

  if (!liveLogPath) {
    return `${pipeline} 2>&1`
  }

  return [
    `echo '=== Claude Code started at '$(date)' ===' > "${liveLogPath}"`,
    `${pipeline} 2>&1 | tee -a "${liveLogPath}"`,
    `echo '=== Claude Code finished at '$(date)' (exit: '$?') ===' >> "${liveLogPath}"`,
  ].join(' && ')
}

export async function runClaudeCodePrompt(options: RunClaudeCodeOptions): Promise<ExecuteResult> {
  await ensureClaudeCodeMaxOAuth()
  const command = buildClaudeCodeCommand(options)
  // Strip all --inspect* flags from NODE_OPTIONS — --inspect-port=0 crashes Claude Code silently
  const cleanNodeOptions = (process.env.NODE_OPTIONS || '')
    .split(/\s+/)
    .filter(t => t && !/^--inspect/.test(t))
    .join(' ')
    .trim()

  const env: Record<string, string> = {
    ANTHROPIC_API_KEY: '',
    ANTHROPIC_AUTH_TOKEN: '',
    ANTHROPIC_BASE_URL: '',
    ANTHROPIC_MODEL: '',
  }
  if (cleanNodeOptions) env.NODE_OPTIONS = cleanNodeOptions
  else env.NODE_OPTIONS = ''

  return executeCommand(command, {
    cwd: options.cwd,
    timeout: (options.timeoutSeconds + 60) * 1000,
    env,
  })
}

// ── Parallel Runner ──────────────────────────────────────────────
// Spawn multiple Claude Code instances concurrently for independent tasks.
// Each gets its own prompt file and runs in parallel. Results collected.

export interface ParallelTask {
  name: string
  prompt: string
  cwd?: string
  maxTurns?: number
  timeoutSeconds?: number
}

export interface ParallelResult {
  name: string
  success: boolean
  output: string
  exitCode: number
  durationMs: number
}

export async function runClaudeCodeParallel(
  tasks: ParallelTask[],
  defaults?: { cwd?: string; maxTurns?: number; timeoutSeconds?: number },
): Promise<ParallelResult[]> {
  if (tasks.length === 0) return []

  await ensureClaudeCodeMaxOAuth()

  const { writeFileSync, unlinkSync } = await import('node:fs')
  const { join } = await import('node:path')
  const { randomUUID } = await import('node:crypto')
  const stateDir = join(process.env.HOME || '/home/pi', '.pi-chi')

  const promises = tasks.map(async (task): Promise<ParallelResult> => {
    const start = Date.now()
    const promptPath = join(stateDir, `parallel-${randomUUID().slice(0, 8)}.txt`)

    try {
      writeFileSync(promptPath, task.prompt, 'utf-8')

      const result = await runClaudeCodePrompt({
        promptPath,
        cwd: task.cwd || defaults?.cwd || join(process.env.HOME || '/home/pi', 'pi-chi'),
        maxTurns: task.maxTurns || defaults?.maxTurns || 20,
        timeoutSeconds: task.timeoutSeconds || defaults?.timeoutSeconds || 180,
      })

      return {
        name: task.name,
        success: result.exitCode === 0,
        output: ((result.stdout || '') + '\n' + (result.stderr || '')).trim().slice(0, 3000),
        exitCode: result.exitCode ?? 1,
        durationMs: Date.now() - start,
      }
    } catch (err) {
      return {
        name: task.name,
        success: false,
        output: err instanceof Error ? err.message : String(err),
        exitCode: 1,
        durationMs: Date.now() - start,
      }
    } finally {
      try { unlinkSync(promptPath) } catch { /* */ }
    }
  })

  return Promise.all(promises)
}
