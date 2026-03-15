// Context building — file manifest, active file injection, pi-chi.md caching,
// memory loading, system prompt assembly

import { MEMORY_MARKER, buildSystemPrompt } from '@/lib/system-prompt'
import { VirtualFS } from '@/lib/virtual-fs'
import { supabaseFetch } from '@/lib/supabase-fetch'
import { memoryCache, MEMORY_TTL } from './rate-limiter'

// pi-chi.md content cache — hash-based, avoids full injection on every message
const sixChiCache = new Map<string, { hash: string; vision: string; taskList: string; full: string }>()

/** Build compact file manifest string for system prompt injection */
export function buildFileManifest(vfs: VirtualFS, activeFile?: string): string {
  const manifest = vfs.manifest()
  if (manifest.length === 0) {
    return '  (empty project)'
  }
  if (manifest.length <= 15) {
    return manifest.map(f => `  ${f.path} (${f.lines}L, ${(f.size / 1024).toFixed(1)}kb)`).join('\n')
  }

  const activeDir = activeFile ? activeFile.substring(0, activeFile.lastIndexOf('/') + 1) : ''
  const dirs = new Map<string, typeof manifest>()
  for (const f of manifest) {
    const slashIdx = f.path.lastIndexOf('/')
    const dir = slashIdx >= 0 ? f.path.substring(0, slashIdx + 1) : ''
    if (!dirs.has(dir)) dirs.set(dir, [])
    dirs.get(dir)!.push(f)
  }
  const lines: string[] = []
  for (const [dir, dirFiles] of dirs) {
    const isActiveDir = activeDir && dir === activeDir
    if (dirFiles.length >= 4 && !isActiveDir) {
      const totalLines = dirFiles.reduce((s, f) => s + f.lines, 0)
      const totalSize = dirFiles.reduce((s, f) => s + f.size, 0)
      lines.push(`  ${dir || '(root)'}  [${dirFiles.length} files, ${totalLines}L, ${(totalSize / 1024).toFixed(1)}kb]`)
    } else {
      for (const f of dirFiles) {
        lines.push(`  ${f.path} (${f.lines}L, ${(f.size / 1024).toFixed(1)}kb)`)
      }
    }
  }
  return lines.join('\n')
}

/** Load project memory from cache or Supabase */
export async function loadProjectMemory(projectId: string | null): Promise<Record<string, string>> {
  if (!projectId) return {}

  const cached = memoryCache.get(projectId)
  if (cached && Date.now() - cached.ts < MEMORY_TTL) {
    return cached.data
  }

  try {
    const memResult = await supabaseFetch(`/pi_projects?id=eq.${encodeURIComponent(projectId)}&select=memory`)
    if (memResult.ok && Array.isArray(memResult.data) && memResult.data[0]?.memory) {
      const mem = memResult.data[0].memory
      if (typeof mem === 'object' && mem !== null) {
        const projectMemory = mem as Record<string, string>
        memoryCache.set(projectId, { data: projectMemory, ts: Date.now() })
        return projectMemory
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`[pi] Memory load failed for project ${projectId}:`, msg)
  }

  return {}
}

/** Build the pi-chi.md blueprint section — token-optimized with hash-based caching */
export function buildSixChiSection(vfs: VirtualFS, projectId: string | null, messageCount: number): string {
  const sixChiContent = vfs.read('pi-chi.md')
  if (!sixChiContent) return ''

  const hash = sixChiContent.length + ':' + sixChiContent.slice(0, 100)
  const cached = sixChiCache.get(projectId || '_anon')
  const isFirstMessage = messageCount <= 1
  const contentChanged = !cached || cached.hash !== hash

  if (isFirstMessage || contentChanged) {
    // Full injection — first message or content was updated
    const section = `\n\n## Project Blueprint (pi-chi.md)\n${sixChiContent.slice(0, 4096)}`
    // Parse and cache the Vision + Task List sections for subsequent messages
    const visionMatch = sixChiContent.match(/## Vision\n([\s\S]*?)(?=\n## )/)?.[1]?.trim() || ''
    const taskMatch = sixChiContent.match(/## Task List\n([\s\S]*?)$/)?.[1]?.trim() || ''
    sixChiCache.set(projectId || '_anon', { hash, vision: visionMatch, taskList: taskMatch, full: sixChiContent })
    return section
  }

  // Condensed injection — vision + tasks only (~200 tokens vs ~1000)
  const safeVision = cached.vision.replace(/```/g, '\\`\\`\\`')
  const safeTaskList = cached.taskList.replace(/```/g, '\\`\\`\\`')
  return `\n\n## Project Blueprint (pi-chi.md — condensed)\nVision: ${safeVision}\n\nTask List:\n${safeTaskList}\n\n(Full blueprint in pi-chi.md — use read_file for architecture/design details)`
}

/** Build the active file section for system prompt injection */
export function buildActiveFileSection(activeFile?: string, activeFileContent?: string): string {
  if (!activeFile || !activeFileContent) return ''

  // Sanitize activeFile path to prevent prompt injection via backticks/newlines
  const safeActiveFile = activeFile.replace(/[`\n\r]/g, '_')
  const activeLines = activeFileContent.split('\n')
  if (activeLines.length <= 150) {
    return `\n\nUser is currently viewing: ${safeActiveFile}\n\`\`\`\n${activeFileContent}\n\`\`\``
  }

  const head = activeLines.slice(0, 50).join('\n')
  const tail = activeLines.slice(-50).join('\n')
  return `\n\nUser is currently viewing: ${safeActiveFile} (${activeLines.length} lines — showing first/last 50, use read_file for full content)\n\`\`\`\n${head}\n\n... [${activeLines.length - 100} lines omitted] ...\n\n${tail}\n\`\`\``
}

/** Assemble the full system prompt with all injected sections */
export function assembleSystemPrompt(opts: {
  lastUserText: string
  brainName?: string
  brainStatus?: string
  projectMemory: Record<string, string>
  activeFileSection: string
  sixChiSection: string
  projectName: string
  projectId: string | null
  manifestStr: string
}): string {
  const { lastUserText, brainName, brainStatus, projectMemory, activeFileSection, sixChiSection, projectName, projectId, manifestStr } = opts

  // Validate memory values are strings
  const safeMemory = Object.fromEntries(
    Object.entries(projectMemory).filter(([, v]) => typeof v === 'string')
  )
  const memorySection = Object.keys(safeMemory).length > 0
    ? `\n\n## Project Memory (persisted across sessions)\n\`\`\`json\n${JSON.stringify(safeMemory)}\n\`\`\``
    : '\n\n(No project memory saved yet — use save_memory to persist insights.)'

  return buildSystemPrompt(lastUserText, { brainName, brainStatus }).replace(MEMORY_MARKER, memorySection)
    + activeFileSection
    + sixChiSection
    + `\n\n---\nProject: "${projectName.replace(/["\\`]/g, '_')}"${projectId ? ` (id: ${projectId})` : ''}\nFile manifest:\n${manifestStr}`
}
