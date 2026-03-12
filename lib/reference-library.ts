// Stub — populated by `scripts/ingest-references.py`

export interface ReferenceEntry {
  name: string
  source: string
  path: string
  category: string
  description: string
  tags: string[]
  code: string
  lines: number
}

export const REFERENCE_LIBRARY: ReferenceEntry[] = []

export function searchReferences(
  query: string,
  opts?: { category?: string; source?: string },
): ReferenceEntry[] {
  if (REFERENCE_LIBRARY.length === 0) return []

  const q = query.toLowerCase()
  return REFERENCE_LIBRARY.filter(ref => {
    if (opts?.category && ref.category !== opts.category) return false
    if (opts?.source && ref.source !== opts.source) return false
    return (
      ref.name.toLowerCase().includes(q) ||
      ref.description.toLowerCase().includes(q) ||
      ref.tags.some(t => t.toLowerCase().includes(q))
    )
  }).slice(0, 10)
}
