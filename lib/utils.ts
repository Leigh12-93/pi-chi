import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelative(dateStr: string): string {
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
    case 'tsx': case 'jsx': return '⚛'
    case 'ts': case 'js': return '📜'
    case 'css': return '🎨'
    case 'html': return '🌐'
    case 'json': return '📋'
    case 'md': return '📝'
    case 'png': case 'jpg': case 'svg': return '🖼'
    case 'gitignore': return '🔒'
    default: return '📄'
  }
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
