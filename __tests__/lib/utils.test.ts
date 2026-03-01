import { describe, it, expect } from 'vitest'
import { cn, formatRelative, truncatePath, hashFileMap, hashFileMapDeep, getFileIcon, getLanguageFromPath } from '@/lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })
  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'visible')).toBe('base visible')
  })
  it('merges tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })
})

describe('formatRelative', () => {
  it('returns "Just now" for recent dates', () => {
    expect(formatRelative(new Date().toISOString())).toBe('Just now')
  })
  it('returns minutes ago', () => {
    const d = new Date(Date.now() - 5 * 60000).toISOString()
    expect(formatRelative(d)).toBe('5m ago')
  })
})

describe('truncatePath', () => {
  it('returns short paths unchanged', () => {
    expect(truncatePath('src/app.tsx')).toBe('src/app.tsx')
  })
  it('truncates long paths', () => {
    const long = 'very/deep/nested/path/to/some/file.tsx'
    const result = truncatePath(long, 20)
    expect(result).toContain('...')
    expect(result.length).toBeLessThan(long.length)
  })
})

describe('hashFileMap', () => {
  it('returns consistent hash for same input', () => {
    const files = { 'a.ts': 'hello', 'b.ts': 'world' }
    expect(hashFileMap(files)).toBe(hashFileMap(files))
  })
  it('returns different hash for different input', () => {
    // hashFileMap uses key names + content length (not content), so use different-length values
    expect(hashFileMap({ 'a.ts': 'hello' })).not.toBe(hashFileMap({ 'a.ts': 'hello world' }))
  })
})

describe('hashFileMapDeep', () => {
  it('returns consistent hash', () => {
    const files = { 'a.ts': 'hello' }
    expect(hashFileMapDeep(files)).toBe(hashFileMapDeep(files))
  })
  it('detects content changes', () => {
    expect(hashFileMapDeep({ 'a.ts': 'v1' })).not.toBe(hashFileMapDeep({ 'a.ts': 'v2' }))
  })
})

describe('getFileIcon', () => {
  it('returns abbreviation for tsx', () => {
    const icon = getFileIcon('component.tsx')
    expect(typeof icon).toBe('string')
    expect(icon.length).toBeLessThanOrEqual(2)
  })
  it('returns abbreviation for unknown', () => {
    const icon = getFileIcon('file.xyz')
    expect(typeof icon).toBe('string')
  })
})

describe('getLanguageFromPath', () => {
  it('detects typescript', () => {
    expect(getLanguageFromPath('app.ts')).toBe('typescript')
    expect(getLanguageFromPath('app.tsx')).toBe('typescript')
  })
  it('detects css', () => {
    expect(getLanguageFromPath('style.css')).toBe('css')
  })
  it('defaults to plaintext', () => {
    expect(getLanguageFromPath('file.xyz')).toBe('plaintext')
  })
})
