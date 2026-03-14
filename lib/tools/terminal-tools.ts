// ═══════════════════════════════════════════════════════════════════
// Terminal Tools — real shell command execution via child_process
// Adapted from forge-kit server terminal tools for Raspberry Pi
// ═══════════════════════════════════════════════════════════════════

import { tool } from 'ai'
import { z } from 'zod'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import type { ToolContext } from './types'

const execFileAsync = promisify(execFile)

// ── Constants ──────────────────────────────────────────────────────

/** Default command timeout (30 seconds) */
const DEFAULT_TIMEOUT = 30_000

/** Maximum output buffer (1 MB) */
const MAX_BUFFER = 1024 * 1024

/** Maximum output characters returned to the model */
const MAX_OUTPUT_CHARS = 50_000

// ── Safety patterns ────────────────────────────────────────────────

/** Commands that are ALWAYS blocked — catastrophically dangerous */
const BLOCKED_PATTERNS: RegExp[] = [
  /rm\s+(-rf?|--recursive)\s+\/\s*$/,   // rm -rf /
  /mkfs\./,                               // format filesystem
  /dd\s+if=.*of=\/dev\//,                 // disk destroy
  /:\(\)\{\s*:\|:&\s*\};\s*:/,            // fork bomb
  />\s*\/dev\/sd[a-z]/,                    // overwrite disk
  />\s*\/dev\/mmcblk/,                     // overwrite Pi SD card
  /chmod\s+-R\s+777\s+\//,                // chmod 777 /
  /curl.*\|\s*(bash|sh)/,                  // pipe to shell
  /wget.*\|\s*(bash|sh)/,                  // pipe to shell
  /sudo\s+passwd/,                        // change passwords
  /echo.*>\s*\/etc\/passwd/,              // modify system users
  /echo.*>\s*\/etc\/shadow/,              // modify passwords
  /flashrom.*-w/,                         // flash firmware
  /fdisk.*\/dev\//,                       // partition disks
  /cat\s+\/etc\/shadow/,                  // read shadow passwords
  /nc\s+-l/,                              // netcat listener
  /\bncat\b.*-l/,                         // ncat listener
  /\bsocat\b.*LISTEN/i,                   // socat listener
  /cat\s+.*\.ssh\/id_rsa/,               // read SSH private key
  /cat\s+.*\.ssh\/id_ed25519/,            // read SSH private key
  /crontab\s+-e/,                         // interactive crontab
  /\|\s*(bash|sh)\s*$/,                   // pipe to shell (generic)
]

/** Commands that are potentially dangerous — warn but allow */
const DANGEROUS_PATTERNS: RegExp[] = [
  /rm\s+(-rf?|--recursive)/,
  /git\s+(push|reset\s+--hard|clean\s+-f)/,
  /DROP\s+(TABLE|DATABASE)/i,
  /sudo\s/,
  /npm\s+publish/,
  /docker\s+(rm|stop|kill)/,
  /shutdown/,
  /reboot/,
  /halt/,
  /systemctl\s+(stop|disable|mask)/,
  /service\s+\w+\s+(stop|restart)/,
  /crontab\s+-r/,                        // remove all cron jobs
  /iptables.*-F/,                        // flush firewall rules
  /ufw\s+(disable|reset)/,               // disable firewall
  /raspi-config/,                        // system configuration
  /vcgencmd.*=.*=/,                      // modify GPU settings
  /echo.*>\s*\/boot/,                    // modify boot config
  /mount.*\/dev/,                        // mount filesystems
  /umount.*-f/,                          // force unmount
]

// ── Shell detection ────────────────────────────────────────────────

interface ShellConfig {
  shell: string
  flag: string
}

function detectShell(): ShellConfig {
  if (process.platform === 'win32') {
    return {
      shell: process.env['COMSPEC'] || 'cmd.exe',
      flag: '/c',
    }
  }

  return {
    shell: process.env['SHELL'] || '/bin/bash',
    flag: '-c',
  }
}

// ── Helpers ────────────────────────────────────────────────────────

export function isBlocked(command: string): string | null {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(command)) {
      return `Command blocked for safety: matches pattern ${pattern.source}`
    }
  }
  return null
}

export function getDangerWarnings(command: string): string[] {
  const warnings: string[] = []
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      warnings.push(`Warning: potentially dangerous pattern detected (${pattern.source})`)
    }
  }
  return warnings
}

function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output

  const half = Math.floor(MAX_OUTPUT_CHARS / 2)
  const truncated = output.length - MAX_OUTPUT_CHARS
  return (
    output.slice(0, half) +
    `\n\n... [${truncated} characters truncated] ...\n\n` +
    output.slice(-half)
  )
}

// ── Standalone executor (used by API route) ────────────────────────

export interface ExecuteResult {
  success: boolean
  exitCode: number
  stdout: string
  stderr: string
  cwd: string
  error?: string
  warnings?: string[]
}

