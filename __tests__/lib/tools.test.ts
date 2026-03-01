import { describe, it, expect } from 'vitest'
import { safeRegex, applySmartDefaults } from '@/lib/tools/file-tools'
import { PULLABLE_TEXT_EXTS, SKIP_DIRS, ALWAYS_INCLUDE } from '@/lib/tools/github-tools'
import { VirtualFS } from '@/lib/virtual-fs'

// ── safeRegex ──────────────────────────────────────────────────────

describe('safeRegex', () => {
  it('returns a RegExp for a valid pattern', () => {
    const result = safeRegex('hello')
    expect(result).toBeInstanceOf(RegExp)
  })

  it('returns error for an invalid pattern', () => {
    const result = safeRegex('[unclosed')
    expect(result).not.toBeInstanceOf(RegExp)
    expect((result as { error: string }).error).toContain('Invalid regex')
  })

  it('respects the flags parameter', () => {
    const result = safeRegex('test', 'gi')
    expect(result).toBeInstanceOf(RegExp)
    expect((result as RegExp).flags).toContain('g')
    expect((result as RegExp).flags).toContain('i')
  })

  it('defaults to case-insensitive flag', () => {
    const result = safeRegex('test')
    expect(result).toBeInstanceOf(RegExp)
    expect((result as RegExp).flags).toBe('i')
  })

  it('matches using the returned regex', () => {
    const result = safeRegex('foo\\d+')
    expect(result).toBeInstanceOf(RegExp)
    expect((result as RegExp).test('foo123')).toBe(true)
    expect((result as RegExp).test('bar')).toBe(false)
  })
})

// ── applySmartDefaults ─────────────────────────────────────────────

describe('applySmartDefaults', () => {
  it('auto-adds use client when hooks detected in tsx', () => {
    const code = 'import React from "react"\nconst [x, setX] = useState(0)'
    const { content, warnings } = applySmartDefaults('page.tsx', code)
    expect(content).toMatch(/^'use client'/)
    expect(warnings.some(w => w.includes('use client'))).toBe(true)
  })

  it('does not add use client if already present', () => {
    const code = "'use client'\nimport React from 'react'\nconst [x, setX] = useState(0)"
    const { content } = applySmartDefaults('page.tsx', code)
    // Should not have double directive
    expect(content.indexOf("'use client'")).toBe(0)
    expect(content.indexOf("'use client'", 1)).toBe(-1)
  })

  it('does not add use client for non-tsx files', () => {
    const code = 'const [x, setX] = useState(0)'
    const { content, warnings } = applySmartDefaults('utils.ts', code)
    expect(content).not.toContain("'use client'")
    expect(warnings).toHaveLength(0)
  })

  it('warns on img without alt in tsx', () => {
    const code = '<img src="/photo.jpg" />'
    const { warnings } = applySmartDefaults('page.tsx', code)
    expect(warnings.some(w => w.includes('alt'))).toBe(true)
  })

  it('does not warn on img with alt', () => {
    const code = '<img src="/photo.jpg" alt="A photo" />'
    const { warnings } = applySmartDefaults('page.tsx', code)
    expect(warnings.some(w => w.includes('alt'))).toBe(false)
  })

  it('warns on form without onSubmit in tsx', () => {
    const code = '<form><input /></form>'
    const { warnings } = applySmartDefaults('form.tsx', code)
    expect(warnings.some(w => w.includes('onSubmit'))).toBe(true)
  })

  it('does not warn on form with onSubmit', () => {
    const code = '<form onSubmit={handleSubmit}><input /></form>'
    const { warnings } = applySmartDefaults('form.tsx', code)
    expect(warnings.some(w => w.includes('onSubmit'))).toBe(false)
  })

  it('warns on invalid JSON for .json files', () => {
    const { warnings } = applySmartDefaults('config.json', '{invalid}')
    expect(warnings.some(w => w.includes('Invalid JSON'))).toBe(true)
  })

  it('does not warn on valid JSON', () => {
    const { warnings } = applySmartDefaults('config.json', '{"key": "value"}')
    expect(warnings.some(w => w.includes('Invalid JSON'))).toBe(false)
  })

  it('returns content unchanged for plain ts files', () => {
    const code = 'export const x = 1'
    const { content, warnings } = applySmartDefaults('utils.ts', code)
    expect(content).toBe(code)
    expect(warnings).toHaveLength(0)
  })
})

// ── GitHub tools constants ─────────────────────────────────────────

describe('PULLABLE_TEXT_EXTS', () => {
  it('is a Set', () => {
    expect(PULLABLE_TEXT_EXTS).toBeInstanceOf(Set)
  })

  it('contains common web extensions', () => {
    for (const ext of ['ts', 'tsx', 'js', 'jsx', 'json', 'css', 'html']) {
      expect(PULLABLE_TEXT_EXTS.has(ext)).toBe(true)
    }
  })

  it('contains markdown extensions', () => {
    expect(PULLABLE_TEXT_EXTS.has('md')).toBe(true)
    expect(PULLABLE_TEXT_EXTS.has('mdx')).toBe(true)
  })

  it('contains backend language extensions', () => {
    for (const ext of ['py', 'rb', 'go', 'rs', 'java', 'kt']) {
      expect(PULLABLE_TEXT_EXTS.has(ext)).toBe(true)
    }
  })

  it('does not contain binary extensions', () => {
    for (const ext of ['png', 'jpg', 'gif', 'woff2', 'mp4', 'zip', 'exe']) {
      expect(PULLABLE_TEXT_EXTS.has(ext)).toBe(false)
    }
  })
})

