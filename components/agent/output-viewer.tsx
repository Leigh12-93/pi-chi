'use client'

import { cn } from '@/lib/utils'
import type { ProjectOutput } from '@/lib/brain/brain-types'

interface OutputViewerProps {
  output: ProjectOutput
  content: string | null
  loading?: boolean
}

function highlightCode(code: string): string {
  // Simple syntax highlighting via HTML spans — no heavy deps
  let html = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Highlight strings
  html = html.replace(/(["'`])(?:(?!\1|\\).|\\.)*\1/g, '<span class="text-emerald-400">$&</span>')

  // Highlight comments
  html = html.replace(/(#.*$|\/\/.*$)/gm, '<span class="text-pi-text-dim/50 italic">$&</span>')

  // Highlight numbers
  html = html.replace(/\b(\d+\.?\d*)\b/g, '<span class="text-orange-400">$&</span>')

  return html
}

export function OutputViewer({ output, content, loading }: OutputViewerProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-pi-accent/30 border-t-pi-accent rounded-full animate-spin" />
      </div>
    )
  }

  if (content === null) {
    return (
      <div className="text-xs text-pi-text-dim text-center py-4">
        File not found or could not be read
      </div>
    )
  }

  // Poem — styled typography
  if (output.type === 'poem') {
    return (
      <div className="px-6 py-4 max-w-prose">
        {output.title && (
          <h3 className="text-sm font-semibold text-pi-accent mb-3 italic">{output.title}</h3>
        )}
        <div className="space-y-1">
          {content.split('\n').map((line, i) => (
            <p key={i} className={cn(
              'text-xs leading-relaxed font-serif',
              line.trim() === '' ? 'h-3' : 'text-pi-text'
            )}>
              {line || '\u00A0'}
            </p>
          ))}
        </div>
      </div>
    )
  }

  // Report — formatted sections
  if (output.type === 'report') {
    return (
      <div className="px-4 py-3 max-w-prose space-y-2">
        {content.split('\n').map((line, i) => {
          if (line.startsWith('# ')) {
            return <h2 key={i} className="text-sm font-bold text-pi-text mt-3">{line.slice(2)}</h2>
          }
          if (line.startsWith('## ')) {
            return <h3 key={i} className="text-xs font-semibold text-pi-accent mt-2">{line.slice(3)}</h3>
          }
          if (line.startsWith('- ')) {
            return <li key={i} className="text-[11px] text-pi-text ml-4 list-disc">{line.slice(2)}</li>
          }
          if (line.trim() === '') {
            return <div key={i} className="h-2" />
          }
          return <p key={i} className="text-[11px] text-pi-text leading-relaxed">{line}</p>
        })}
      </div>
    )
  }

  // Data — JSON viewer
  if (output.type === 'data') {
    let formatted = content
    try {
      formatted = JSON.stringify(JSON.parse(content), null, 2)
    } catch { /* not JSON — show raw */ }

    return (
      <pre className="px-4 py-3 text-[10px] font-mono text-pi-text overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
        {formatted}
      </pre>
    )
  }

  // HTML — render in iframe sandbox
  if (output.type === 'html') {
    return (
      <div className="px-4 py-3">
        <iframe
          srcDoc={content}
          sandbox="allow-scripts"
          className="w-full h-[400px] bg-white rounded border border-pi-border"
          title={output.title}
        />
      </div>
    )
  }

  // Code — syntax highlighted
  if (output.type === 'code') {
    return (
      <div className="relative">
        <pre className="px-4 py-3 text-[10px] font-mono leading-relaxed overflow-x-auto bg-[#0d0d14] rounded">
          <code dangerouslySetInnerHTML={{ __html: highlightCode(content) }} />
        </pre>
      </div>
    )
  }

  // Text / Log / default — plain with wrapping
  return (
    <pre className={cn(
      'px-4 py-3 text-[11px] font-mono text-pi-text overflow-x-auto leading-relaxed whitespace-pre-wrap',
      output.type === 'log' && 'text-[10px] text-pi-text-dim'
    )}>
      {content}
    </pre>
  )
}
