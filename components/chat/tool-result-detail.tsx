'use client'

import { useState } from 'react'
import { ChevronDown, Copy, Check, FileText, Search, Database, GitBranch, Terminal, Eye } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

type ToolArgs = Record<string, unknown>
type ToolResult = Record<string, unknown> | null | undefined

/** Get a compact inline summary for a completed tool (e.g., "45 lines", "3 matches") */
export function getInlineSummary(toolName: string, args: ToolArgs, result: ToolResult): string | null {
  if (!result || typeof result !== 'object') return null
  if ('error' in result) return null

  switch (toolName) {
    case 'write_file': {
      const lines = result.lines as number | undefined
      if (lines) return `${lines} lines`
      const content = args.content as string | undefined
      if (content) {
        const lineCount = content.split('\n').length
        return `${lineCount} lines`
      }
      return null
    }
    case 'edit_file': {
      const oldStr = args.old_string as string | undefined
      const newStr = args.new_string as string | undefined
      if (oldStr && newStr) {
        const removed = oldStr.split('\n').length
        const added = newStr.split('\n').length
        if (removed === added) return `${added} lines changed`
        return `+${added} -${removed}`
      }
      return null
    }
    case 'read_file': {
      const lines = result.lines as number | undefined
      if (lines) return `${lines} lines`
      const content = result.content as string | undefined
      if (content) return `${content.split('\n').length} lines`
      return null
    }
    case 'search_files':
    case 'grep_files': {
      const count = result.count as number | undefined
      if (count !== undefined) return `${count} match${count !== 1 ? 'es' : ''}`
      const matches = result.matches as unknown[] | undefined
      if (matches) return `${matches.length} match${matches.length !== 1 ? 'es' : ''}`
      return null
    }
    case 'list_files': {
      const count = result.count as number | undefined
      if (count !== undefined) return `${count} files`
      return null
    }
    case 'get_all_files': {
      const total = (result as any).totalFiles as number | undefined
      if (total) return `${total} files`
      return null
    }
    case 'create_project': {
      const template = args.template as string | undefined
      return template || null
    }
    case 'github_push_update':
    case 'github_push_files': {
      const fc = result.filesCount as number | undefined
      if (fc) return `${fc} files`
      return null
    }
    case 'github_pull_latest': {
      const fc = (result as any).fileCount as number | undefined
      if (fc) return `${fc} files`
      return null
    }
    case 'db_query': {
      const data = result.data as unknown[] | undefined
      if (data) return `${data.length} row${data.length !== 1 ? 's' : ''}`
      return null
    }
    case 'db_mutate': {
      return result.ok ? 'success' : null
    }
    case 'db_introspect': {
      const cols = result.columns as unknown[] | undefined
      if (cols) return `${cols.length} columns`
      return null
    }
    case 'add_dependency': {
      const ver = result.version as string | undefined
      if (ver) return `v${ver}`
      return result.skipped ? 'already installed' : null
    }
    case 'scaffold_component': {
      const files = result.files as unknown[] | undefined
      if (files) return `${files.length} files`
      return null
    }
    case 'deploy_to_vercel': {
      return result.url ? 'live' : null
    }
    case 'forge_check_build': {
      return result.ok ? 'passed' : (result.error ? 'failed' : null)
    }
    default:
      return null
  }
}

/** Expandable detail panel for a tool result — shows args/result in a structured way */
export function ToolResultDetail({ toolName, args, result }: {
  toolName: string
  args: ToolArgs
  result: ToolResult
}) {
  const [copiedSnippet, setCopiedSnippet] = useState(false)

  const handleCopySnippet = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedSnippet(true)
    setTimeout(() => setCopiedSnippet(false), 1500)
  }

  // Render tool-specific detail
  const detail = getToolDetail(toolName, args, result, copiedSnippet, handleCopySnippet)
  if (!detail) return null

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 32 }}
      className="overflow-hidden"
    >
      <div className="ml-2.5 border-l border-forge-border/30 pl-4 py-1.5">
        {detail}
      </div>
    </motion.div>
  )
}

