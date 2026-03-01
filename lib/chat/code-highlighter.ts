export const LANG_LABELS: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TSX', js: 'JavaScript', jsx: 'JSX',
  css: 'CSS', html: 'HTML', json: 'JSON', md: 'Markdown',
  bash: 'Bash', sh: 'Shell', sql: 'SQL', py: 'Python',
  yaml: 'YAML', yml: 'YAML', xml: 'XML', graphql: 'GraphQL',
  typescript: 'TypeScript', javascript: 'JavaScript',
}

/**
 * Single-pass tokenizer-based code highlighter.
 * Colors tuned for dark backgrounds (v0 style).
 */
export function highlightCode(code: string, lang: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const l = lang.toLowerCase()
  const isJS = ['ts','tsx','js','jsx','typescript','javascript'].includes(l)
  const isCSS = ['css','scss'].includes(l)
  const isJSON = ['json'].includes(l)
  const isBash = ['bash','sh'].includes(l)
  const isHTML = ['html'].includes(l)

  const JS_KEYWORDS = new Set('import,export,from,default,const,let,var,function,return,if,else,for,while,class,extends,new,this,typeof,instanceof,async,await,try,catch,throw,switch,case,break,continue,interface,type,enum,implements,abstract,declare,readonly,as,is,in,of,yield'.split(','))
  const JS_BUILTINS = new Set('true,false,null,undefined,console,document,window,Promise,Array,Object,Map,Set,Error,React,useState,useEffect,useRef,useCallback,useMemo'.split(','))
  const BASH_CMDS = new Set('npm,npx,yarn,pnpm,git,cd,ls,rm,mkdir,cp,mv,echo,export,sudo,curl,wget'.split(','))

  type Token = { type: 'comment'|'string'|'keyword'|'builtin'|'number'|'tag'|'property'|'plain'; text: string }
  const tokens: Token[] = []
  let i = 0

  const addPlain = (text: string) => {
    if (!text) return
    const last = tokens[tokens.length - 1]
    if (last?.type === 'plain') last.text += text
    else tokens.push({ type: 'plain', text })
  }

  while (i < code.length) {
    if ((isJS || isBash || isCSS) && (isJS || isCSS ? code[i] === '/' && code[i+1] === '/' : code[i] === '#')) {
      const start = i
      while (i < code.length && code[i] !== '\n') i++
      tokens.push({ type: 'comment', text: code.slice(start, i) })
      continue
    }
    if ((isJS || isCSS) && code[i] === '/' && code[i+1] === '*') {
      const start = i
      i += 2
      while (i < code.length && !(code[i-1] === '*' && code[i] === '/')) i++
      i++
      tokens.push({ type: 'comment', text: code.slice(start, i) })
      continue
    }
    if (code[i] === '"' || code[i] === "'" || code[i] === '`') {
      const quote = code[i]
      const start = i
      i++
      while (i < code.length && code[i] !== quote) { if (code[i] === '\\') i++; i++ }
      i++
      tokens.push({ type: 'string', text: code.slice(start, i) })
      continue
    }
    if (/[\w$]/.test(code[i])) {
      const start = i
      while (i < code.length && /[\w$.]/.test(code[i])) i++
      const word = code.slice(start, i)
      if (isJS && JS_KEYWORDS.has(word)) tokens.push({ type: 'keyword', text: word })
      else if (isJS && JS_BUILTINS.has(word)) tokens.push({ type: 'builtin', text: word })
      else if (isBash && BASH_CMDS.has(word)) tokens.push({ type: 'keyword', text: word })
      else if (isJSON && /^(true|false|null)$/.test(word)) tokens.push({ type: 'builtin', text: word })
      else if (/^\d+\.?\d*$/.test(word)) tokens.push({ type: 'number', text: word })
      else addPlain(word)
      continue
    }
    if ((isJS || isHTML) && code[i] === '<' && /[a-zA-Z\/]/.test(code[i+1] || '')) {
      const prefix = code[i] + (code[i+1] === '/' ? '/' : '')
      i += prefix.length
      const start = i
      while (i < code.length && /[\w.-]/.test(code[i])) i++
      const tagName = code.slice(start, i)
      if (tagName) {
        addPlain(esc(prefix.replace('/', '&#47;')))
        tokens.push({ type: 'tag', text: tagName })
      } else {
        addPlain(esc(prefix))
      }
      continue
    }
    if (isCSS && /[a-zA-Z-]/.test(code[i])) {
      const start = i
      while (i < code.length && /[\w-]/.test(code[i])) i++
      const word = code.slice(start, i)
      const rest = code.slice(i)
      if (/^\s*:/.test(rest) && !rest.startsWith('://')) {
        tokens.push({ type: 'property', text: word })
      } else if (word.startsWith('@')) {
        tokens.push({ type: 'keyword', text: word })
      } else {
        addPlain(word)
      }
      continue
    }
    addPlain(code[i])
    i++
  }

  // Dark-bg color palette (v0 style)
  const colorMap: Record<Token['type'], string> = {
    comment: 'text-forge-text-dim italic',
    string: 'text-emerald-400',
    keyword: 'text-violet-400 font-medium',
    builtin: 'text-sky-400',
    number: 'text-amber-400',
    tag: 'text-rose-400',
    property: 'text-sky-400',
    plain: '',
  }
  return tokens.map(t => {
    const escaped = esc(t.text)
    return t.type === 'plain' ? escaped : `<span class="${colorMap[t.type]}">${escaped}</span>`
  }).join('')
}
