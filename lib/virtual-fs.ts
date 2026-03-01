// ═══════════════════════════════════════════════════════════════════
// Virtual Filesystem — lives in closure per request
// ═══════════════════════════════════════════════════════════════════

export class VirtualFS {
  files: Map<string, string>

  /** Sanitize a file path — block traversal, normalize separators */
  static sanitizePath(path: string): string | null {
    // Normalize separators
    let p = path.replace(/\\/g, '/').trim()
    // Remove leading slash
    if (p.startsWith('/')) p = p.slice(1)
    // Block traversal
    if (p.includes('..') || p.includes('\0')) return null
    // Block absolute paths (C:, /etc)
    if (/^[a-zA-Z]:/.test(p)) return null
    // Block empty
    if (!p) return null
    return p
  }

  constructor(initial?: Record<string, string>) {
    this.files = new Map(Object.entries(initial || {}))
  }

  write(path: string, content: string) {
    const safe = VirtualFS.sanitizePath(path)
    if (!safe) return
    this.files.set(safe, content)
  }

  read(path: string): string | undefined {
    const safe = VirtualFS.sanitizePath(path)
    return safe ? this.files.get(safe) : undefined
  }

  exists(path: string): boolean {
    const safe = VirtualFS.sanitizePath(path)
    return safe ? this.files.has(safe) : false
  }

  delete(path: string): boolean {
    const safe = VirtualFS.sanitizePath(path)
    return safe ? this.files.delete(safe) : false
  }

  list(prefix = ''): string[] {
    return Array.from(this.files.keys())
      .filter(k => !prefix || k.startsWith(prefix))
      .sort()
  }

  search(pattern: string, maxResults = 30): Array<{ file: string; line: number; text: string }> | { error: string } {
    const results: Array<{ file: string; line: number; text: string }> = []
    let regex: RegExp
    try {
      regex = new RegExp(pattern, 'i')
    } catch (_e) {
      return { error: `Invalid regex pattern: ${pattern}` }
    }
    for (const [path, content] of this.files) {
      if (results.length >= maxResults) break
      const lines = content.split('\n')
      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        if (regex.test(lines[i])) {
          results.push({ file: path, line: i + 1, text: lines[i].trim().slice(0, 200) })
        }
      }
    }
    return results
  }

  toRecord(): Record<string, string> {
    return Object.fromEntries(this.files)
  }

  manifest(): Array<{ path: string; lines: number; size: number }> {
    return Array.from(this.files.entries())
      .map(([path, content]) => ({
        path,
        lines: content.split('\n').length,
        size: content.length,
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  toTree(): TreeNode[] {
    const root: TreeNode[] = []
    for (const path of this.list()) {
      const parts = path.split('/')
      let current = root
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i]
        const isFile = i === parts.length - 1
        const existingDir = current.find(n => n.name === name && n.type === 'directory')
        if (isFile) {
          current.push({ name, path, type: 'file' })
        } else if (existingDir) {
          current = existingDir.children!
        } else {
          const dir: TreeNode = { name, path: parts.slice(0, i + 1).join('/'), type: 'directory', children: [] }
          current.push(dir)
          current = dir.children!
        }
      }
    }
    return sortTree(root)
  }
}

export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeNode[]
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  }).map(n => n.children ? { ...n, children: sortTree(n.children) } : n)
}