/** Get the structured detail view for a given tool */
function getToolDetail(
  toolName: string,
  args: ToolArgs,
  result: ToolResult,
  copiedSnippet: boolean,
  onCopy: (text: string) => void,
): React.ReactNode {
  const hasError = result && typeof result === 'object' && 'error' in result

  // Error detail — show full error message
  if (hasError) {
    const errMsg = String((result as any).error || 'Unknown error')
    return (
      <div className="text-[11.5px] text-red-500/80 dark:text-red-400/70 font-mono leading-relaxed whitespace-pre-wrap break-all max-h-[120px] overflow-y-auto">
        {errMsg}
      </div>
    )
  }

  switch (toolName) {
    case 'write_file':
      return <WriteFileDetail args={args} onCopy={onCopy} copiedSnippet={copiedSnippet} />
    case 'edit_file':
      return <EditFileDetail args={args} />
    case 'read_file':
      return <ReadFileDetail result={result} />
    case 'search_files':
    case 'grep_files':
      return <SearchDetail args={args} result={result} />
    case 'list_files':
    case 'get_all_files':
      return <FileListDetail result={result} />
    case 'db_query':
      return <DbQueryDetail args={args} result={result} />
    case 'db_mutate':
      return <DbMutateDetail args={args} result={result} />
    case 'db_introspect':
      return <DbIntrospectDetail result={result} />
    case 'github_push_update':
    case 'github_push_files':
      return <GitPushDetail result={result} />
    case 'github_pull_latest':
      return <GitPullDetail result={result} />
    case 'create_project':
      return <CreateProjectDetail result={result} />
    case 'add_dependency':
      return <DependencyDetail args={args} result={result} />
    case 'forge_check_build':
      return <BuildDetail result={result} />
    default:
      return <GenericDetail args={args} result={result} />
  }
}

/** Code snippet block with optional copy */
function CodeSnippet({ code, maxLines = 8, onCopy, copied, label }: {
  code: string
  maxLines?: number
  onCopy?: (text: string) => void
  copied?: boolean
  label?: string
}) {
  const lines = code.split('\n')
  const truncated = lines.length > maxLines
  const display = truncated ? lines.slice(0, maxLines).join('\n') + '\n...' : code

  return (
    <div className="relative group/snippet">
      {label && <span className="text-[10px] text-forge-text-dim/40 uppercase tracking-wider font-medium">{label}</span>}
      <pre className="text-[11px] font-mono text-forge-text-dim/70 bg-forge-surface/60 rounded-md px-2.5 py-2 mt-0.5 leading-relaxed whitespace-pre-wrap break-all max-h-[160px] overflow-y-auto border border-forge-border/20">
        {display}
      </pre>
      {onCopy && (
        <button
          onClick={() => onCopy(code)}
          className="absolute top-1 right-1 p-1 rounded-md opacity-0 group-hover/snippet:opacity-100 transition-opacity bg-forge-surface hover:bg-forge-surface-hover"
          title="Copy"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3 text-forge-text-dim/50" />}
        </button>
      )}
      {truncated && (
        <span className="text-[10px] text-forge-text-dim/30 mt-0.5 block">
          {lines.length} lines total
        </span>
      )}
    </div>
  )
}

/** Key-value pair row */
function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  if (!value) return null
  return (
    <div className="flex items-baseline gap-2 text-[11px]">
      <span className="text-forge-text-dim/40 shrink-0">{label}</span>
      <span className={cn('text-forge-text-dim/70 truncate', mono && 'font-mono text-[10.5px]')}>{value}</span>
    </div>
  )
}

// ── Tool-specific detail components ──────────────────────────────

function WriteFileDetail({ args, onCopy, copiedSnippet }: { args: ToolArgs; onCopy: (t: string) => void; copiedSnippet: boolean }) {
  const content = args.content as string | undefined
  if (!content) return <DetailRow label="path" value={String(args.path || '')} mono />
  const lineCount = content.split('\n').length
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 text-[11px]">
        <span className="text-forge-text-dim/40">{lineCount} lines written</span>
      </div>
      <CodeSnippet code={content} maxLines={6} onCopy={onCopy} copied={copiedSnippet} />
    </div>
  )
}

