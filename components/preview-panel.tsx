'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import {
  RefreshCw, Monitor, Smartphone, Tablet, AlertTriangle,
  Square, Loader2, Zap, ExternalLink, Maximize2, Minimize2,
  Globe, Terminal, X, ArrowUpFromLine, Camera,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn, hashFileMapDeep } from '@/lib/utils'

interface ConsoleEntry {
  timestamp: string
  level: 'log' | 'warn' | 'error' | 'info' | 'system'
  message: string
  source?: 'preview' | 'sandbox' | 'forge'
}

interface PreviewPanelProps {
  files: Record<string, string>
  projectId?: string | null
  onFixErrors?: (errorSummary: string) => void
  onCapturePreview?: (summary: string) => void
}

type ViewMode = 'desktop' | 'tablet' | 'mobile'

type SandboxStatus = 'idle' | 'initializing' | 'running' | 'error'

type BuildPhase = 'analyzing' | 'uploading' | 'building' | 'starting' | 'ready' | null

const STATUS_LABELS: Record<SandboxStatus, string> = {
  idle: '',
  initializing: 'Creating preview...',
  running: 'Live',
  error: 'Error',
}

const PHASE_LABELS: Record<Exclude<BuildPhase, null>, string> = {
  analyzing: 'Analyzing project',
  uploading: 'Uploading files',
  building: 'Building preview',
  starting: 'Starting dev server',
  ready: 'Ready!',
}

const PHASE_ORDER: Exclude<BuildPhase, null>[] = ['analyzing', 'uploading', 'building', 'starting', 'ready']

/** Script injected into static preview iframes to capture console output and runtime errors */
const PREVIEW_ERROR_SCRIPT = `<script>
(function(){
  window.onerror=function(msg,url,line,col,err){
    window.parent.postMessage({type:'forge-preview',level:'error',
      message:String(msg),line:line,col:col,stack:err&&err.stack||''},'*');
    return false;
  };
  window.addEventListener('unhandledrejection',function(e){
    window.parent.postMessage({type:'forge-preview',level:'error',
      message:'Unhandled Promise: '+(e.reason&&e.reason.message||String(e.reason))},'*');
  });
  ['log','warn','error','info'].forEach(function(m){
    var o=console[m];
    console[m]=function(){
      var a=[].slice.call(arguments).map(function(v){
        try{return typeof v==='object'?JSON.stringify(v):String(v)}catch(e){return String(v)}
      });
      window.parent.postMessage({type:'forge-preview',level:m,message:a.join(' ')},'*');
      o.apply(console,arguments);
    };
  });
})();
</script>`

// Minimum files needed before auto-starting sandbox
function isProjectReady(files: Record<string, string>): boolean {
  const paths = Object.keys(files)
  if (paths.length < 3) return false
  const hasPackageJson = paths.includes('package.json')
  const hasMainFile = paths.some(p =>
    p === 'app/page.tsx' || p === 'app/page.jsx' ||
    p === 'src/app/page.tsx' || p === 'src/app/page.jsx' ||
    p === 'pages/index.tsx' || p === 'pages/index.jsx' ||
    p === 'src/App.tsx' || p === 'src/App.jsx' ||
    p === 'index.html'
  )
  return hasPackageJson && hasMainFile
}