export async function executeCommand(
  command: string,
  options?: { cwd?: string; timeout?: number; env?: Record<string, string> }
): Promise<ExecuteResult> {
  const shellConfig = detectShell()
  const resolvedCwd = options?.cwd ? resolve(options.cwd) : process.cwd()
  const commandTimeout = options?.timeout ?? DEFAULT_TIMEOUT

  // 1. Check for blocked commands
  const blocked = isBlocked(command)
  if (blocked) {
    return {
      success: false,
      exitCode: -1,
      error: blocked,
      stdout: '',
      stderr: '',
      cwd: resolvedCwd,
    }
  }

  // 2. Check for dangerous patterns
  const warnings = getDangerWarnings(command)

  // 3. Execute
  try {
    const result = await execFileAsync(
      shellConfig.shell,
      [shellConfig.flag, command],
      {
        cwd: resolvedCwd,
        timeout: commandTimeout,
        maxBuffer: MAX_BUFFER,
        env: { ...process.env, ...(options?.env || {}) },
        windowsHide: true,
      },
    )

    return {
      success: true,
      exitCode: 0,
      stdout: truncateOutput(result.stdout ?? ''),
      stderr: truncateOutput(result.stderr ?? ''),
      cwd: resolvedCwd,
      ...(warnings.length > 0 ? { warnings } : {}),
    }
  } catch (err: unknown) {
    const error = err as {
      code?: string | number
      killed?: boolean
      signal?: string
      stdout?: string
      stderr?: string
    }

    // Timeout
    if (error.killed || error.signal === 'SIGTERM') {
      return {
        success: false,
        exitCode: -1,
        error: `Command timed out after ${commandTimeout}ms`,
        stdout: truncateOutput(error.stdout ?? ''),
        stderr: truncateOutput(error.stderr ?? ''),
        cwd: resolvedCwd,
      }
    }

    // Non-zero exit code
    const exitCode = typeof error.code === 'number'
      ? error.code
      : ((err as Error).message?.match(/exit code (\d+)/)?.[1]
          ? parseInt((err as Error).message.match(/exit code (\d+)/)![1])
          : 1)

    return {
      success: false,
      exitCode,
      stdout: truncateOutput(error.stdout ?? ''),
      stderr: truncateOutput(error.stderr ?? ''),
      error: err instanceof Error ? err.message : String(err),
      cwd: resolvedCwd,
      ...(warnings.length > 0 ? { warnings } : {}),
    }
  }
}

// ── Tool factory (used by AI chat) ─────────────────────────────────

export function createTerminalTools(ctx: ToolContext) {
  return {
    /**
     * Execute a shell command on the system.
     * On Raspberry Pi, this gives full access to GPIO, system tools, etc.
     */
    execute_command: tool({
      description:
        'Execute a shell command on the system. Full access to the operating system — use for GPIO control, system monitoring, package management, process management, network operations, and any terminal task. Returns stdout, stderr, and exit code.',
      inputSchema: z.object({
        command: z.string().describe('The shell command to execute'),
        cwd: z.string().optional().describe('Working directory (defaults to home)'),
        timeout: z.number().optional().describe('Timeout in ms (default: 30000)'),
      }),
      execute: async ({ command, cwd, timeout }) => {
        const result = await executeCommand(command, {
          cwd,
          timeout,
          env: ctx.clientEnvVars,
        })
        return JSON.stringify(result)
      },
    }),

    /**
     * Read the output of a previously launched background task by ID.
     */
    read_terminal_output: tool({
      description:
        'Read the output of a previously executed command by task ID. Use this to check the result of background tasks.',
      inputSchema: z.object({
        taskId: z.string().describe('The task ID to check'),
      }),
      execute: async ({ taskId }) => {
        const status = ctx.taskStore.check(taskId)
        if (!status) return JSON.stringify({ error: 'Task not found', taskId })
        return JSON.stringify(status)
      },
    }),

    /**
     * Run a command in the background and get a task ID to check later.
     */
    run_background: tool({
      description:
        'Run a long-running command in the background. Returns a task ID that can be checked with read_terminal_output. Use for builds, installations, or any command that might take a while.',
      inputSchema: z.object({
        command: z.string().describe('The shell command to run in the background'),
        cwd: z.string().optional().describe('Working directory'),
      }),
      execute: async ({ command, cwd }) => {
        const blocked = isBlocked(command)
        if (blocked) {
          return JSON.stringify({ success: false, error: blocked })
        }

        const resolvedCwd = cwd ? resolve(cwd) : process.cwd()
        const taskId = `bg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

        // Launch via TaskStore — tracks the async operation
        ctx.taskStore.launch(taskId, () =>
          executeCommand(command, { cwd: resolvedCwd, timeout: 300_000 })
        )

        return JSON.stringify({
          success: true,
          taskId,
          message: `Command running in background. Use read_terminal_output("${taskId}") to check results.`,
        })
      },
    }),

    /**
     * Install packages via apt or pip.
     */
    install_package: tool({
      description:
        'Install system packages (apt) or Python packages (pip). Handles sudo automatically on Linux.',
      inputSchema: z.object({
        packages: z.string().describe('Space-separated package names'),
        manager: z.enum(['apt', 'pip', 'npm']).default('apt').describe('Package manager to use'),
        dev: z.boolean().optional().describe('Install as dev dependency (npm only)'),
      }),
      execute: async ({ packages, manager, dev }) => {
        let command: string
        switch (manager) {
          case 'apt':
            command = `sudo apt-get install -y ${packages}`
            break
          case 'pip':
            command = `pip3 install ${packages}`
            break
          case 'npm':
            command = `npm install ${dev ? '--save-dev ' : ''}${packages}`
            break
        }

        const result = await executeCommand(command, {
          timeout: 120_000, // 2 min for installs
          env: ctx.clientEnvVars,
        })
        return JSON.stringify(result)
      },
    }),
  }
}