function EditFileDetail({ args }: { args: ToolArgs }) {
  const oldStr = args.old_string as string | undefined
  const newStr = args.new_string as string | undefined
  if (!oldStr && !newStr) return null

  return (
    <div className="space-y-1.5">
      {oldStr && (
        <div>
          <span className="text-[10px] text-red-400/60 font-medium">removed</span>
          <pre className="text-[11px] font-mono text-red-400/50 bg-red-50/30 dark:bg-red-950/10 rounded-md px-2.5 py-1.5 mt-0.5 leading-relaxed whitespace-pre-wrap break-all max-h-[80px] overflow-y-auto border border-red-200/20 dark:border-red-800/20 line-through decoration-red-300/30">
            {oldStr.length > 300 ? oldStr.slice(0, 300) + '...' : oldStr}
          </pre>
        </div>
      )}
      {newStr && (
        <div>
          <span className="text-[10px] text-emerald-400/60 font-medium">added</span>
          <pre className="text-[11px] font-mono text-emerald-500/60 bg-emerald-50/30 dark:bg-emerald-950/10 rounded-md px-2.5 py-1.5 mt-0.5 leading-relaxed whitespace-pre-wrap break-all max-h-[80px] overflow-y-auto border border-emerald-200/20 dark:border-emerald-800/20">
            {newStr.length > 300 ? newStr.slice(0, 300) + '...' : newStr}
          </pre>
        </div>
      )}
    </div>
  )
}

function ReadFileDetail({ result }: { result: ToolResult }) {
  const content = result?.content as string | undefined
  if (!content) return null
  return <CodeSnippet code={content} maxLines={8} />
}

function SearchDetail({ args, result }: { args: ToolArgs; result: ToolResult }) {
  const matches = result?.matches as Array<{ path?: string; file?: string; line?: number; text?: string }> | undefined
  const pattern = args.pattern as string | undefined

  if (!matches || matches.length === 0) {
    return <span className="text-[11px] text-forge-text-dim/40">No matches found{pattern ? ` for /${pattern}/` : ''}</span>
  }

  const displayMatches = matches.slice(0, 8)
  return (
    <div className="space-y-0.5">
      {displayMatches.map((m, i) => (
        <div key={i} className="flex items-baseline gap-2 text-[11px] py-0.5">
          <span className="font-mono text-forge-text-dim/50 shrink-0 text-[10.5px]">
            {(m.path || m.file || '').split('/').pop()}
            {m.line ? `:${m.line}` : ''}
          </span>
          {m.text && (
            <span className="text-forge-text-dim/40 truncate font-mono text-[10px]">{m.text.trim().slice(0, 60)}</span>
          )}
        </div>
      ))}
      {matches.length > 8 && (
        <span className="text-[10px] text-forge-text-dim/30">+{matches.length - 8} more</span>
      )}
    </div>
  )
}

function FileListDetail({ result }: { result: ToolResult }) {
  const files = (result as any)?.files as string[] | undefined
  if (!files || files.length === 0) return null
  const display = files.slice(0, 12)
  return (
    <div className="space-y-0.5">
      {display.map((f, i) => (
        <div key={i} className="text-[10.5px] font-mono text-forge-text-dim/50 py-0.5 truncate">
          {f}
        </div>
      ))}
      {files.length > 12 && (
        <span className="text-[10px] text-forge-text-dim/30">+{files.length - 12} more</span>
      )}
    </div>
  )
}

