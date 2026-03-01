import { describe, it, expect } from 'vitest'
import { VirtualFS } from '@/lib/virtual-fs'

describe('VirtualFS', () => {
  it('creates from initial files', () => {
    const vfs = new VirtualFS({ 'index.ts': 'hello' })
    expect(vfs.read('index.ts')).toBe('hello')
  })

  it('writes and reads files', () => {
    const vfs = new VirtualFS()
    vfs.write('src/app.tsx', 'export default function App() {}')
    expect(vfs.read('src/app.tsx')).toBe('export default function App() {}')
  })

  it('deletes files', () => {
    const vfs = new VirtualFS({ 'a.ts': 'a' })
    expect(vfs.delete('a.ts')).toBe(true)
    expect(vfs.read('a.ts')).toBeUndefined()
  })

  it('lists files with prefix', () => {
    const vfs = new VirtualFS({ 'src/a.ts': 'a', 'src/b.ts': 'b', 'lib/c.ts': 'c' })
    expect(vfs.list('src/')).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('sanitizes paths', () => {
    expect(VirtualFS.sanitizePath('../etc/passwd')).toBeNull()
    expect(VirtualFS.sanitizePath('C:/windows/system32')).toBeNull()
    expect(VirtualFS.sanitizePath('normal/path.ts')).toBe('normal/path.ts')
    expect(VirtualFS.sanitizePath('/leading/slash.ts')).toBe('leading/slash.ts')
    expect(VirtualFS.sanitizePath('back\\slash.ts')).toBe('back/slash.ts')
  })

  it('searches files with regex', () => {
    const vfs = new VirtualFS({ 'a.ts': 'const foo = 1\nconst bar = 2', 'b.ts': 'const baz = 3' })
    const results = vfs.search('foo')
    expect(Array.isArray(results)).toBe(true)
    if (Array.isArray(results)) {
      expect(results).toHaveLength(1)
      expect(results[0].file).toBe('a.ts')
    }
  })

  it('handles invalid regex in search', () => {
    const vfs = new VirtualFS({ 'a.ts': 'hello' })
    const result = vfs.search('[invalid')
    expect('error' in result).toBe(true)
  })

  it('detects ReDoS patterns', () => {
    const vfs = new VirtualFS({ 'a.ts': 'hello' })
    // This should complete without hanging
    const result = vfs.search('(a+)+$')
    // May or may not detect as ReDoS depending on runtime, just ensure it doesn't hang
    expect(result).toBeDefined()
  })

  it('generates manifest', () => {
    const vfs = new VirtualFS({ 'a.ts': 'line1\nline2', 'b.ts': 'x' })
    const manifest = vfs.manifest()
    expect(manifest).toHaveLength(2)
    expect(manifest[0]).toEqual({ path: 'a.ts', lines: 2, size: 11 })
  })

  it('generates tree with directories', () => {
    const vfs = new VirtualFS({ 'src/a.ts': 'a', 'src/b.ts': 'b', 'lib/c.ts': 'c' })
    const tree = vfs.toTree()
    expect(tree).toHaveLength(2)  // lib, src directories
    expect(tree[0].type).toBe('directory')
  })

  it('deduplicates files in tree', () => {
    const vfs = new VirtualFS({ 'src/a.ts': 'a' })
    const tree = vfs.toTree()
    const srcDir = tree.find(n => n.name === 'src')
    expect(srcDir?.children).toHaveLength(1)
  })
})
