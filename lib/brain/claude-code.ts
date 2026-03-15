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
    'claude auth status --output json 2>/dev/null || claude auth status --json 2>/dev/null || claude auth status 2>/dev/null',
    { timeout: 15_000 },
  )

  const raw = `${result.stdout || ''}\n${result.stderr || ''}`.trim()
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
  return executeCommand(command, {
    cwd: options.cwd,
    timeout: (options.timeoutSeconds + 60) * 1000,
    env: {
      ANTHROPIC_API_KEY: '',
      ANTHROPIC_AUTH_TOKEN: '',
      ANTHROPIC_BASE_URL: '',
      ANTHROPIC_MODEL: '',
    },
  })
}