function DbQueryDetail({ args, result }: { args: ToolArgs; result: ToolResult }) {
  const data = result?.data as Record<string, unknown>[] | undefined
  const table = args.table as string | undefined

  if (!data || data.length === 0) {
    return <span className="text-[11px] text-forge-text-dim/40">{table ? `No rows from ${table}` : 'No results'}</span>
  }

  const cols = Object.keys(data[0]).slice(0, 5)
  const rows = data.slice(0, 4)
  return (
    <div className="overflow-x-auto">
      <table className="text-[10.5px] font-mono w-full">
        <thead>
          <tr className="border-b border-forge-border/20">
            {cols.map(c => (
              <th key={c} className="text-left text-forge-text-dim/40 py-0.5 pr-3 font-medium">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-b border-forge-border/10">
              {cols.map(c => (
                <td key={c} className="text-forge-text-dim/60 py-0.5 pr-3 truncate max-w-[120px]">
                  {row[c] === null ? <span className="text-forge-text-dim/20">null</span> : String(row[c]).slice(0, 30)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {data.length > 4 && (
        <span className="text-[10px] text-forge-text-dim/30 mt-0.5 block">+{data.length - 4} more rows</span>
      )}
      {cols.length < Object.keys(data[0]).length && (
        <span className="text-[10px] text-forge-text-dim/30">+{Object.keys(data[0]).length - cols.length} more columns</span>
      )}
    </div>
  )
}

function DbMutateDetail({ args, result }: { args: ToolArgs; result: ToolResult }) {
  const op = args.operation as string | undefined
  const table = args.table as string | undefined
  return (
    <DetailRow label={op || 'operation'} value={table || ''} mono />
  )
}

function DbIntrospectDetail({ result }: { result: ToolResult }) {
  const columns = result?.columns as Array<{ name?: string; type?: string }> | undefined
  if (!columns) return null
  const display = columns.slice(0, 10)
  return (
    <div className="space-y-0.5">
      {display.map((c, i) => (
        <div key={i} className="flex items-baseline gap-2 text-[10.5px] font-mono">
          <span className="text-forge-text-dim/60">{c.name}</span>
          <span className="text-forge-text-dim/30">{c.type}</span>
        </div>
      ))}
      {columns.length > 10 && <span className="text-[10px] text-forge-text-dim/30">+{columns.length - 10} more</span>}
    </div>
  )
}

function GitPushDetail({ result }: { result: ToolResult }) {
  const filesCount = result?.filesCount as number | undefined
  const mode = (result as any)?.mode as string | undefined
  const sha = (result as any)?.sha as string | undefined
  return (
    <div className="space-y-0.5">
      {filesCount && <DetailRow label="files" value={String(filesCount)} />}
      {mode && <DetailRow label="mode" value={mode} />}
      {sha && <DetailRow label="sha" value={sha.slice(0, 7)} mono />}
    </div>
  )
}

function GitPullDetail({ result }: { result: ToolResult }) {
  const fileCount = (result as any)?.fileCount as number | undefined
  const skipped = (result as any)?.skippedCount as number | undefined
  return (
    <div className="space-y-0.5">
      {fileCount && <DetailRow label="pulled" value={`${fileCount} files`} />}
      {skipped ? <DetailRow label="preserved" value={`${skipped} local edits`} /> : null}
    </div>
  )
}

function CreateProjectDetail({ result }: { result: ToolResult }) {
  const allFiles = result?.allFiles as Record<string, unknown> | undefined
  if (!allFiles) return null
  const fileNames = Object.keys(allFiles).slice(0, 10)
  return (
    <div className="space-y-0.5">
      <span className="text-[10px] text-forge-text-dim/40">{Object.keys(allFiles).length} files created</span>
      {fileNames.map(f => (
        <div key={f} className="text-[10.5px] font-mono text-forge-text-dim/50 truncate">{f}</div>
      ))}
      {Object.keys(allFiles).length > 10 && (
        <span className="text-[10px] text-forge-text-dim/30">+{Object.keys(allFiles).length - 10} more</span>
      )}
    </div>
  )
}

function DependencyDetail({ args, result }: { args: ToolArgs; result: ToolResult }) {
  const name = args.name as string | undefined
  const version = result?.version as string | undefined
  const skipped = result?.skipped as boolean | undefined
  return (
    <div className="space-y-0.5">
      <DetailRow label="package" value={name || ''} mono />
      {version && <DetailRow label="version" value={version} mono />}
      {skipped && <span className="text-[10.5px] text-forge-text-dim/40">Already installed</span>}
    </div>
  )
}

function BuildDetail({ result }: { result: ToolResult }) {
  const errors = (result as any)?.errors as string[] | undefined
  const output = (result as any)?.output as string | undefined
  if (errors && errors.length > 0) {
    return (
      <div className="space-y-0.5">
        {errors.slice(0, 5).map((e, i) => (
          <div key={i} className="text-[11px] font-mono text-red-400/60 truncate">{e}</div>
        ))}
      </div>
    )
  }
  if (output) return <CodeSnippet code={output} maxLines={5} />
  return null
}

function GenericDetail({ args, result }: { args: ToolArgs; result: ToolResult }) {
  // For unknown tools, show a compact JSON preview of the result
  if (!result || Object.keys(result).length === 0) return null

  // Filter out common noise keys
  const filtered = Object.entries(result)
    .filter(([k]) => !['ok', 'success'].includes(k))
    .slice(0, 5)

  if (filtered.length === 0) return null

  return (
    <div className="space-y-0.5">
      {filtered.map(([key, val]) => (
        <DetailRow
          key={key}
          label={key}
          value={typeof val === 'string' ? val.slice(0, 80) : JSON.stringify(val).slice(0, 80)}
          mono={typeof val !== 'string'}
        />
      ))}
    </div>
  )
}
