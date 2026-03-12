/**
 * Parse file:line references from error messages.
 * Supports common patterns like:
 *   src/App.tsx:42:15
 *   ./components/Header.tsx(12,5)
 *   /app/page.tsx line 7
 *   at Module (src/utils.ts:10:3)
 */

export interface FileReference {
  path: string
  line?: number
  /** Start index in the original string */
  start: number
  /** End index in the original string (of the full match including line info) */
  end: number
  /** The raw matched text */
  raw: string
}

// Common source file extensions
const EXT = 'tsx?|jsx?|css|json|html|mjs|cjs|vue|svelte|mts|cts'

// Pattern 1: path:line:col or path:line (e.g., src/App.tsx:42:15, ./App.tsx:7)
const COLON_RE = new RegExp(
  `(\.?\.?/|/)?([\w@._-]+(?:/[\w@._-]+)*\.(?:${EXT})):(\d+)(?::\d+)?`,
  'g'
)

// Pattern 2: path(line,col) (e.g., ./components/Header.tsx(12,5))
const PAREN_RE = new RegExp(
  `(\.?\.?/|/)?([\w@._-]+(?:/[\w@._-]+)*\.(?:${EXT}))\((\d+)(?:,\d+)?\)`,
  'g'
)

// Pattern 3: path line N (e.g., /app/page.tsx line 7)
const LINE_WORD_RE = new RegExp(
  `(\.?\.?/|/)?([\w@._-]+(?:/[\w@._-]+)*\.(?:${EXT}))\s+line\s+(\d+)`,
  'gi'
)

/**
 * Extract file:line references from an error message string.
 * Returns references sorted by their position in the text.
 */
export function parseErrorReferences(errorText: string): FileReference[] {
  const refs: FileReference[] = []
  const seen = new Set<string>()

  for (const pattern of [COLON_RE, PAREN_RE, LINE_WORD_RE]) {
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(errorText)) !== null) {
      const prefix = match[1] || ''
      const filePart = match[2]
      const lineStr = match[3]
      const fullPath = prefix + filePart
      const line = parseInt(lineStr, 10)

      // Find where the path starts within the full match
      const pathStart = match.index + match[0].indexOf(fullPath)
      const end = match.index + match[0].length
      const key = `${pathStart}:${end}`

      if (!seen.has(key)) {
        seen.add(key)
        refs.push({
          path: fullPath,
          line: isNaN(line) ? undefined : line,
          start: pathStart,
          end,
          raw: match[0].trim(),
        })
      }
    }
  }

  // Sort by position, deduplicate overlapping ranges
  refs.sort((a, b) => a.start - b.start)

  // Remove overlapping refs (keep the first/longest)
  const filtered: FileReference[] = []
  let lastEnd = -1
  for (const ref of refs) {
    if (ref.start >= lastEnd) {
      filtered.push(ref)
      lastEnd = ref.end
    }
  }

  return filtered
}

/**
 * Normalize a file path from an error message to match virtual FS paths.
 * Strips leading ./ or / prefixes.
 */
export function normalizeErrorPath(rawPath: string): string {
  let p = rawPath
  if (p.startsWith('./')) p = p.slice(2)
  if (p.startsWith('../')) p = p.slice(3)
  if (p.startsWith('/')) p = p.slice(1)
  return p
}
