import { tool } from 'ai'
import { z } from 'zod'
import { VirtualFS } from '@/lib/virtual-fs'
import type { ToolContext } from './types'

export function createFileTools(ctx: ToolContext) {
  const { vfs, editFailCounts } = ctx

  return {
    write_file: tool({
      description: 'Create or overwrite a file. Result is lean to save tokens.',
      parameters: z.object({
        path: z.string().describe('File path relative to project root'),
        content: z.string().describe('Complete file content'),
      }),
      execute: async ({ path, content }) => {
        const safePath = VirtualFS.sanitizePath(path)
        if (!safePath) return { error: `Invalid file path: ${path}` }
        vfs.write(safePath, content)
        const result: Record<string, unknown> = { ok: true, path: safePath, lines: content.split('\n').length }
        if (safePath.endsWith('.json')) {
          try { JSON.parse(content) } catch (e: any) {
            result.warning = `Invalid JSON: ${e.message}. The file was written but may cause build errors.`
          }
        }
        return result
      },
    }),

    read_file: tool({
      description: 'Read a file\'s content. Only use when you need existing content before editing. Supports pagination for large files via offset/limit.',
      parameters: z.object({
        path: z.string().describe('File path relative to project root'),
        offset: z.number().optional().describe('Line number to start from (1-based, default: 1)'),
        limit: z.number().optional().describe('Max lines to return (default/max: 2000)'),
      }),
      execute: async ({ path, offset, limit }) => {
        const content = vfs.read(path)
        if (content === undefined) return { error: `File not found: ${path}` }
        const allLines = content.split('\n')
        const totalLines = allLines.length
        const startLine = Math.max(1, offset || 1)
        const maxLines = Math.min(limit || 2000, 2000)
        const sliced = allLines.slice(startLine - 1, startLine - 1 + maxLines)
        const isTruncated = totalLines > startLine - 1 + maxLines
        return {
          content: sliced.join('\n'),
          path,
          lines: totalLines,
          ...(isTruncated ? { truncated: true, showing: `${startLine}-${startLine + sliced.length - 1} of ${totalLines}`, hint: 'Use offset/limit to read remaining lines.' } : {}),
        }
      },
    }),

    edit_file: tool({
      description: 'Edit a file by replacing a specific string. old_string must match EXACTLY (including whitespace/indentation). IMPORTANT: If you did NOT write this file yourself in this conversation, you MUST call read_file first. If this tool returns an error, STOP and call read_file before retrying — never guess.',
      parameters: z.object({
        path: z.string().describe('File path'),
        old_string: z.string().describe('Exact string to find (must match whitespace/indentation)'),
        new_string: z.string().describe('Replacement string'),
      }),
      execute: async ({ path, old_string, new_string }) => {
        const safePath = VirtualFS.sanitizePath(path)
        if (!safePath) return { error: `Invalid file path: ${path}` }
        const content = vfs.read(safePath)
        if (content === undefined) return { error: `File not found: ${path}` }

        // ── Pass 1: Exact match (fast path) ──────────────────────
        if (content.includes(old_string)) {
          const occurrences = content.split(old_string).length - 1
          if (occurrences > 1) {
            return { error: `Found ${occurrences} occurrences. Provide more context to make it unique.` }
          }
          const updated = content.replace(old_string, new_string)
          vfs.write(safePath, updated)
          return { ok: true, path: safePath, lines: updated.split('\n').length }
        }

        // ── Helper: strip each line's indent and collapse runs ───
        const normLines = (s: string) => s.split('\n').map(l => l.trim()).filter(l => l.length > 0)

        const oldTrimmedLines = normLines(old_string)
        const fileTrimmedLines = content.split('\n').map(l => l.trim())
        const fileRawLines = content.split('\n')

        // ── Pass 2: Line-by-line indent-insensitive match ────────
        let bestMatch: { start: number; end: number } | null = null

        for (let i = 0; i < fileRawLines.length; i++) {
          if (fileTrimmedLines[i] !== oldTrimmedLines[0]) continue

          let fi = i
          let oi = 0
          let matched = true

          while (oi < oldTrimmedLines.length && fi < fileRawLines.length) {
            if (fileTrimmedLines[fi] === '') { fi++; continue }
            if (fileTrimmedLines[fi] === oldTrimmedLines[oi]) { oi++; fi++ }
            else { matched = false; break }
          }

          if (matched && oi === oldTrimmedLines.length) {
            while (fi > i && fileRawLines[fi - 1].trim() === '') fi--
            bestMatch = { start: i, end: fi }
            break
          }
        }

        if (bestMatch) {
          // Uniqueness check: scan for a second fuzzy match after the first
          let secondMatch = false
          for (let i = bestMatch.end; i < fileRawLines.length; i++) {
            if (fileTrimmedLines[i] !== oldTrimmedLines[0]) continue
            let fi2 = i, oi2 = 0, matched2 = true
            while (oi2 < oldTrimmedLines.length && fi2 < fileRawLines.length) {
              if (fileTrimmedLines[fi2] === '') { fi2++; continue }
              if (fileTrimmedLines[fi2] === oldTrimmedLines[oi2]) { oi2++; fi2++ }
              else { matched2 = false; break }
            }
            if (matched2 && oi2 === oldTrimmedLines.length) { secondMatch = true; break }
          }
          if (secondMatch) {
            return { error: 'Found multiple fuzzy matches for this code block. Provide more surrounding context to make old_string unique, or use exact whitespace.' }
          }

          const before = fileRawLines.slice(0, bestMatch.start).join('\n')
          const after = fileRawLines.slice(bestMatch.end).join('\n')
          const updated = [before, new_string, after].filter(s => s !== '').join('\n')
          vfs.write(safePath, updated)
          return { ok: true, path: safePath, lines: updated.split('\n').length, note: 'Matched with indent-insensitive fuzzy matching' }
        }

        // ── No match — return helpful context ────────────────────
        const firstOldLine = old_string.split('\n')[0].trim()
        const oldLines = old_string.split('\n')
        const nearLines: string[] = []
        for (let i = 0; i < fileRawLines.length; i++) {
          if (fileRawLines[i].includes(firstOldLine) || (firstOldLine.length > 10 && fileRawLines[i].trim().startsWith(firstOldLine.slice(0, 20)))) {
            const start = Math.max(0, i - 2)
            const end = Math.min(fileRawLines.length, i + oldLines.length + 2)
            nearLines.push(`Lines ${start + 1}-${end}:\n${fileRawLines.slice(start, end).join('\n')}`)
            break
          }
        }

        const fails = (editFailCounts.get(safePath) || 0) + 1
        editFailCounts.set(safePath, fails)
        return {
          error: 'old_string not found in file. You MUST call read_file on this file before retrying. Do NOT guess at the content.',
          hint: fails >= 3
            ? `You have failed to edit this file ${fails} times. Use write_file to rewrite it instead of continuing to retry edit_file.`
            : 'STOP. Call read_file to see the actual file content, then use the exact text from read_file as old_string.',
          nearMatch: nearLines.length > 0 ? nearLines[0] : undefined,
          fileLength: `${fileRawLines.length} lines`,
        }
      },
    }),

    delete_file: tool({
      description: 'Delete a file from the project.',
      parameters: z.object({
        path: z.string().describe('File path to delete'),
      }),
      execute: async ({ path }) => {
        const safePath = VirtualFS.sanitizePath(path)
        if (!safePath) return { error: `Invalid file path: ${path}` }
        if (!vfs.exists(safePath)) return { error: `File not found: ${safePath}` }
        vfs.delete(safePath)
        return { ok: true, path: safePath, deleted: true }
      },
    }),

    list_files: tool({
      description: 'List all files in the project with their sizes.',
      parameters: z.object({
        prefix: z.string().optional().describe('Filter files starting with this path prefix'),
      }),
      execute: async ({ prefix }) => {
        const files = vfs.list(prefix)
        return { files, count: files.length }
      },
    }),

    search_files: tool({
      description: 'Search file contents with a regex pattern.',
      parameters: z.object({
        pattern: z.string().describe('Regex pattern to search for'),
      }),
      execute: async ({ pattern }) => {
        const results = vfs.search(pattern)
        if (!Array.isArray(results)) return results
        return { results, count: results.length }
      },
    }),

    grep_files: tool({
      description: 'Search file contents with regex and return matches with surrounding context lines. Better than search_files when you need to see code around matches before editing.',
      parameters: z.object({
        pattern: z.string().describe('Regex pattern to search for'),
        context: z.number().optional().describe('Lines of context before and after each match (default: 3)'),
        maxResults: z.number().optional().describe('Max results to return (default: 10)'),
      }),
      execute: async ({ pattern, context: ctx, maxResults }) => {
        const contextLines = ctx ?? 3
        const max = maxResults ?? 10
        const results: Array<{ file: string; line: number; match: string; context: string }> = []
        let regex: RegExp
        try {
          regex = new RegExp(pattern, 'i')
        } catch {
          return { error: `Invalid regex pattern: ${pattern}` }
        }
        for (const [path, content] of vfs.files) {
          if (results.length >= max) break
          const lines = content.split('\n')
          for (let i = 0; i < lines.length && results.length < max; i++) {
            if (regex.test(lines[i])) {
              const start = Math.max(0, i - contextLines)
              const end = Math.min(lines.length, i + contextLines + 1)
              const contextBlock = lines.slice(start, end)
                .map((l, idx) => `${start + idx + 1}${start + idx === i ? '>' : ' '} ${l}`)
                .join('\n')
              results.push({ file: path, line: i + 1, match: lines[i].trim().slice(0, 200), context: contextBlock })
            }
          }
        }
        return { results, count: results.length }
      },
    }),

    get_all_files: tool({
      description: 'Get the file manifest (path, lines, size). No content.',
      parameters: z.object({}),
      execute: async () => {
        return { manifest: vfs.manifest(), totalFiles: vfs.list().length }
      },
    }),

    rename_file: tool({
      description: 'Rename/move a file within the project.',
      parameters: z.object({
        oldPath: z.string().describe('Current file path'),
        newPath: z.string().describe('New file path'),
      }),
      execute: async ({ oldPath, newPath }) => {
        const safeOld = VirtualFS.sanitizePath(oldPath)
        const safeNew = VirtualFS.sanitizePath(newPath)
        if (!safeOld) return { error: `Invalid old path: ${oldPath}` }
        if (!safeNew) return { error: `Invalid new path: ${newPath}` }
        const content = vfs.read(safeOld)
        if (content === undefined) return { error: `File not found: ${safeOld}` }
        vfs.delete(safeOld)
        vfs.write(safeNew, content)
        return { ok: true, oldPath: safeOld, newPath: safeNew }
      },
    }),
  }
}
