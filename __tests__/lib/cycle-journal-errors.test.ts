import { describe, expect, it } from 'vitest'
import { extractJournalErrors } from '@/lib/brain/cycle-journal-errors'

describe('extractJournalErrors', () => {
  it('ignores prompt instruction lines that mention errors', () => {
    const output = [
      '- **claude_code** — YOUR MOST POWERFUL TOOL. Full Claude Code CLI agent. Multi-file edits, new features, build error fixing. 10-min timeout, 40 tool calls.',
      'USE for: multi-file changes, new features/pages/APIs, build error fixing, complex refactors.',
      'Deploy = git commit + push (Vercel auto-builds). NEVER run npm run build locally (OOM).',
      'activity, thought, error, success',
      'python3 ~/display_log.py error "" "Build failed: missing export"',
    ].join('\n')

    expect(extractJournalErrors(output)).toEqual([])
  })

  it('keeps real runtime and stderr-style failures', () => {
    const output = [
      'API Error: Request timed out. Check your internet connection and proxy settings',
      'Starting inspector on 127.0.0.1:9229 failed: address already in use',
      'Error: Cannot find module ./missing-file',
      'npm ERR! code ENOENT',
    ].join('\n')

    expect(extractJournalErrors(output)).toEqual([
      'API Error: Request timed out. Check your internet connection and proxy settings',
      'Starting inspector on 127.0.0.1:9229 failed: address already in use',
      'Error: Cannot find module ./missing-file',
      'npm ERR! code ENOENT',
    ])
  })
})