function BuildingPlaceholder({ files }: { files: Record<string, string> }) {
  const fileNames = Object.keys(files)
  const mainFile = fileNames.find(f => f === 'app/page.tsx')
    || fileNames.find(f => f === 'src/App.tsx')
    || fileNames.find(f => f.endsWith('/page.tsx'))
    || fileNames.find(f => f.endsWith('.tsx'))
  const hasPackageJson = fileNames.includes('package.json')
  let framework = 'React'
  if (hasPackageJson) {
    try {
      const pkg = JSON.parse(files['package.json'] || '{}')
      const deps = { ...pkg.dependencies, ...pkg.devDependencies }
      if (deps['next']) framework = 'Next.js'
      else if (deps['vite']) framework = 'Vite'
    } catch { /* ignore */ }
  }

  return (
    <div className="flex items-center justify-center h-full bg-forge-bg text-forge-text-dim">
      <div className="text-center max-w-xs">
        <div className="w-12 h-12 mx-auto mb-4 rounded-xl bg-forge-surface border border-forge-border flex items-center justify-center">
          <Loader2 className="w-5 h-5 text-forge-accent animate-spin" />
        </div>
        <p className="text-sm font-medium text-forge-text mb-1">{framework} project detected</p>
        <p className="text-xs text-forge-text-dim mb-4">
          {mainFile
            ? `Waiting for sandbox to render ${mainFile.split('/').pop()}`
            : 'JSX projects need a live sandbox for preview'}
        </p>
        <div className="text-left bg-forge-surface rounded-lg p-3 border border-forge-border">
          <p className="text-[10px] text-forge-text-dim/70 uppercase tracking-wider mb-2 font-medium">Project files ({fileNames.length})</p>
          <div className="space-y-0.5 max-h-32 overflow-y-auto">
            {fileNames.slice(0, 12).map(f => (
              <div key={f} className="text-[11px] font-mono text-forge-text-dim truncate">{f}</div>
            ))}
            {fileNames.length > 12 && (
              <div className="text-[10px] text-forge-text-dim/50">+{fileNames.length - 12} more</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Phase step indicator - shows a check for done, spinner for active, dot for pending */
function PhaseStepIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return (
      <svg className="w-3 h-3 text-emerald-500 forge-ready-check" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.1" />
        <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    )
  }
  if (state === 'active') {
    return <Loader2 className="w-3 h-3 text-forge-accent animate-spin" />
  }
  return <div className="w-2 h-2 rounded-full bg-forge-border" />
}

/** Phased build lifecycle stepper rendered below the building browser */
function BuildPhaseIndicator({ phase }: { phase: BuildPhase }) {
  if (!phase) return null
  const currentIdx = PHASE_ORDER.indexOf(phase as Exclude<BuildPhase, null>)

  return (
    <div className="forge-build-phase">
      {PHASE_ORDER.filter(p => p !== 'ready').map((p, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'pending'
        return (
          <div key={p} className="flex items-center gap-1.5">
            {i > 0 && <div className={cn('forge-phase-connector', state === 'done' && 'done')} />}
            <div className={cn('forge-phase-step', state === 'active' && 'active', state === 'done' && 'done')}>
              <PhaseStepIcon state={state} />
              <span className="hidden sm:inline">{PHASE_LABELS[p]}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Detect missing imports in project files — catches errors BEFORE they crash the sandbox */
function detectMissingImports(files: Record<string, string>): string[] {
  const filePaths = new Set(Object.keys(files))
  const errors: string[] = []

  // Build a set of resolvable paths (with common extensions)
  const resolvable = new Set<string>()
  for (const p of filePaths) {
    resolvable.add(p)
    // Strip extensions for bare import matching
    resolvable.add(p.replace(/\.(tsx?|jsx?|mjs|cjs)$/, ''))
    // Also add /index variants
    const dir = p.replace(/\/index\.(tsx?|jsx?|mjs|cjs)$/, '')
    if (dir !== p) resolvable.add(dir)
  }

  for (const [filePath, content] of Object.entries(files)) {
    if (!filePath.match(/\.(tsx?|jsx?|mjs)$/)) continue

    // Match: import ... from '@/...' or from './' or from '../'
    const importRegex = /import\s+(?:[\w{},\s*]+)\s+from\s+['"](@\/[^'"]+|\.\.?\/[^'"]+)['"]/g
    let match: RegExpExecArray | null
    while ((match = importRegex.exec(content)) !== null) {
      let importPath = match[1]

      // Resolve @/ to root
      if (importPath.startsWith('@/')) {
        importPath = importPath.slice(2)
      } else {
        // Resolve relative imports
        const dir = filePath.split('/').slice(0, -1).join('/')
        const parts = importPath.split('/')
        const resolved: string[] = dir ? dir.split('/') : []
        for (const part of parts) {
          if (part === '..') resolved.pop()
          else if (part !== '.') resolved.push(part)
        }
        importPath = resolved.join('/')
      }

      // Check if it resolves to an existing file
      if (!resolvable.has(importPath) &&
          !resolvable.has(importPath + '/index') &&
          !filePaths.has(importPath + '.ts') &&
          !filePaths.has(importPath + '.tsx') &&
          !filePaths.has(importPath + '.js') &&
          !filePaths.has(importPath + '.jsx')) {
        // Extract the component/module name from the import statement
        const nameMatch = match[0].match(/import\s+(?:{?\s*(\w+)[\s,}]|(\w+))/)
        const name = nameMatch?.[1] || nameMatch?.[2] || importPath.split('/').pop()
        errors.push(`Missing module: "${match[1]}" imported in ${filePath} (${name} not found)`)
      }
    }
  }

  return [...new Set(errors)] // dedup
}

/** Known sandbox/browser noise patterns that are NOT fixable by editing user code */
const SANDBOX_NOISE_PATTERNS = [
  /tracking prevention/i,                        // Edge Tracking Prevention
  /access to storage.*has been blocked/i,         // Edge/Safari storage blocking
  /blocked.*cross-site/i,                         // Cross-site cookie blocking
  /third-party cookie/i,                          // Third-party cookie warnings
  /Failed to read.*localStorage/i,                // iframe storage restrictions
  /Failed to read.*sessionStorage/i,
  /SecurityError.*blocked a frame/i,              // iframe cross-origin blocks
  /ResizeObserver loop/i,                         // Benign ResizeObserver warning
  /Loading chunk \d+ failed/i,                    // Transient chunk loading (sandbox rebuilding)
  /ChunkLoadError/i,
  /Loading CSS chunk/i,
  /vusercontent\.net/i,                           // v0 sandbox internal errors
  /Minified React error/i,                        // React minified errors (from sandbox build, not user code)
  /The above error occurred in/i,                 // React error boundary info message
  /Consider adding an error boundary/i,
  /NEXT_REDIRECT/i,                               // Next.js internal redirect (not a real error)
  /Hydration failed because/i,                    // Sandbox hydration (transient during rebuild)
  /Text content does not match/i,                 // Sandbox hydration mismatch
]

/** Check if an error message is known sandbox/browser noise */
function isSandboxNoise(msg: string): boolean {
  return SANDBOX_NOISE_PATTERNS.some(pattern => pattern.test(msg))
}
/** Normalize error messages for dedup — strip line numbers, stack frames, collapse whitespace */
function normalizeError(msg: string): string {
  return msg
    .replace(/:\d+:\d+/g, '')     // strip line:col
    .replace(/at .+\n?/g, '')     // strip stack frames
    .replace(/\s+/g, ' ')         // collapse whitespace
    .trim()
    .slice(0, 200)                // cap length
}

export function PreviewPanel({ files, projectId, onFixErrors, onCapturePreview }: PreviewPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('desktop')
  const [refreshKey, setRefreshKey] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([])

  // Sandbox state
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus>('idle')
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null)
  const [sandboxError, setSandboxError] = useState<string | null>(null)
  const [cachedSandboxUrl, setCachedSandboxUrl] = useState<string | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedFilesRef = useRef<string>('0')  // hash, not JSON
  const startingRef = useRef(false) // prevent double-starts
  const hasAutoStartedRef = useRef(false) // only auto-start once per session
  const sandboxAvailableRef = useRef<boolean | null>(null) // cached sandbox availability check
  const abortRef = useRef<AbortController | null>(null) // cancel inflight requests
  const retryCountRef = useRef(0) // auto-retry counter
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null) // clear retry on unmount
  const consoleEndRef = useRef<HTMLDivElement | null>(null) // auto-scroll console
  const [iframeLoading, setIframeLoading] = useState(false) // iframe load indicator
  const [buildPhase, setBuildPhase] = useState<BuildPhase>(null) // phased lifecycle
  const [isCrossfading, setIsCrossfading] = useState(false) // transition from building to live
  const crossfadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null) // cleanup crossfade
  const sandboxUrlRef = useRef<string | null>(null) // stable ref for sync effect
  const errorAutoFeedRef = useRef<Map<string, number>>(new Map()) // error → attempt count (cap at 3)
  const errorFeedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [iframeError, setIframeError] = useState<string | null>(null)
  const lastAutoFeedRef = useRef(0) // global cooldown for error auto-feed
  const consoleLogsRef = useRef(consoleLogs) // stable ref for message listener
  const onFixErrorsRef = useRef(onFixErrors) // stable ref to avoid stale closure in setTimeout

  // Keep refs in sync without causing re-renders in message listener
  useEffect(() => { consoleLogsRef.current = consoleLogs }, [consoleLogs])
  useEffect(() => { onFixErrorsRef.current = onFixErrors }, [onFixErrors])

  // Missing imports detected in project files
  const [missingImports, setMissingImports] = useState<string[]>([])
  const missingImportsFedRef = useRef(false) // only auto-feed once per set of missing imports

  // Clear error autofeed state on project switch
  useEffect(() => {
    errorAutoFeedRef.current.clear()
    lastAutoFeedRef.current = 0
    missingImportsFedRef.current = false
    setMissingImports([])
  }, [projectId])

  const addLog = useCallback((msg: string, level: ConsoleEntry['level'] = 'system', source: ConsoleEntry['source'] = 'forge') => {
    const ts = new Date().toLocaleTimeString('en-AU', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setConsoleLogs(prev => {
      const next = [...prev.slice(-199), { timestamp: ts, level, message: msg, source }]
      requestAnimationFrame(() => consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
      return next
    })
  }, [])

  // Warm up: pre-check sandbox availability on mount so it's ready instantly
  useEffect(() => {
    if (projectId && sandboxAvailableRef.current === null) {
      fetch('/api/sandbox?check=true')
        .then(res => res.json())
        .then(data => { sandboxAvailableRef.current = data.available === true })
        .catch(() => { sandboxAvailableRef.current = false })
    }
  }, [projectId])

  // Cache sandbox URL when it's live so we can show it after sandbox dies
  useEffect(() => {
    if (sandboxUrl && sandboxStatus === 'running') {
      setCachedSandboxUrl(sandboxUrl)
      if (projectId) {
        try { sessionStorage.setItem(`forge-sandbox-${projectId}`, sandboxUrl) } catch {}
      }
    }
  }, [sandboxUrl, sandboxStatus, projectId])

  // Restore cached sandbox URL on mount
  useEffect(() => {
    if (projectId && !cachedSandboxUrl) {
      try {
        const cached = sessionStorage.getItem(`forge-sandbox-${projectId}`)
        if (cached) setCachedSandboxUrl(cached)
      } catch {}
    }
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stable boolean deps for project type — avoids recomputation on content-only file changes
  const hasNextConfig = !!files['next.config.ts'] || !!files['next.config.js']
  const hasViteConfig = !!files['vite.config.ts'] || !!files['vite.config.js']
  const hasStaticIndex = !!files['index.html']
  const hasViteMain = !!files['src/main.tsx'] || !!files['src/main.jsx']
  const hasNextPage = !!files['app/page.tsx'] || !!files['app/page.jsx'] || !!files['src/app/page.tsx'] || !!files['src/app/page.jsx'] || !!files['pages/index.tsx'] || !!files['pages/index.jsx']

  const projectType = useMemo(() => {
    if (hasNextConfig) return 'nextjs'
    if (hasViteConfig) return 'vite'
    if (hasStaticIndex && !hasViteMain && !hasNextPage) return 'static'
    if (hasViteMain) return 'vite'
    if (hasNextPage) return 'nextjs'
    return 'unknown'
  }, [hasNextConfig, hasViteConfig, hasStaticIndex, hasViteMain, hasNextPage])

  // Log status changes to console
  useEffect(() => {
    if (sandboxStatus !== 'idle') {
      const label = STATUS_LABELS[sandboxStatus]
      if (label) addLog(label, 'system', 'sandbox')
    }
  }, [sandboxStatus, addLog])

  // Log errors to console
  useEffect(() => {
    if (sandboxError) addLog(sandboxError, 'error', 'sandbox')
  }, [sandboxError, addLog])

  // Helper to create empty state HTML
  const createEmptyState = (title: string, subtitle: string) => {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script></head>
<body class="min-h-screen bg-white flex items-center justify-center">
  <div class="text-center text-gray-500 max-w-sm">
    <div class="w-12 h-12 mx-auto mb-4 rounded-xl bg-gray-100 flex items-center justify-center">
      <svg class="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
      </svg>
    </div>
    <p class="text-sm font-medium text-gray-900 mb-1">${title}</p>
    <p class="text-xs text-gray-400">${subtitle}</p>
  </div>
</body></html>`
  }

  // Extract only the content that affects static preview — stable primitive deps
  // Writing components/button.tsx won't trigger a preview recomputation
  const previewMainFile = files['src/App.tsx'] || files['src/App.jsx'] || files['app/page.tsx'] || files['app/page.jsx'] || files['src/app/page.tsx'] || files['src/app/page.jsx'] || files['pages/index.tsx'] || files['pages/index.jsx'] || ''
  const previewIndexHtml = files['index.html'] || ''
  const previewCss = files['app/globals.css'] || files['src/index.css'] || ''
  const previewFileCount = Object.keys(files).length

  // Compute preview HTML — only reruns when preview-relevant content actually changes
  const computedPreviewHtml = useMemo(() => {
    try {
      if (previewFileCount === 0) {
        return createEmptyState('No preview available', 'Start building to see a preview')
      }

      if (projectType === 'static' && previewIndexHtml) {
        const headIdx = previewIndexHtml.toLowerCase().indexOf('<head>')
        if (headIdx !== -1) {
          return previewIndexHtml.slice(0, headIdx + 6) + PREVIEW_ERROR_SCRIPT + previewIndexHtml.slice(headIdx + 6)
        }
        return PREVIEW_ERROR_SCRIPT + previewIndexHtml
      }

      if (!previewMainFile) {
        if (projectType === 'nextjs') return createEmptyState('Next.js project', 'Waiting for app/page.tsx...')
        if (projectType === 'vite') return createEmptyState('Vite project', 'Waiting for src/App.tsx...')
        return createEmptyState('Building...', 'Preview will appear when ready')
      }

      // If the project has JSX/TSX files, don't attempt fragile regex extraction —
      // return a sentinel so the render layer can show BuildingPlaceholder instead
      const hasJSX = Object.keys(files).some(f => f.endsWith('.tsx') || f.endsWith('.jsx'))
      if (hasJSX && projectType !== 'static') {
        return '__JSX_BUILDING_PLACEHOLDER__'
      }

      // Multi-pattern JSX extraction — handles return(), return <>, arrow => (), arrow => <>
      const jsxPatterns = [
        /return\s*\(\s*([\s\S]*)\s*\)\s*;?\s*\}?\s*$/m,           // return ( ... )
        /return\s*(<[\s\S]*>)\s*;?\s*\}?\s*$/m,                   // return <...>
        /=>\s*\(\s*([\s\S]*)\s*\)\s*;?\s*$/m,                     // => ( ... )
        /=>\s*(<[\s\S]*>)\s*;?\s*$/m,                             // => <...>
      ]
      let jsx = '<div class="p-8 text-center">Building...</div>'
      for (const pattern of jsxPatterns) {
        const match = previewMainFile.match(pattern)
        if (match) { jsx = match[1]; break }
      }

      jsx = jsx
        .replace(/className=/g, 'class=')
        .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')                     // strip JSX comments
        .replace(/\{`([^`]*)`\}/g, '$1')                          // template literals → text
        .replace(/\{"([^"]*)"\}/g, '$1')                           // double-quoted strings → text
        .replace(/\{'([^']*)'\}/g, '$1')                           // single-quoted strings → text
        .replace(/<([A-Z]\w*)\s*\/>/g, '')                         // remove self-closing custom components
        .replace(/<([a-z][a-z0-9]*)\s*\/>/g, '<$1></$1>')          // expand self-closing HTML tags
        .replace(/<([A-Z]\w*)[\s\S]*?<\/\1>/g, '')                 // remove custom component blocks
        .replace(/\{[^}]*\}/g, '')                                 // strip remaining expressions

      const hasTailwind = projectType === 'nextjs' || projectType === 'vite' || previewCss.includes('tailwindcss') || previewCss.includes('tailwind')

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  ${PREVIEW_ERROR_SCRIPT}
  ${hasTailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : ''}
  <style>
    ${previewCss.replace(/@import\s+"tailwindcss";\s*/g, '').replace(/@import\s+'tailwindcss';\s*/g, '')}
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  ${jsx}
</body>
</html>`
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      return createEmptyState('Preview Error', errorMessage)
    }
  }, [previewFileCount, projectType, previewMainFile, previewIndexHtml, previewCss])

  // Debounced preview — prevents iframe from flickering during rapid AI file writes
  // The iframe srcDoc only updates after 800ms of stability
  const [previewHtml, setPreviewHtml] = useState(computedPreviewHtml)
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => {
      setPreviewHtml(computedPreviewHtml)
      setPreviewError(computedPreviewHtml.includes('>Preview Error<') ? 'Preview rendering failed' : null)
    }, 800)
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    }
  }, [computedPreviewHtml])

  // ─── Sandbox lifecycle ─────────────────────────────────────────

  const startSandbox = useCallback(async () => {
    if (!projectId || startingRef.current) return
    if (Object.keys(files).length === 0) return

    // Abort any inflight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    startingRef.current = true
    setSandboxStatus('initializing')
    setSandboxError(null)
    setSandboxUrl(null)
    setBuildPhase('analyzing')

    const fileCount = Object.keys(files).length

    // Phase: analyzing -> uploading (after brief analysis pause)
    setTimeout(() => setBuildPhase('uploading'), 600)
    addLog(`Uploading ${fileCount} files...`, 'info', 'sandbox')

    try {
      const res = await fetch('/api/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, files }),
        signal: controller.signal,
      })

      const data = await res.json()

      if (controller.signal.aborted) return

      if (!res.ok || !data.ok) {
        setSandboxStatus('error')
        setBuildPhase(null)
        setSandboxError(data.error || `Failed to create sandbox (HTTP ${res.status})`)

        // Auto-retry on transient errors (429, 500, 502, 503) up to 2 times
        if (retryCountRef.current < 2 && (res.status === 429 || res.status >= 500)) {
          retryCountRef.current++
          const delay = res.status === 429
            ? (parseInt(res.headers.get('Retry-After') || '5', 10) * 1000)
            : (2000 * retryCountRef.current)
          addLog(`Retrying in ${delay / 1000}s (attempt ${retryCountRef.current}/2)...`, 'warn', 'sandbox')
          retryTimerRef.current = setTimeout(() => {
            startingRef.current = false
            startSandbox()
          }, delay)
          return
        }
        return
      }

      retryCountRef.current = 0 // reset on success
      setBuildPhase('building')
      setSandboxUrl(data.demoUrl)
      sandboxUrlRef.current = data.demoUrl
      setIframeLoading(true) // will be cleared by iframe onLoad

      // Phase: building -> starting (after brief build period)
      setTimeout(() => setBuildPhase('starting'), 800)

      setSandboxStatus('running')
      lastSyncedFilesRef.current = hashFileMapDeep(files)

      const meta = [
        data.fileCount && `${data.fileCount} files uploaded`,
        data.skippedCount && `${data.skippedCount} skipped`,
      ].filter(Boolean).join(', ')
      if (meta) addLog(meta, 'info', 'sandbox')
    } catch (error) {
      if (controller.signal.aborted) return
      setSandboxStatus('error')
      setBuildPhase(null)
      setSandboxError(error instanceof Error ? error.message : 'Network error')
    } finally {
      if (!controller.signal.aborted) {
        startingRef.current = false
      }
    }
  }, [projectId, files, addLog])

  const stopSandbox = useCallback(async () => {
    if (!projectId) return

    // Abort any inflight request
    abortRef.current?.abort()

    try {
      await fetch('/api/sandbox', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
    } catch { /* ignore cleanup errors */ }

    setSandboxStatus('idle')
    setSandboxUrl(null)
    setSandboxError(null)
    setIsSyncing(false)
    setBuildPhase(null)
    setIsCrossfading(false)
    hasAutoStartedRef.current = false // allow re-auto-start on next file change
    sandboxAvailableRef.current = null // re-check availability on next attempt
    retryCountRef.current = 0
    addLog('Stopped — will auto-restart on next change', 'system', 'sandbox')
  }, [projectId, addLog])

  // ─── AUTO-START: launch sandbox when project looks ready ──────
  // v0-style: automatically start sandbox as soon as files meet minimum requirements.
  // No manual "Start" button — the preview just appears.
  useEffect(() => {
    if (sandboxStatus !== 'idle') return
    if (!projectId) return
    if (!isProjectReady(files)) return

    if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current)

    autoStartTimeoutRef.current = setTimeout(async () => {
      // Check if sandbox is available (re-check if previously unavailable to handle late config)
      if (sandboxAvailableRef.current === null || sandboxAvailableRef.current === false) {
        try {
          const res = await fetch('/api/sandbox?check=true')
          const data = await res.json()
          sandboxAvailableRef.current = data.available === true
        } catch {
          sandboxAvailableRef.current = false
        }
      }

      // Skip if sandbox is not configured — but allow retry on next file change
      if (!sandboxAvailableRef.current) {
        return // don't set hasAutoStartedRef so we retry when files change again
      }

      hasAutoStartedRef.current = true
      startSandbox()
    }, 500) // 0.5s debounce — start sandbox as fast as possible

    return () => {
      if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current)
    }
  }, [files, sandboxStatus, projectId, startSandbox])

  // ─── Debounced file sync to running sandbox ───────────────────
  useEffect(() => {
    if (sandboxStatus !== 'running' || !projectId) return

    const currentHash = hashFileMapDeep(files)
    if (currentHash === lastSyncedFilesRef.current) return

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)

    syncTimeoutRef.current = setTimeout(async () => {
      setIsSyncing(true)
      try {
        const res = await fetch('/api/sandbox', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, files }),
        })
        const data = await res.json()
        lastSyncedFilesRef.current = currentHash
        // Update sandbox URL if sync returned a new one (e.g. from re-init)
        if (data.demoUrl && data.demoUrl !== sandboxUrlRef.current) {
          setSandboxUrl(data.demoUrl)
          sandboxUrlRef.current = data.demoUrl
          setIframeLoading(true)
          addLog('Preview URL updated', 'info', 'sandbox')
        }
        if (data.synced > 0) {
          addLog(`${data.synced} files synced`, 'info', 'sandbox')
        }
      } catch {
        addLog('Sync failed — will retry on next change', 'warn', 'sandbox')
      } finally {
        setIsSyncing(false)
      }
    }, 2000)

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
    }
  }, [files, sandboxStatus, projectId, addLog])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
      if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current)
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current)
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
      if (crossfadeTimerRef.current) clearTimeout(crossfadeTimerRef.current)
      if (projectId && (sandboxStatus === 'running' || startingRef.current)) {
        fetch('/api/sandbox', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        }).catch(() => {})
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for console/error messages from preview iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const d = event.data
      if (!d || typeof d !== 'object' || d.type !== 'forge-preview') return
      const level = (['log', 'warn', 'error', 'info'].includes(d.level) ? d.level : 'log') as ConsoleEntry['level']
      const message = typeof d.message === 'string' ? d.message.slice(0, 1000) : String(d.message)
      if (!message) return
      // Filter known sandbox/browser noise — log dimmed but don't auto-feed to AI
      const isNoise = isSandboxNoise(message)
      if (isNoise) {
        // Still log it (as info, not error) so devs can see it, but don't alarm users
        addLog(`[sandbox] ${message}`, 'info', 'sandbox')
        return
      }

      addLog(message, level, 'preview')
      // Auto-open console on errors
      if (level === 'error') {
        setShowConsole(true)
        // Auto-feed error to AI (debounced, max 3 attempts per unique error)
        if (onFixErrorsRef.current) {
          const errorKey = normalizeError(message) // normalize for dedup
          const attempts = errorAutoFeedRef.current.get(errorKey) || 0
          if (attempts < 3) {
            // Global cooldown: skip if last auto-feed was <30s ago
            if (Date.now() - lastAutoFeedRef.current < 30000) return
            errorAutoFeedRef.current.set(errorKey, attempts + 1)
            // Debounce: wait 2s to batch multiple errors from same render
            if (errorFeedTimerRef.current) clearTimeout(errorFeedTimerRef.current)
            errorFeedTimerRef.current = setTimeout(() => {
              // Collect all recent unfed errors (use ref to avoid stale closure)
              const recentErrors = consoleLogsRef.current
                .filter(e => e.level === 'error')
                .map(e => e.message)
              // Include the current error too (it may not be in consoleLogs yet due to batched state)
              const allErrors = [...new Set([...recentErrors, message])]
              const errorText = allErrors.slice(-5).join('\n') // max 5 errors
              lastAutoFeedRef.current = Date.now()
              onFixErrorsRef.current?.(`[Auto-detected preview error — attempt ${attempts + 1}/3]\n\nThe preview has runtime errors. Please fix them:\n\n\`\`\`\n${errorText}\n\`\`\``)
            }, 2000)
          }
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [addLog]) // onFixErrors + consoleLogs accessed via refs to avoid stale closures + listener churn

  // ─── Capture preview content (for AI tool + UI button) ────────
  const capturePreviewContent = useCallback(() => {
    try {
      // Try static preview iframe first (same-origin srcdoc)
      const staticIframe = document.querySelector('iframe[title="Static Preview"]') as HTMLIFrameElement | null
      const sandboxIframe = document.getElementById('forge-preview-iframe') as HTMLIFrameElement | null
      const sandboxActive = sandboxStatus === 'running' && !!sandboxUrl
      const iframe = (sandboxActive && sandboxIframe) ? sandboxIframe : staticIframe

      if (!iframe) {
        return { error: 'No preview iframe available' }
      }

      try {
        const doc = iframe.contentDocument
        if (!doc) {
          return { error: 'Could not access preview content (cross-origin restriction)' }
        }
        const bodyText = doc.body?.innerText?.slice(0, 3000) || ''
        const title = doc.title || ''
        const elementCount = doc.querySelectorAll('*').length

        // Extract structural info
        const headings = Array.from(doc.querySelectorAll('h1,h2,h3')).map(h => h.textContent?.trim()).filter(Boolean).slice(0, 10)
        const buttons = Array.from(doc.querySelectorAll('button,a[role="button"]')).map(b => b.textContent?.trim()).filter(Boolean).slice(0, 10)
        const inputs = Array.from(doc.querySelectorAll('input,textarea,select')).map(i => (i as HTMLInputElement).placeholder || (i as HTMLInputElement).name || i.tagName).slice(0, 10)
        const images = doc.querySelectorAll('img').length

        return {
          title,
          bodyText,
          elementCount,
          headings,
          buttons,
          inputs,
          images,
          viewport: { width: iframe.clientWidth, height: iframe.clientHeight },
        }
      } catch {
        return { error: 'Could not access preview content (iframe restriction)' }
      }
    } catch {
      return { error: 'Preview capture failed unexpectedly' }
    }
  }, [sandboxStatus, sandboxUrl])

  // Listen for AI tool-triggered capture requests
  useEffect(() => {
    const handler = () => {
      const result = capturePreviewContent()
      window.dispatchEvent(new CustomEvent('forge:preview-captured', { detail: result }))
    }
    window.addEventListener('forge:capture-preview', handler)
    return () => window.removeEventListener('forge:capture-preview', handler)
  }, [capturePreviewContent])

  // Manual capture button handler
  const handleCaptureClick = useCallback(() => {
    const result = capturePreviewContent()
    if (onCapturePreview) {
      const parts: string[] = ['[Preview Capture — Manual]']
      if (result.error) {
        parts.push(`Error: ${result.error}`)
      } else {
        if (result.title) parts.push(`Title: ${result.title}`)
        if (result.elementCount) parts.push(`Elements: ${result.elementCount}`)
        if (result.headings?.length) parts.push(`Headings: ${result.headings.join(', ')}`)
        if (result.buttons?.length) parts.push(`Buttons: ${result.buttons.join(', ')}`)
        if (result.inputs?.length) parts.push(`Inputs: ${result.inputs.join(', ')}`)
        if (result.images) parts.push(`Images: ${result.images}`)
        if (result.viewport) parts.push(`Viewport: ${result.viewport.width}x${result.viewport.height}`)
        if (result.bodyText) parts.push(`\nVisible content:\n${result.bodyText}`)
      }
      onCapturePreview(parts.join('\n'))
    } else {
      // Fallback: dispatch event for use-forge-chat to pick up
      window.dispatchEvent(new CustomEvent('forge:preview-captured', { detail: result }))
    }
    addLog('Preview captured for AI review', 'info', 'forge')
  }, [capturePreviewContent, onCapturePreview, addLog])

  // Reset auto-feed attempts when files change (user or AI made fixes)
  const prevFileHashRef = useRef<string>('')
  useEffect(() => {
    const h = hashFileMapDeep(files)
    if (prevFileHashRef.current && h !== prevFileHashRef.current) {
      // Files changed — re-scan for missing imports
      missingImportsFedRef.current = false
    }
    prevFileHashRef.current = h

    // Scan for missing imports (debounced naturally by file hash check)
    const missing = detectMissingImports(files)
    setMissingImports(missing)

    // Auto-feed missing imports to AI (once per unique set)
    if (missing.length > 0 && !missingImportsFedRef.current && onFixErrorsRef.current) {
      missingImportsFedRef.current = true
      const errorText = missing.join('\n')
      // Small delay to let the AI finish current tool calls
      setTimeout(() => {
        onFixErrorsRef.current?.(`[Auto-detected missing imports]\n\nThe preview is crashing because of missing component files. Please create the missing files:\n\n\`\`\`\n${errorText}\n\`\`\`\n\nCreate each missing component with a proper default export. This is blocking the live preview.`)
      }, 3000)
    } else if (missing.length === 0) {
      setMissingImports([])
    }
  }, [files])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (errorFeedTimerRef.current) clearTimeout(errorFeedTimerRef.current)
    }
  }, [])

  // Escape exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isFullscreen])

  const widthClasses: Record<ViewMode, string> = {
    desktop: 'w-full',
    tablet: 'w-[768px] mx-auto',
    mobile: 'w-[375px] mx-auto',
  }

  const isSandboxActive = sandboxStatus === 'running' && sandboxUrl
  const isSandboxLoading = sandboxStatus === 'initializing'
  const isSandboxOffline = !isSandboxActive && !isSandboxLoading && !!cachedSandboxUrl
  const showCachedPreview = isSandboxOffline && sandboxStatus !== 'error'

  // Display URL for the URL bar — shows phase label during build
  const displayUrl = isSandboxActive
    ? sandboxUrl
    : isSandboxLoading
      ? (buildPhase ? PHASE_LABELS[buildPhase] : STATUS_LABELS[sandboxStatus])
      : showCachedPreview
        ? cachedSandboxUrl
        : 'Preview'

  const content = (
    <div className={cn(
      'h-full flex flex-col bg-forge-surface',
      isFullscreen && 'fixed inset-0 z-50',
    )}>
      {/* ─── Browser Chrome Header ─────────────────────────────── */}
      <div className="shrink-0 border-b border-forge-border bg-forge-panel">
        {/* Top bar with traffic lights + URL bar */}
        <div className="flex items-center gap-2 px-3 py-2">
          {/* Left: device mode buttons */}
          <div className="flex items-center gap-0.5 shrink-0">
            {([
              { mode: 'desktop' as ViewMode, Icon: Monitor, label: 'Desktop' },
              { mode: 'tablet' as ViewMode, Icon: Tablet, label: 'Tablet' },
              { mode: 'mobile' as ViewMode, Icon: Smartphone, label: 'Mobile' },
            ] as const).map(({ mode, Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                title={label}
                className={cn(
                  'relative p-2.5 sm:p-1.5 rounded-md transition-colors',
                  viewMode === mode
                    ? 'bg-forge-accent/15 text-forge-accent'
                    : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface',
                )}
              >
                <Icon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                {viewMode === mode && (
                  <motion.div
                    layoutId="device-indicator"
                    className="absolute bottom-0 left-1 right-1 h-0.5 bg-forge-accent rounded-full"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            ))}
          </div>

          {/* Center: URL bar */}
          <div className="flex-1 flex items-center min-w-0">
            <div className={cn(
              'flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-mono transition-colors',
              'bg-forge-surface border border-forge-border transition-all',
              isSandboxActive && 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/30',
              isSandboxLoading && 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30',
              sandboxStatus === 'error' && 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/30',
              showCachedPreview && 'border-forge-border bg-forge-surface/50',
            )}>
              {/* Status indicator */}
  {isSandboxActive && !isSyncing && (
  <div className="shrink-0 flex items-center gap-1 text-emerald-600 dark:text-emerald-400 animate-fade-in">
  <div className="relative">
  <Zap className="w-3 h-3" />
  <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
  </div>
  </div>
  )}
              {isSandboxActive && isSyncing && (
                <ArrowUpFromLine className="w-3 h-3 shrink-0 animate-pulse text-blue-500" />
              )}
              {isSandboxLoading && (
                <Loader2 className="w-3 h-3 shrink-0 animate-spin text-amber-600" />
              )}
              {sandboxStatus === 'error' && (
                <AlertTriangle className="w-3 h-3 shrink-0 text-red-500" />
              )}
              {showCachedPreview && (
                <Globe className="w-3 h-3 shrink-0 text-forge-text-dim/50" />
              )}
              {sandboxStatus === 'idle' && !showCachedPreview && !previewError && (
                <Globe className="w-3 h-3 shrink-0 text-forge-text-dim" />
              )}
              {sandboxStatus === 'idle' && !showCachedPreview && previewError && (
                <AlertTriangle className="w-3 h-3 shrink-0 text-red-500" />
              )}

              {/* URL text */}
              <span className={cn(
                'truncate select-all',
                isSandboxActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-forge-text-dim',
                isSandboxLoading && 'text-amber-600 dark:text-amber-400',
                sandboxStatus === 'error' && 'text-forge-danger',
                showCachedPreview && 'text-forge-text-dim/50',
              )}>
                {displayUrl}
              </span>

              {/* Sync badge */}
  {isSyncing && isSandboxActive && (
  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 text-[9px] font-medium bg-blue-500/10 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 rounded-full">
  <span className="w-1 h-1 rounded-full bg-blue-500 animate-pulse-dot" />
  SYNCING
                </span>
              )}

              {/* Offline badge */}
              {showCachedPreview && (
                <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-medium bg-forge-surface text-forge-text-dim rounded">
                  CACHED
                </span>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-0.5 shrink-0">
            {/* Capture preview for AI */}
            <button
              onClick={handleCaptureClick}
              className="p-2.5 sm:p-1.5 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
              title="Capture preview for AI review"
              aria-label="Capture preview for AI review"
            >
              <Camera className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </button>

            {/* Refresh */}
            <button
              onClick={() => {
                setRefreshKey(k => k + 1)
                // Flush any pending preview debounce immediately
                if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
                setPreviewHtml(computedPreviewHtml)
                if (isSandboxActive) addLog('Refreshed', 'system', 'sandbox')
              }}
              className="p-2.5 sm:p-1.5 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
              title="Refresh preview"
              aria-label="Refresh preview"
            >
              <RefreshCw className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </button>

            {/* Open in new tab */}
            {isSandboxActive && (
              <a
                href={sandboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2.5 sm:p-1.5 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
                title="Open in new tab"
                aria-label="Open in new tab"
              >
                <ExternalLink className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </a>
            )}

            {/* Console toggle */}
            <button
              onClick={() => setShowConsole(prev => !prev)}
              className={cn(
                'p-2.5 sm:p-1.5 rounded-md transition-colors relative',
                showConsole
                  ? 'bg-forge-accent/15 text-forge-accent'
                  : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface',
              )}
              title="Toggle console"
              aria-label={showConsole ? 'Hide console' : 'Show console'}
            >
              <Terminal className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              {!showConsole && consoleLogs.some(e => e.level === 'error') && (
                <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white text-[7px] font-bold flex items-center justify-center">
                  {Math.min(consoleLogs.filter(e => e.level === 'error').length, 9)}
                </span>
              )}
            </button>

            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen(prev => !prev)}
              className="p-2.5 sm:p-1.5 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen
                ? <Minimize2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                : <Maximize2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              }
            </button>

            {/* Stop button */}
            {(isSandboxActive || isSandboxLoading) && (
              <button
                onClick={stopSandbox}
                className={cn(
                  'p-2.5 sm:p-1.5 rounded-md transition-colors',
                  'text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30',
                )}
                title="Stop sandbox"
                aria-label="Stop sandbox"
              >
                <Square className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Preview Body ──────────────────────────────────────── */}
          <div className="flex-1 overflow-hidden bg-forge-bg relative">
        <div className={cn('h-full transition-all', widthClasses[viewMode])}>
          {/* Static preview iframe — always present as base layer, srcDoc updates reactively */}
          {previewHtml === '__JSX_BUILDING_PLACEHOLDER__' && !isSandboxActive && !showCachedPreview ? (
            <div className="absolute inset-0">
              <BuildingPlaceholder files={files} />
            </div>
          ) : (
            <iframe
              srcDoc={previewHtml === '__JSX_BUILDING_PLACEHOLDER__' ? '' : previewHtml}
              className={cn(
                'w-full h-full border-0 absolute inset-0 transition-opacity duration-300',
                (isSandboxActive || showCachedPreview) ? 'opacity-0 pointer-events-none' : 'opacity-100',
              )}
              sandbox="allow-scripts allow-same-origin"
              title="Static Preview"
              onError={() => setIframeError('Preview failed to load')}
            />
          )}

          {/* Cached sandbox iframe — shown dimmed when sandbox is offline */}
          {showCachedPreview && cachedSandboxUrl && (
            <div className="absolute inset-0">
              <iframe
                key={`cached-${cachedSandboxUrl}`}
                src={cachedSandboxUrl}
                className="w-full h-full border-0 opacity-40 pointer-events-none"
                title="Cached Preview"
                allow="cross-origin-isolated"
              />
              {/* Offline overlay */}
            <div className="absolute inset-0 flex items-center justify-center bg-forge-bg/30 backdrop-blur-[1px]">
              <div className="flex flex-col items-center gap-3 px-6 py-4 bg-forge-bg/95 backdrop-blur border border-forge-border rounded-xl shadow-lg">
                  <div className="w-10 h-10 rounded-full bg-forge-surface flex items-center justify-center">
                    <Globe className="w-5 h-5 text-forge-text-dim" />
                  </div>
                  <div className="text-center">
                    <p className="text-xs font-medium text-forge-text">Sandbox offline</p>
                    <p className="text-[10px] text-forge-text-dim mt-0.5">Showing cached preview</p>
                  </div>
                  <button
                    onClick={() => { hasAutoStartedRef.current = false; sandboxAvailableRef.current = null; retryCountRef.current = 0; startSandbox() }}
                    className="px-4 py-2.5 sm:px-3 sm:py-1.5 text-xs sm:text-[11px] font-medium bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover transition-colors"
                  >
                    Restart Sandbox
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Building animation — shows a miniature page being painted with phase stepper */}
          {/* Visible during: initializing, any active build phase, or crossfade-out to live */}
          {(isSandboxLoading || !!buildPhase || isCrossfading) && (
            <div className={cn('forge-building-scene animate-fade-in', isCrossfading && 'forge-ready-crossfade')}>
              <div className="forge-dots" />
              <div className="forge-glow" />

              {/* Mini browser frame */}
              <div className="forge-browser">
                {/* Browser title bar */}
                <div className="forge-browser-bar">
                  <div className="forge-traffic-dot" style={{ background: '#ff5f57' }} />
                  <div className="forge-traffic-dot" style={{ background: '#ffbd2e' }} />
                  <div className="forge-traffic-dot" style={{ background: '#28c840' }} />
                  <div className="forge-browser-url" />
                </div>

                {/* Navbar — paints in first */}
                <div className="forge-ui-row" style={{ ['--delay' as string]: '0.4s' } as React.CSSProperties}>
                  <div className="forge-navbar">
                    <div className="forge-nav-logo" />
                    <div className="forge-nav-links">
                      <div className="forge-nav-link" style={{ ['--w' as string]: '28px' } as React.CSSProperties} />
                      <div className="forge-nav-link" style={{ ['--w' as string]: '32px' } as React.CSSProperties} />
                      <div className="forge-nav-link" style={{ ['--w' as string]: '24px' } as React.CSSProperties} />
                    </div>
                  </div>
                </div>

                {/* Hero section */}
                <div className="forge-ui-row" style={{ ['--delay' as string]: '0.9s', ['--duration' as string]: '0.6s' } as React.CSSProperties}>
                  <div className="forge-hero">
                    <div className="forge-hero-title" />
                    <div className="forge-hero-sub" />
                    <div className="forge-hero-sub" style={{ width: '60%' }} />
                    <div className="forge-hero-btn" />
                  </div>
                </div>

                {/* Card grid */}
                <div className="forge-ui-row" style={{ ['--delay' as string]: '1.6s', ['--duration' as string]: '0.5s' } as React.CSSProperties}>
                  <div className="forge-cards">
                    {[
                      { color: '#eef2ff', delay: '1.8s' },
                      { color: '#f0fdf4', delay: '2.0s' },
                      { color: '#fef3c7', delay: '2.2s' },
                    ].map((card, i) => (
                      <div key={i} className="forge-card" style={{ ['--delay' as string]: card.delay } as React.CSSProperties}>
                        <div className="forge-card-icon" style={{ background: card.color }} />
                        <div className="forge-card-line" style={{ width: '80%' }} />
                        <div className="forge-card-line" style={{ width: '55%' }} />
                      </div>
                    ))}
                  </div>
                </div>

                {/* Typing cursor */}
                <div className="forge-cursor" />

                {/* Ready overlay — flashes green check when phase is ready */}
                {buildPhase === 'ready' && (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-forge-bg/60 backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-2 forge-ready-check">
                      <svg className="w-10 h-10 text-emerald-500" viewBox="0 0 40 40" fill="none">
                        <circle cx="20" cy="20" r="18" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
                        <path d="M12 20l6 6 10-10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Ready!</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Status below browser — phase stepper + label */}
              <div className="forge-build-status">
                {buildPhase !== 'ready' && (
                  <div className="forge-build-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
                <span className="text-xs font-medium text-forge-accent/70 tracking-wide">
                  {buildPhase ? PHASE_LABELS[buildPhase] : 'Building your preview'}
                </span>
                {Object.keys(files).length > 0 && buildPhase !== 'ready' && (
                  <span className="text-[10px] text-forge-text-dim/40">
                    {Object.keys(files).length} files
                  </span>
                )}
                {/* Phase stepper */}
                <BuildPhaseIndicator phase={buildPhase} />
              </div>

              {/* Progress track */}
              <div className="forge-progress-track">
                <div className="forge-progress-bar" />
              </div>
            </div>
          )}

          {/* Auto-starting status — shown briefly while sandbox initializes automatically */}
          {sandboxStatus === 'idle' && !showCachedPreview && isProjectReady(files) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 animate-fade-in">
                <div className="w-12 h-12 rounded-xl bg-forge-surface border border-forge-border flex items-center justify-center">
                  <Zap className="w-5 h-5 text-forge-accent animate-pulse" />
                </div>
                <span className="text-xs text-forge-text font-medium">
                  Preparing preview
                </span>
                <span className="text-[10px] text-forge-text-dim/60">
                  {Object.keys(files).length} files detected
                </span>
              </div>
            </div>
          )}

          {/* Missing imports overlay — shown when files have dangling imports */}
          {missingImports.length > 0 && (isSandboxActive || isSandboxLoading) && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-forge-bg/80 backdrop-blur-sm animate-fade-in">
              <div className="bg-forge-bg border border-red-300 dark:border-red-500/40 rounded-xl p-5 shadow-xl max-w-sm mx-4">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-forge-text">Missing Components</p>
                    <p className="text-xs text-forge-text-dim mt-1">The preview crashed because imported files don&apos;t exist yet:</p>
                    <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                      {missingImports.slice(0, 5).map((err, i) => (
                        <div key={i} className="text-[11px] font-mono text-red-500 dark:text-red-400 bg-red-500/5 rounded px-2 py-1">
                          {err.replace(/^Missing module: /, '')}
                        </div>
                      ))}
                      {missingImports.length > 5 && (
                        <div className="text-[10px] text-forge-text-dim">+{missingImports.length - 5} more</div>
                      )}
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-[10px] text-forge-accent">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>AI is creating missing files...</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sandbox error toast — non-blocking overlay at bottom */}
          {sandboxStatus === 'error' && sandboxError && (
            <div className="absolute bottom-3 left-3 right-3 z-10 animate-fade-in">
              <div className="bg-forge-bg/95 backdrop-blur border border-red-200 dark:border-red-500/30 rounded-lg p-3 shadow-lg flex items-start gap-2 max-w-sm mx-auto animate-shake">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-red-900">Sandbox Error</p>
                  <p className="text-[10px] text-red-600 font-mono truncate mt-0.5" title={sandboxError}>{sandboxError}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => { hasAutoStartedRef.current = false; sandboxAvailableRef.current = null; retryCountRef.current = 0; startSandbox() }}
                    className="px-2.5 py-1 bg-red-600 text-white text-[10px] rounded-md hover:bg-red-700 transition-colors font-medium"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => { setSandboxStatus('idle'); setSandboxError(null); hasAutoStartedRef.current = false }}
                    className="p-1 text-red-400 hover:text-red-600 transition-colors"
                    title="Dismiss (will auto-retry on next file change)"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Floating Fix with AI button — visible when console has errors, regardless of console panel state */}
          {!showConsole && consoleLogs.some(e => e.level === 'error') && onFixErrors && (
            <div className="absolute top-3 right-3 z-20 animate-fade-in">
              <button
                onClick={() => {
                  const errors = consoleLogs
                    .filter(e => e.level === 'error')
                    .map(e => e.message)
                    .join('\n')
                  onFixErrors(`The preview has runtime errors. Please fix them:\n\n\`\`\`\n${errors}\n\`\`\``)
                }}
                className="flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg shadow-lg transition-colors"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Fix {Math.min(consoleLogs.filter(e => e.level === 'error').length, 9)} error{consoleLogs.filter(e => e.level === 'error').length !== 1 ? 's' : ''} with AI</span>
              </button>
            </div>
          )}

          {/* Iframe error overlay */}
          {iframeError && (
            <div className="absolute top-3 left-3 right-3 z-10 animate-fade-in">
              <div className="bg-forge-bg/95 backdrop-blur border border-red-200 dark:border-red-500/30 rounded-lg p-3 shadow-lg flex items-center gap-2 max-w-sm mx-auto">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs text-red-700 flex-1">{iframeError}</p>
                <button
                  onClick={() => setIframeError(null)}
                  className="p-0.5 text-red-400 hover:text-red-600 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}

          {/* Live sandbox iframe */}
          {isSandboxActive && (
            <>
              {iframeLoading && (
                <div className="absolute top-3 right-3 z-10">
                  <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                </div>
              )}
              <iframe
                id="forge-preview-iframe"
                key={`sandbox-${refreshKey}`}
                src={sandboxUrl}
                className="w-full h-full border-0 absolute inset-0"
                title="Live Preview"
                allow="cross-origin-isolated"
                onLoad={() => {
                  setIframeLoading(false)
                  // Trigger ready phase + crossfade
                  if (buildPhase && buildPhase !== 'ready') {
                    setBuildPhase('ready')
                    setIsCrossfading(true)
                    crossfadeTimerRef.current = setTimeout(() => {
                      setIsCrossfading(false)
                      setBuildPhase(null)
                    }, 600) // matches CSS crossfade duration
                  }
                }}
                onError={() => setIframeError('Preview failed to load')}
              />
            </>
          )}
        </div>
      </div>

      {/* ─── Console Panel ─────────────────────────────────────── */}
      {showConsole && (
        <div className="shrink-0 border-t border-forge-border bg-forge-panel max-h-[40vh] sm:max-h-[200px] flex flex-col">
          {/* Console header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-forge-border">
            <div className="flex items-center gap-2">
              <Terminal className="w-3 h-3 text-forge-text-dim" />
              <span className="text-[10px] font-medium text-forge-text-dim uppercase tracking-wider">Console</span>
              {consoleLogs.length > 0 && (
                <span className="text-[10px] text-forge-text-dim/70">({consoleLogs.length})</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {consoleLogs.some(e => e.level === 'error') && onFixErrors && (
                <button
                  onClick={() => {
                    const errors = consoleLogs
                      .filter(e => e.level === 'error')
                      .map(e => e.message)
                      .join('\n')
                    onFixErrors(`The preview has runtime errors. Please fix them:\n\n\`\`\`\n${errors}\n\`\`\``)
                  }}
                  className="text-[10px] text-red-400 hover:text-red-300 px-1.5 py-0.5 rounded hover:bg-red-900/30 transition-colors"
                >
                  Fix with AI
                </button>
              )}
              <button
                onClick={() => setConsoleLogs([])}
                className="text-[10px] text-forge-text-dim hover:text-forge-text px-1.5 py-0.5 rounded hover:bg-forge-surface transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setShowConsole(false)}
                className="p-0.5 text-forge-text-dim hover:text-forge-text rounded hover:bg-forge-surface transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
          {/* Console body */}
          <div className="flex-1 overflow-y-auto p-2 font-mono text-xs sm:text-[11px] leading-relaxed">
            {consoleLogs.length === 0 ? (
              <div className="text-forge-text-dim/50 text-center py-4">No logs yet</div>
            ) : (
              <>
                {consoleLogs.map((entry, i) => (
                  <div key={i} className={cn(
                    'flex items-start py-0.5 px-1 rounded',
                    entry.level === 'error' ? 'text-red-500 dark:text-red-400 bg-red-500/5'
                      : entry.level === 'warn' ? 'text-amber-600 dark:text-yellow-400 bg-amber-500/5'
                      : entry.level === 'info' ? 'text-blue-600 dark:text-blue-400'
                      : entry.source === 'sandbox' ? 'text-emerald-600 dark:text-green-400'
                      : 'text-forge-text',
                  )}>
                    <span className="w-7 shrink-0 text-right pr-2 text-forge-text-dim/30 select-none tabular-nums">{i + 1}</span>
                    <span className="text-forge-text-dim/50 select-none">[{entry.timestamp}]</span>
                    {entry.level !== 'system' && (
                      <span className={cn('ml-1 text-[9px] uppercase font-medium shrink-0',
                        entry.level === 'error' ? 'text-red-500'
                        : entry.level === 'warn' ? 'text-amber-500'
                        : 'text-forge-text-dim/50'
                      )}>{entry.level}</span>
                    )}
                    <span className="ml-1 break-all">{entry.message}</span>
                  </div>
                ))}
                <div ref={consoleEndRef} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )

  return content
}
