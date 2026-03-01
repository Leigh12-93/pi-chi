import DOMPurify from 'dompurify'
import { highlightCode } from './code-highlighter'
import { LANG_LABELS } from './code-highlighter'

const PURIFY_CONFIG = {
  ALLOWED_TAGS: [
    'div', 'span', 'p', 'br', 'hr', 'pre', 'code', 'button',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'em', 'b', 'i', 'u', 's',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'blockquote', 'a', 'img',
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'style', 'href', 'src', 'alt', 'title', 'target', 'rel',
    'onclick',
  ],
  ALLOW_DATA_ATTR: false,
}

if (typeof window !== 'undefined') {
  DOMPurify.addHook('uponSanitizeAttribute', (node: Element, data) => {
    if (data.attrName === 'onclick') {
      const val = String(data.attrValue || '')
      if (node.tagName !== 'BUTTON' || !val.startsWith('navigator.clipboard')) {
        data.keepAttr = false
      }
    }
  })
}

function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') {
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, '')
      .replace(/javascript\s*:/gi, '')
  }
  return DOMPurify.sanitize(html, PURIFY_CONFIG)
}

let _codeBlockId = 0

function renderMarkdown(text: string): string {
  const codeBlocks: string[] = []
  let processed = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, lang: string, code: string) => {
    const id = `code-block-${++_codeBlockId}`
    const label = LANG_LABELS[lang] || lang || 'Code'
    const highlighted = lang ? highlightCode(code.trimEnd(), lang) : code.trimEnd().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const html = `<div class="code-block-wrapper relative group/code my-3 rounded-xl overflow-hidden border border-forge-border dark:border-gray-800">
      <div class="flex items-center justify-between px-3.5 py-2 bg-gray-50 dark:bg-gray-900 border-b border-forge-border dark:border-gray-800">
        <span class="text-[11px] font-medium text-forge-text-dim tracking-wide">${label}</span>
        <button onclick="navigator.clipboard.writeText(document.getElementById('${id}').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)})" class="text-[11px] text-forge-text-dim hover:text-forge-text transition-colors px-2 py-0.5 rounded hover:bg-forge-surface">Copy</button>
      </div>
      <pre class="bg-gray-50 dark:bg-gray-950 text-gray-800 dark:text-gray-200 p-4 overflow-x-auto text-[12.5px] font-mono leading-relaxed"><code id="${id}">${highlighted}</code></pre>
    </div>`
    codeBlocks.push(html)
    return `%%CODEBLOCK_${codeBlocks.length - 1}%%`
  })

  // Tables
  processed = processed.replace(/^(\|.+\|)\n(\|[\s:|-]+\|)\n((?:\|.+\|\n?)+)/gm,
    (_match, headerRow: string, _separator: string, bodyRows: string) => {
      const headers = headerRow.split('|').slice(1, -1).map((h: string) => h.trim())
      const rows = bodyRows.trim().split('\n').map((row: string) => row.split('|').slice(1, -1).map((c: string) => c.trim()))
      return `<table class="w-full text-[12.5px] my-3 border-collapse border border-forge-border rounded-lg overflow-hidden">
        <thead><tr>${headers.map((h: string) => `<th class="px-3 py-1.5 text-left bg-forge-surface border border-forge-border font-semibold text-forge-text">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((cells: string[]) => `<tr>${cells.map((c: string) => `<td class="px-3 py-1.5 border border-forge-border text-forge-text-dim">${c}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`
    })

  // Blockquotes
  processed = processed.replace(/^(?:&gt;|>) (.+)$/gm, '<blockquote class="border-l-2 border-forge-border-bright pl-3 my-1.5 text-forge-text-dim italic text-[13px]">$1</blockquote>')
  processed = processed.replace(/<\/blockquote>\n<blockquote[^>]*>/g, '<br/>')

  // Horizontal rules
  processed = processed.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr class="my-4 border-forge-border" />')

  // Inline formatting
  processed = processed
    .replace(/`([^`]+)`/g, '<code class="bg-forge-surface px-1.5 py-0.5 rounded text-[12.5px] font-mono text-forge-text border border-forge-border">$1</code>')
    .replace(/^### (.+)$/gm, '<h3 class="text-[13.5px] font-semibold mt-4 mb-1.5 text-forge-text">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-bold mt-4 mb-2 text-forge-text">$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-forge-text">$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^\d+\. (.+)$/gm, '<li class="ml-5 pl-1 list-decimal text-[13.5px] leading-[1.7]">$1</li>')
    .replace(/^- (.+)$/gm, '<li class="ml-5 pl-1 list-disc text-[13.5px] leading-[1.7]">$1</li>')
    .replace(/\n\n/g, '</p><p class="mt-2">')
    .replace(/\n/g, '<br/>')

  // Restore code blocks
  processed = processed.replace(/%%CODEBLOCK_(\d+)%%/g, (_m, idx) => codeBlocks[parseInt(idx)] || '')

  return processed
}

const _mdCache = new Map<string, string>()

export function cachedRenderMarkdown(text: string): string {
  let html = _mdCache.get(text)
  if (html) return html
  html = sanitizeHtml(renderMarkdown(text))
  _mdCache.set(text, html)
  if (_mdCache.size > 300) {
    const firstKey = _mdCache.keys().next().value
    if (firstKey !== undefined) _mdCache.delete(firstKey)
  }
  return html
}

export function clearMarkdownCache(): void {
  _mdCache.clear()
}