describe('SKIP_DIRS', () => {
  it('is a Set', () => {
    expect(SKIP_DIRS).toBeInstanceOf(Set)
  })

  it('contains common skip directories', () => {
    for (const dir of ['node_modules', '.git', '.next', 'dist']) {
      expect(SKIP_DIRS.has(dir)).toBe(true)
    }
  })

  it('contains build output directories', () => {
    expect(SKIP_DIRS.has('build')).toBe(true)
    expect(SKIP_DIRS.has('coverage')).toBe(true)
  })

  it('does not skip source directories', () => {
    for (const dir of ['src', 'lib', 'app', 'components', 'pages']) {
      expect(SKIP_DIRS.has(dir)).toBe(false)
    }
  })
})

describe('ALWAYS_INCLUDE', () => {
  it('is an array', () => {
    expect(Array.isArray(ALWAYS_INCLUDE)).toBe(true)
  })

  it('contains essential config files', () => {
    expect(ALWAYS_INCLUDE).toContain('Dockerfile')
    expect(ALWAYS_INCLUDE).toContain('Makefile')
    expect(ALWAYS_INCLUDE).toContain('.gitignore')
  })

  it('contains .env.example', () => {
    expect(ALWAYS_INCLUDE).toContain('.env.example')
  })
})

// ── VirtualFS edge cases (not covered in virtual-fs.test.ts) ───────

describe('VirtualFS edge cases', () => {
  it('handles empty file content', () => {
    const vfs = new VirtualFS()
    vfs.write('empty.ts', '')
    expect(vfs.read('empty.ts')).toBe('')
    expect(vfs.exists('empty.ts')).toBe(true)
  })

  it('handles very long file paths', () => {
    const longPath = 'a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z/file.ts'
    const vfs = new VirtualFS()
    vfs.write(longPath, 'content')
    expect(vfs.read(longPath)).toBe('content')
  })

  it('toRecord round-trip preserves all files', () => {
    const initial: Record<string, string> = {
      'src/a.ts': 'const a = 1',
      'src/b.tsx': 'export default function B() {}',
      'package.json': '{"name": "test"}',
    }
    const vfs = new VirtualFS(initial)
    const record = vfs.toRecord()
    expect(Object.keys(record).sort()).toEqual(Object.keys(initial).sort())
    for (const [key, value] of Object.entries(initial)) {
      expect(record[key]).toBe(value)
    }
  })

  it('toRecord round-trip creates identical VirtualFS', () => {
    const initial = { 'a.ts': 'one', 'b.ts': 'two' }
    const vfs1 = new VirtualFS(initial)
    const record = vfs1.toRecord()
    const vfs2 = new VirtualFS(record)
    expect(vfs2.toRecord()).toEqual(vfs1.toRecord())
  })

  it('concurrent writes to same path keeps last value', () => {
    const vfs = new VirtualFS()
    vfs.write('file.ts', 'version 1')
    vfs.write('file.ts', 'version 2')
    vfs.write('file.ts', 'version 3')
    expect(vfs.read('file.ts')).toBe('version 3')
  })

  it('list returns empty array for empty VirtualFS', () => {
    const vfs = new VirtualFS()
    expect(vfs.list()).toEqual([])
  })

  it('manifest returns correct size for empty content', () => {
    const vfs = new VirtualFS({ 'empty.ts': '' })
    const manifest = vfs.manifest()
    expect(manifest[0].size).toBe(0)
    expect(manifest[0].lines).toBe(1) // empty string split by \n = ['']
  })

  it('search returns empty array when no matches', () => {
    const vfs = new VirtualFS({ 'a.ts': 'hello world' })
    const results = vfs.search('zzzzz')
    expect(Array.isArray(results)).toBe(true)
    expect(results).toHaveLength(0)
  })

  it('search respects maxResults parameter', () => {
    const vfs = new VirtualFS({
      'a.ts': 'match\nmatch\nmatch\nmatch\nmatch',
    })
    const results = vfs.search('match', 2)
    expect(Array.isArray(results)).toBe(true)
    if (Array.isArray(results)) {
      expect(results.length).toBeLessThanOrEqual(2)
    }
  })

  it('delete returns false for non-existent file', () => {
    const vfs = new VirtualFS()
    expect(vfs.delete('nope.ts')).toBe(false)
  })

  it('exists returns false for traversal path', () => {
    const vfs = new VirtualFS({ 'secret.ts': 'data' })
    expect(vfs.exists('../secret.ts')).toBe(false)
  })

  it('write ignores null-byte paths', () => {
    const vfs = new VirtualFS()
    vfs.write('bad\0path.ts', 'content')
    expect(vfs.list()).toHaveLength(0)
  })
})
