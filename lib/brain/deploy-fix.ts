/* ─── Pi-Chi Deploy Fix — Auto-Fix Types, Build, Deps, Runtime ── */

import { executeCommand } from '@/lib/tools/terminal-tools'
import { runClaudeCodePrompt } from './claude-code'
import { getStateDir } from './brain-state'
import { writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import type { BrainState } from './brain-types'
import type { FixAttempt, DeployConfig } from './deploy-types'

// ── Type error fix (via Claude Code) ─────────────────────────────

/** Fix TypeScript type errors surgically via Claude Code */
export async function fixTypeErrors(
  _state: BrainState,
  errors: string,
  attempt: number,
  maxAttempts: number,
  cwd: string,
): Promise<FixAttempt> {
  const start = Date.now()
  const fixPromptPath = join(getStateDir(), `fix-prompt-${Date.now()}.txt`)

  const prompt = [
    'You are fixing TypeScript build errors in the Pi-Chi codebase at ~/pi-chi.',
    'The following `tsc --noEmit` errors must be fixed. Do NOT regenerate or rewrite files from scratch.',
    'Make surgical, minimal fixes to the specific lines mentioned in the errors.',
    'Read the failing files first, understand the context, then apply targeted fixes.',
    '',
    '=== TypeScript Errors ===',
    errors,
    '',
    '=== Instructions ===',
    '1. Read each file mentioned in the errors above',
    '2. Fix ONLY the specific type errors — do not refactor, rename, or rewrite',
    '3. If a type/interface is missing, check brain-types.ts and agent-types.ts for the correct types',
    '4. If an import is wrong, fix the import path — do not delete the import',
    '5. After fixing, run: npx tsc --noEmit',
    '6. If errors remain, fix those too',
    '7. Do NOT run npm run build — just fix the type errors',
  ].join('\n')

  writeFileSync(fixPromptPath, prompt, 'utf-8')

  let outcome: FixAttempt['outcome'] = 'failed'
  try {
    const result = await runClaudeCodePrompt({
      promptPath: fixPromptPath,
      cwd,
      maxTurns: 15,
      timeoutSeconds: 120,
    })
    outcome = result.exitCode === 0 ? 'fixed' : 'failed'
    console.log(`[deploy-fix] Type fix attempt ${attempt} exit: ${result.exitCode}`)
  } catch (err) {
    outcome = 'crashed'
    console.error(`[deploy-fix] Type fix attempt ${attempt} crashed:`, err)
  } finally {
    try { unlinkSync(fixPromptPath) } catch { /* cleanup */ }
  }

  return {
    type: 'type-error',
    attempt,
    maxAttempts,
    errors: errors.slice(0, 500),
    outcome,
    durationMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  }
}

// ── Build error fix ──────────────────────────────────────────────

/** Fix build errors — handles missing modules, OOM, webpack errors */
export async function fixBuildErrors(
  _state: BrainState,
  errors: string,
  attempt: number,
  maxAttempts: number,
  cwd: string,
  config: DeployConfig,
): Promise<FixAttempt> {
  const start = Date.now()

  // Pattern 1: Missing module — auto-install
  const missingModule = errors.match(/Module not found:.*?['"]([@\w\-/]+)['"]/i)
    || errors.match(/Cannot find module ['"]([@\w\-/]+)['"]/i)
  if (missingModule) {
    const pkg = missingModule[1]
    console.log(`[deploy-fix] Missing module detected: ${pkg} — installing...`)
    const install = await executeCommand(`npm install ${pkg}`, { cwd, timeout: 60_000 })
    return {
      type: 'missing-dep',
      attempt, maxAttempts,
      errors: `Missing: ${pkg}`,
      outcome: install.exitCode === 0 ? 'fixed' : 'failed',
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    }
  }

  // Pattern 2: OOM — lower heap and retry
  const isOOM = /SIGKILL|JavaScript heap out of memory|ENOMEM/.test(errors)
  if (isOOM) {
    console.log('[deploy-fix] OOM detected — clearing caches and lowering heap...')
    await executeCommand('npm cache clean --force 2>/dev/null', { cwd, timeout: 30_000 }).catch(() => {})
    await executeCommand('sync && echo 3 | sudo tee /proc/sys/vm/drop_caches 2>/dev/null', { timeout: 5000 }).catch(() => {})
    // Lower heap size for retry (pipeline will use this)
    config.buildMaxHeapMb = Math.min(config.buildMaxHeapMb, 1024)
    return {
      type: 'build-error',
      attempt, maxAttempts,
      errors: 'OOM — cleared caches, lowered heap to 1024MB',
      outcome: 'partial', // Caller should retry build with lower heap
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    }
  }

  // Pattern 3: General build error — Claude Code fix
  const fixPromptPath = join(getStateDir(), `build-fix-${Date.now()}.txt`)
  const prompt = [
    'You are fixing a Next.js build error in the Pi-Chi codebase at ~/pi-chi.',
    'The build failed with the following output. Fix the root cause surgically.',
    '',
    '=== Build Error Output ===',
    errors.slice(0, 3000),
    '',
    '=== Instructions ===',
    '1. Read the failing file(s) mentioned in the error',
    '2. Fix ONLY the specific issue — do not refactor or rewrite',
    '3. Common fixes: wrong import paths, missing exports, syntax errors',
    '4. After fixing, run: npx tsc --noEmit (do NOT run npm run build)',
    '5. Do NOT delete files or remove features',
  ].join('\n')

  writeFileSync(fixPromptPath, prompt, 'utf-8')

  let outcome: FixAttempt['outcome'] = 'failed'
  try {
    const result = await runClaudeCodePrompt({
      promptPath: fixPromptPath,
      cwd,
      maxTurns: 15,
      timeoutSeconds: 120,
    })
    outcome = result.exitCode === 0 ? 'fixed' : 'failed'
  } catch {
    outcome = 'crashed'
  } finally {
    try { unlinkSync(fixPromptPath) } catch { /* cleanup */ }
  }

  return {
    type: 'build-error',
    attempt, maxAttempts,
    errors: errors.slice(0, 500),
    outcome,
    durationMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  }
}

// ── Missing dependency fix ───────────────────────────────────────

/** Auto-install missing dependencies detected in error output */
export async function fixMissingDependencies(
  errors: string,
  cwd: string,
): Promise<FixAttempt> {
  const start = Date.now()

  // Extract package names from error patterns
  const packages = new Set<string>()
  const patterns = [
    /Module not found:.*?['"]([@\w\-/]+)['"]/gi,
    /Cannot find module ['"]([@\w\-/]+)['"]/gi,
    /Could not resolve ['"]([@\w\-/]+)['"]/gi,
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(errors)) !== null) {
      const pkg = match[1]
      // Skip relative imports and node builtins
      if (!pkg.startsWith('.') && !pkg.startsWith('node:')) {
        packages.add(pkg.split('/').slice(0, pkg.startsWith('@') ? 2 : 1).join('/'))
      }
    }
  }

  if (packages.size === 0) {
    return {
      type: 'missing-dep',
      attempt: 1, maxAttempts: 1,
      errors: 'No missing packages detected',
      outcome: 'failed',
      durationMs: Date.now() - start,
      timestamp: new Date().toISOString(),
    }
  }

  const pkgList = [...packages].join(' ')
  console.log(`[deploy-fix] Installing missing packages: ${pkgList}`)
  const result = await executeCommand(`npm install ${pkgList}`, { cwd, timeout: 120_000 })

  return {
    type: 'missing-dep',
    attempt: 1, maxAttempts: 1,
    errors: `Installed: ${pkgList}`,
    outcome: result.exitCode === 0 ? 'fixed' : 'failed',
    durationMs: Date.now() - start,
    timestamp: new Date().toISOString(),
  }
}
