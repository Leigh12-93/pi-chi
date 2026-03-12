import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelative(dateStr: string | number): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

export function truncatePath(path: string, maxLen = 40): string {
  if (path.length <= maxLen) return path
  const parts = path.split('/')
  if (parts.length <= 2) return path
  return parts[0] + '/.../' + parts.slice(-2).join('/')
}

export function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'tsx': case 'jsx': return 'Rx'
    case 'ts': return 'TS'
    case 'js': case 'mjs': case 'cjs': return 'JS'
    case 'css': return 'CS'
    case 'html': return 'HT'
    case 'json': return '{}'
    case 'md': return 'MD'
    case 'png': case 'jpg': case 'svg': return 'IM'
    case 'gitignore': return 'GI'
    case 'sql': return 'DB'
    case 'xml': case 'yaml': case 'yml': return 'CF'
    case 'env': return 'EN'
    case 'sh': case 'bash': return 'SH'
    case 'dockerfile': return 'DK'
    default: return 'FI'
  }
}

/** Shallow djb2 hash (paths + content lengths only). Same-length edits won't change hash. */
export function hashFileMap(files: Record<string, string>): string {
  const keys = Object.keys(files).sort()
  let h = 5381
  for (const k of keys) {
    for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0
    h = ((h << 5) + h + files[k].length) | 0
  }
  return h.toString(36)
}

/** Content-sensitive djb2 hash for auto-save dedup. Files > 2KB: samples first + last 1KB. */
export function hashFileMapDeep(files: Record<string, string>): string {
  const keys = Object.keys(files).sort()
  let h = 5381
  for (const k of keys) {
    for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0
    const c = files[k]
    h = ((h << 5) + h + c.length) | 0
    if (c.length <= 2048) {
      for (let i = 0; i < c.length; i++) h = ((h << 5) + h + c.charCodeAt(i)) | 0
    } else {
      // Large files: sample first + last 1KB
      for (let i = 0; i < 1024; i++) h = ((h << 5) + h + c.charCodeAt(i)) | 0
      for (let i = c.length - 1024; i < c.length; i++) h = ((h << 5) + h + c.charCodeAt(i)) | 0
    }
  }
  return h.toString(36)
}

export function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'tsx': case 'ts': return 'typescript'
    case 'jsx': case 'js': case 'mjs': case 'cjs': return 'javascript'
    case 'css': return 'css'
    case 'html': return 'html'
    case 'json': return 'json'
    case 'md': return 'markdown'
    case 'sql': return 'sql'
    case 'yaml': case 'yml': return 'yaml'
    case 'sh': case 'bash': return 'shell'
    default: return 'plaintext'
  }
}
