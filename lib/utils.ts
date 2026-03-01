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
    case 'js': return 'JS'
    case 'css': return 'CS'
    case 'html': return 'HT'
    case 'json': return '{}'
    case 'md': return 'MD'
    case 'png': case 'jpg': case 'svg': return 'IM'
    case 'gitignore': return 'GI'
    default: return 'FI'
  }
}

/** Fast djb2 hash of file paths + content lengths. Shallow — same-length edits won't change hash. Use hashFileMapDeep for content-sensitive hashing. */
export function hashFileMap(files: Record<string, string>): string {
  const keys = Object.keys(files).sort()
  let h = 5381
  for (const k of keys) {
    for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0
    h = ((h << 5) + h + files[k].length) | 0
  }
  return h.toString(36)
}

/** Deep djb2 hash of file paths + full content. For auto-save dedup. */
export function hashFileMapDeep(files: Record<string, string>): string {
  const keys = Object.keys(files).sort()
  let h = 5381
  for (const k of keys) {
    for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0
    const c = files[k]
    h = ((h << 5) + h + c.length) | 0
    for (let i = 0; i < c.length; i++) h = ((h << 5) + h + c.charCodeAt(i)) | 0
  }
  return h.toString(36)
}

export function getLanguageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'tsx': return 'typescript'
    case 'ts': return 'typescript'
    case 'jsx': return 'javascript'
    case 'js': return 'javascript'
    case 'css': return 'css'
    case 'html': return 'html'
    case 'json': return 'json'
    case 'md': return 'markdown'
    default: return 'plaintext'
  }
}
