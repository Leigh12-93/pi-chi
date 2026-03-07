'use client'

import { useMemo, useState, useCallback, useRef, useEffect, memo } from 'react'
import {
  RefreshCw, Monitor, Smartphone, Tablet, AlertTriangle,
  Square, Loader2, Zap, ExternalLink, Maximize2, Minimize2,
  Globe, Terminal, X, ArrowUpFromLine, Camera, Copy, Check,
  ChevronLeft, ChevronRight, Home, Search,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
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
  /** Fires when the preview becomes viewable (sandbox iframe loaded or static HTML ready) */
  onPreviewReady?: () => void
  /** WebContainer dev server URL — if provided, use this instead of v0 sandbox */
  wcPreviewUrl?: string | null
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
  analyzing: 'Reading your project',
  uploading: 'Sending files to preview',
  building: 'Building your app',
  starting: 'Almost there...',
  ready: 'Your preview is ready!',
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
  // Track navigation — intercept link clicks and keep them inside the preview
  document.addEventListener('click',function(e){
    var a=e.target;while(a&&a.tagName!=='A')a=a.parentElement;
    if(a&&a.href&&!a.href.startsWith('javascript:')){
      e.preventDefault();
      var h=a.getAttribute('href')||'';
      // Handle hash links within the page
      if(h.startsWith('#')){var el=document.querySelector(h);if(el)el.scrollIntoView({behavior:'smooth'});return;}
      // Handle relative paths — navigate within the iframe
      if(h.startsWith('/')&&window.location.protocol==='about:'){
        window.parent.postMessage({type:'forge-navigate',href:h,pathname:h},'*');
        return;
      }
      // For other relative links, try to navigate within iframe
      if(!h.startsWith('http')){
        try{window.location.href=h;}catch(ex){}
        window.parent.postMessage({type:'forge-navigate',href:h,pathname:h},'*');
        return;
      }
      // External links — just notify parent, don't navigate
      window.parent.postMessage({type:'forge-navigate',href:h,pathname:h},'*');
    }
  });
  var _ps=history.pushState;history.pushState=function(){
    _ps.apply(this,arguments);
    window.parent.postMessage({type:'forge-navigate',pathname:location.pathname+location.search+location.hash},'*');
  };
  var _rs=history.replaceState;history.replaceState=function(){
    _rs.apply(this,arguments);
    window.parent.postMessage({type:'forge-navigate',pathname:location.pathname+location.search+location.hash},'*');
  };
  window.addEventListener('popstate',function(){
    window.parent.postMessage({type:'forge-navigate',pathname:location.pathname+location.search+location.hash},'*');
  });
  window.addEventListener('hashchange',function(){
    window.parent.postMessage({type:'forge-navigate',pathname:location.pathname+location.search+location.hash},'*');
  });
})();
</script>`

// Minimum files needed before auto-starting sandbox — start early so preview is
// ready by the time user switches to it. Only needs package.json + any component.
function isProjectReady(files: Record<string, string>): boolean {
  const paths = Object.keys(files)
  if (paths.length < 2) return false
  const hasPackageJson = paths.includes('package.json')
  const hasAnyComponent = paths.some(p =>
    p.endsWith('.tsx') || p.endsWith('.jsx') || p === 'index.html'
  )
  return hasPackageJson && hasAnyComponent
}

function BuildingPlaceholder({ files }: { files: Record<string, string> }) {
  const fileNames = Object.keys(files)
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
      <div className="text-center max-w-xs px-6">
        {/* Breathing logo with subtle glow */}
        <div className="relative inline-flex items-center justify-center mb-6">
          <div className="absolute inset-0 rounded-full bg-forge-accent/10 blur-xl building-placeholder-glow" />
          <div className="sixchi-logo-reveal">
            <span className="text-4xl font-bold bg-gradient-to-r from-forge-accent to-red-400 bg-clip-text text-transparent select-none">
              6-&#x03C7;
            </span>
          </div>
        </div>
        <p className="text-sm font-medium text-forge-text mb-1.5">{framework} project detected</p>
        <p className="text-xs text-forge-text-dim/60 mb-4">
          Setting up your preview environment
        </p>
        {/* Animated dots */}
        <div className="flex justify-center gap-1.5">
          <span className="building-dot" style={{ animationDelay: '0s' }} />
          <span className="building-dot" style={{ animationDelay: '0.15s' }} />
          <span className="building-dot" style={{ animationDelay: '0.3s' }} />
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
            {i > 0 && <div className={cn('forge-phase-connector transition-colors duration-300', state === 'done' && 'done')} />}
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

/** Small copy button for error popups */
function CopyErrorButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }}
      className="flex items-center justify-center gap-1 px-2.5 py-1.5 text-[10px] font-medium text-forge-text-dim hover:text-forge-text bg-forge-surface hover:bg-forge-surface-hover rounded-lg transition-colors"
      title="Copy error to clipboard"
    >
      {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
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
  // Note: vusercontent.net removed — it was filtering legitimate preview error signals
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

export const PreviewPanel = memo(function PreviewPanel({ files, projectId, onFixErrors, onCapturePreview, onPreviewReady, wcPreviewUrl }: PreviewPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('desktop')
  const [refreshKey, setRefreshKey] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([])
  const [copiedConsoleIdx, setCopiedConsoleIdx] = useState<number | null>(null)

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
  const [wcIframeReady, setWcIframeReady] = useState(false) // WC iframe fully loaded (not just URL set)
  const [buildPhase, setBuildPhase] = useState<BuildPhase>(null) // phased lifecycle
  const [isCrossfading, setIsCrossfading] = useState(false) // transition from building to live
  const crossfadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null) // cleanup crossfade
  const sandboxUrlRef = useRef<string | null>(null) // stable ref for sync effect
  const errorAutoFeedRef = useRef<Map<string, number>>(new Map()) // error → attempt count (cap at 3)
  const errorFeedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [iframeError, setIframeError] = useState<string | null>(null)
  const [errorPopupDismissed, setErrorPopupDismissed] = useState(false)
  const buildPhaseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [captureFlash, setCaptureFlash] = useState(false)
  const [showFullscreenHint, setShowFullscreenHint] = useState(false)

  // Navigation state
  const [currentPath, setCurrentPath] = useState('/')
  const [isEditingUrl, setIsEditingUrl] = useState(false)
  const [urlInput, setUrlInput] = useState('/')
  const [navCount, setNavCount] = useState(0) // track navigations for back button enable
  const lastAutoFeedRef = useRef(0) // global cooldown for error auto-feed
  const consoleLogsRef = useRef(consoleLogs) // stable ref for message listener
  const onFixErrorsRef = useRef(onFixErrors) // stable ref to avoid stale closure in setTimeout

  // Memoized file hash — avoids O(n) hashing on every render/effect
  const filesHash = useMemo(() => hashFileMapDeep(files), [files])

  // ─── Navigation handlers ─────────────────────────────────────
  // Reset path when preview URL changes (new sandbox/WebContainer)
  useEffect(() => {
    setCurrentPath('/')
    setNavCount(0)
  }, [wcPreviewUrl, sandboxUrl])

  // Set loading state when WebContainer URL changes — reset ready flag
  useEffect(() => {
    if (wcPreviewUrl) {
      setIframeLoading(true)
      setWcIframeReady(false)
    } else {
      setWcIframeReady(false)
    }
  }, [wcPreviewUrl])

  const handleGoBack = useCallback(() => {
    try {
      const iframe = document.getElementById('forge-preview-iframe') as HTMLIFrameElement
      iframe?.contentWindow?.history.back()
    } catch { /* cross-origin safety */ }
  }, [])

  const handleGoForward = useCallback(() => {
    try {
      const iframe = document.getElementById('forge-preview-iframe') as HTMLIFrameElement
      iframe?.contentWindow?.history.forward()
    } catch { /* cross-origin safety */ }
  }, [])

  const handleGoHome = useCallback(() => {
    try {
      const iframe = document.getElementById('forge-preview-iframe') as HTMLIFrameElement
      if (iframe?.contentWindow) {
        const baseUrl = wcPreviewUrl || sandboxUrl
        if (baseUrl) {
          iframe.contentWindow.location.href = new URL('/', baseUrl).href
          setCurrentPath('/')
          setNavCount(prev => prev + 1)
        }
      }
    } catch { /* cross-origin safety */ }
  }, [wcPreviewUrl, sandboxUrl])

  const handleNavigateTo = useCallback((path: string) => {
    try {
      const iframe = document.getElementById('forge-preview-iframe') as HTMLIFrameElement
      if (iframe?.contentWindow) {
        const baseUrl = wcPreviewUrl || sandboxUrl
        if (baseUrl) {
          const normalizedPath = path.startsWith('/') ? path : '/' + path
          iframe.contentWindow.location.href = new URL(normalizedPath, baseUrl).href
          setCurrentPath(normalizedPath)
          setNavCount(prev => prev + 1)
        }
      }
    } catch { /* cross-origin safety */ }
  }, [wcPreviewUrl, sandboxUrl])

  // Keep refs in sync without causing re-renders in message listener
  useEffect(() => { consoleLogsRef.current = consoleLogs }, [consoleLogs])
  useEffect(() => { onFixErrorsRef.current = onFixErrors }, [onFixErrors])

  // Reset error popup when all errors are cleared (e.g., after AI fix)
  const errorCount = consoleLogs.filter(e => e.level === 'error').length
  useEffect(() => {
    if (errorCount === 0) setErrorPopupDismissed(false)
  }, [errorCount])

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

  // Helper to create empty state HTML — styled to match the app theme, not look like an error
  const createEmptyState = (title: string, subtitle: string) => {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { min-height: 100vh; display: flex; align-items: center; justify-content: center; font-family: system-ui, -apple-system, sans-serif; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1117; color: #9ca3af; }
    .card { background: #1a1d27; border-color: #2a2d3a; }
    .title { color: #e5e7eb; }
    .dot { background: rgba(220,38,38,0.15); }
    .dot span { background: #dc2626; }
  }
  @media (prefers-color-scheme: light) {
    body { background: #ffffff; color: #9ca3af; }
    .card { background: #f8f9fa; border-color: #e5e7eb; }
    .title { color: #374151; }
    .dot { background: rgba(220,38,38,0.08); }
    .dot span { background: #dc2626; }
  }
  .card { padding: 32px; border-radius: 16px; border: 1px solid; text-align: center; max-width: 280px; }
  .dots { display: flex; gap: 6px; justify-content: center; margin-bottom: 16px; }
  .dot { width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; }
  .dot span { width: 6px; height: 6px; border-radius: 50%; animation: pulse 1.8s ease-in-out infinite; }
  .dot:nth-child(2) span { animation-delay: 0.2s; }
  .dot:nth-child(3) span { animation-delay: 0.4s; }
  .title { font-size: 14px; font-weight: 500; margin-bottom: 4px; }
  .sub { font-size: 12px; opacity: 0.6; }
  @keyframes pulse { 0%,100% { transform: scale(0.8); opacity: 0.4; } 50% { transform: scale(1.4); opacity: 1; } }
</style></head>
<body>
  <div class="card">
    <div class="dots"><div class="dot"><span></span></div><div class="dot"><span></span></div><div class="dot"><span></span></div></div>
    <p class="title">${title}</p>
    <p class="sub">${subtitle}</p>
  </div>
</body></html>`
  }

  // Extract only the content that affects static preview — stable primitive deps
  // Writing components/button.tsx won't trigger a preview recomputation
  const previewMainFile = files['src/App.tsx'] || files['src/App.jsx'] || files['app/page.tsx'] || files['app/page.jsx'] || files['src/app/page.tsx'] || files['src/app/page.jsx'] || files['pages/index.tsx'] || files['pages/index.jsx'] || ''
  const previewIndexHtml = files['index.html'] || ''
  const previewCss = files['app/globals.css'] || files['src/index.css'] || ''
  // For static projects, track all CSS/JS file content so preview updates when they change
  const staticAssetsHash = useMemo(() => {
    if (projectType !== 'static') return ''
    const assetFiles = Object.entries(files).filter(([k]) => k.endsWith('.css') || k.endsWith('.js'))
    return assetFiles.map(([k, v]) => k + ':' + v.length).join('|')
  }, [files, projectType])
  const previewFileCount = Object.keys(files).length

  // Compute preview HTML — only reruns when preview-relevant content actually changes
  const computedPreviewHtml = useMemo(() => {
    try {
      if (previewFileCount === 0) {
        return createEmptyState('Nothing to show yet', 'Your preview will appear here as you build')
      }

      if (projectType === 'static' && previewIndexHtml) {
        // Inline all external CSS and JS files referenced in the HTML
        // srcdoc iframes have no server, so <link href="style.css"> and <script src="script.js"> won't resolve
        let inlinedHtml = previewIndexHtml

        // Inline <link rel="stylesheet" href="..."> → <style>contents</style>
        inlinedHtml = inlinedHtml.replace(
          /<link\s+[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*\/?>/gi,
          (_match, href) => {
            const cssContent = files[href] || files[href.replace(/^\.\//, '')]
            return cssContent ? `<style>\n${cssContent}\n</style>` : ''
          }
        )
        // Also handle href before rel order
        inlinedHtml = inlinedHtml.replace(
          /<link\s+[^>]*href=["']([^"']+)["'][^>]*rel=["']stylesheet["'][^>]*\/?>/gi,
          (_match, href) => {
            const cssContent = files[href] || files[href.replace(/^\.\//, '')]
            return cssContent ? `<style>\n${cssContent}\n</style>` : ''
          }
        )

        // Inline <script src="..."></script> → <script>contents</script>
        inlinedHtml = inlinedHtml.replace(
          /<script\s+[^>]*src=["']([^"']+)["'][^>]*><\/script>/gi,
          (_match, src) => {
            const jsContent = files[src] || files[src.replace(/^\.\//, '')]
            return jsContent ? `<script>\n${jsContent}\n</script>` : ''
          }
        )

        const headIdx = inlinedHtml.toLowerCase().indexOf('<head>')
        if (headIdx !== -1) {
          return inlinedHtml.slice(0, headIdx + 6) + PREVIEW_ERROR_SCRIPT + inlinedHtml.slice(headIdx + 6)
        }
        return PREVIEW_ERROR_SCRIPT + inlinedHtml
      }

      if (!previewMainFile) {
        if (projectType === 'nextjs') return createEmptyState('Next.js project detected', 'Waiting for your first page to be created')
        if (projectType === 'vite') return createEmptyState('Vite project detected', 'Waiting for your first component to be created')
        return createEmptyState('Getting things ready', 'Your preview will appear shortly')
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

      // Detect Google Maps usage — inject Maps JS API into preview
      const allContent = Object.values(files).join('\n')
      const usesGoogleMaps = allContent.includes('maps.googleapis.com') ||
        allContent.includes('@react-google-maps') ||
        allContent.includes('google-map-react') ||
        allContent.includes('GoogleMap') ||
        allContent.includes('useJsApiLoader') ||
        jsx.includes('id="map"') || jsx.includes('id="google-map"')

      // Extract Google Maps API key from env files
      let mapsApiKey = ''
      if (usesGoogleMaps) {
        for (const [p, c] of Object.entries(files)) {
          const fname = p.split('/').pop() || ''
          if (fname.startsWith('.env')) {
            const match = c.match(/(?:NEXT_PUBLIC_GOOGLE_MAPS_KEY|GOOGLE_MAPS_API_KEY|REACT_APP_GOOGLE_MAPS_KEY|GOOGLE_API_KEY)\s*=\s*(.+)/m)
            if (match) { mapsApiKey = match[1].trim().replace(/^["']|["']$/g, ''); break }
          }
        }
      }

      // Detect Google Fonts — extract font family URLs from CSS/HTML
      const fontUrls: string[] = []
      for (const [p, c] of Object.entries(files)) {
        if (p.endsWith('.css') || p.endsWith('.html')) {
          const matches = c.matchAll(/(https:\/\/fonts\.googleapis\.com\/css2?\?[^"'\s)]+)/g)
          for (const m of matches) {
            if (!fontUrls.includes(m[1])) fontUrls.push(m[1])
          }
        }
      }

      const googleMapsScript = usesGoogleMaps && mapsApiKey
        ? `<script src="https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&libraries=places,marker"></script>`
        : usesGoogleMaps
        ? `<!-- Google Maps detected but no API key found in env files -->`
        : ''

      const googleFontsLinks = fontUrls.map(url =>
        `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="${url}" rel="stylesheet">`
      ).join('\n  ')

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  ${PREVIEW_ERROR_SCRIPT}
  ${hasTailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : ''}
  ${googleMapsScript}
  ${googleFontsLinks}
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
  }, [previewFileCount, projectType, previewMainFile, previewIndexHtml, previewCss, staticAssetsHash, files])

  // Debounced preview — prevents iframe from flickering during rapid AI file writes
  // The iframe srcDoc only updates after 800ms of stability
  const [previewHtml, setPreviewHtml] = useState(computedPreviewHtml)
  const previewDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Keep showing the last real preview instead of replacing with placeholder
    // This ensures the user always sees their app, not a loading spinner, during AI edits
    if (computedPreviewHtml === '__JSX_BUILDING_PLACEHOLDER__') return

    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    previewDebounceRef.current = setTimeout(() => {
      setPreviewHtml(computedPreviewHtml)
      setPreviewError(computedPreviewHtml.includes('>Preview Error<') ? 'Preview rendering failed' : null)
      // Signal static preview is ready (only for real HTML, not placeholders)
      if (computedPreviewHtml && !computedPreviewHtml.includes('>Preview Error<')) {
        onPreviewReady?.()
      }
    }, 300)
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current)
    }
  }, [computedPreviewHtml, onPreviewReady])

  // ─── Sandbox lifecycle ─────────────────────────────────────────

  const startSandbox = useCallback(async () => {
    if (!projectId || startingRef.current || sandboxStatus === 'initializing') return
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
    setIframeError(null)
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
    }, 600) // Slight delay so "Preparing preview" animation is visible before transition to initializing

    return () => {
      if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current)
    }
  }, [files, sandboxStatus, projectId, startSandbox])

  // ─── Debounced file sync to running sandbox ───────────────────
  useEffect(() => {
    if (sandboxStatus !== 'running' || !projectId) return

    if (filesHash === lastSyncedFilesRef.current) return

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
        lastSyncedFilesRef.current = filesHash
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
    }, 800)

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

  // Timeout: catch stalled "starting" phase — if iframe never loads within 90s, show warning
  // Next.js cold builds inside WebContainer can take 45-60s, so 30s was too aggressive.
  // Don't kill the sandbox on timeout — keep iframe mounted so it can still load late.
  useEffect(() => {
    if (buildPhaseTimeoutRef.current) clearTimeout(buildPhaseTimeoutRef.current)
    if (buildPhase === 'starting') {
      buildPhaseTimeoutRef.current = setTimeout(() => {
        // Still stuck on 'starting' — iframe hasn't loaded yet, but keep sandbox running
        setBuildPhase(null)
        setIframeLoading(false)
        addLog('Preview still loading after 90s — the project may have build errors or heavy dependencies', 'warn', 'sandbox')
      }, 90000)
    }
    return () => {
      if (buildPhaseTimeoutRef.current) clearTimeout(buildPhaseTimeoutRef.current)
    }
  }, [buildPhase, addLog])

  // Listen for console/error/navigation messages from preview iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const d = event.data
      if (!d || typeof d !== 'object') return

      // Navigation events from injected script (pushState, popstate, link click)
      if (d.type === 'forge-navigate') {
        const pathname = typeof d.pathname === 'string' ? d.pathname : '/'
        setCurrentPath(pathname)
        setNavCount(prev => prev + 1)
        return
      }

      let level: ConsoleEntry['level'] = 'log'
      let message = ''
      let source: ConsoleEntry['source'] = 'preview'

      // Format 1: Our injected PREVIEW_ERROR_SCRIPT (static preview)
      if (d.type === 'forge-preview') {
        level = (['log', 'warn', 'error', 'info'].includes(d.level) ? d.level : 'log') as ConsoleEntry['level']
        message = typeof d.message === 'string' ? d.message : String(d.message)
      }
      // Format 2: v0 sandbox console messages (type: 'console')
      else if (d.type === 'console' && d.method && d.args) {
        level = (['log', 'warn', 'error', 'info'].includes(d.method) ? d.method : 'log') as ConsoleEntry['level']
        const args = Array.isArray(d.args) ? d.args : [d.args]
        message = args.map((a: unknown) => typeof a === 'string' ? a : JSON.stringify(a)).join(' ')
        source = 'sandbox'
      }
      // Format 3: v0 sandbox errors (type: 'error')
      else if (d.type === 'error' && (d.message || d.error)) {
        level = 'error'
        message = d.message || d.error?.message || String(d.error)
        if (d.stack || d.error?.stack) message += '\n' + (d.stack || d.error.stack)
        source = 'sandbox'
      }
      // Format 4: v0 runtime errors (type: 'runtime-error' or 'unhandled-error')
      else if ((d.type === 'runtime-error' || d.type === 'unhandled-error') && d.message) {
        level = 'error'
        message = typeof d.message === 'string' ? d.message : String(d.message)
        source = 'sandbox'
      }
      // Format 5: Generic message with level/message shape from sandbox
      else if (d.level && d.message && (event.origin || '').includes('vusercontent.net')) {
        level = (['log', 'warn', 'error', 'info'].includes(d.level) ? d.level : 'log') as ConsoleEntry['level']
        message = typeof d.message === 'string' ? d.message : String(d.message)
        source = 'sandbox'
      }
      else {
        return // Unknown message format — ignore
      }

      message = message.slice(0, 1000)
      if (!message) return

      // Filter known sandbox/browser noise — log dimmed but don't auto-feed to AI
      const isNoise = isSandboxNoise(message)
      if (isNoise) {
        addLog(`[sandbox] ${message}`, 'info', 'sandbox')
        return
      }

      addLog(message, level, source)
      // Auto-open console on errors (but do NOT auto-feed to AI — user must click fix)
      if (level === 'error') {
        setShowConsole(true)
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
    setCaptureFlash(true)
    setTimeout(() => setCaptureFlash(false), 800)
  }, [capturePreviewContent, onCapturePreview, addLog])

  // Track file changes — reset scan state so user can re-scan if needed
  const prevFileHashRef = useRef<string>('')
  const [showScanPrompt, setShowScanPrompt] = useState(false)
  useEffect(() => {
    if (prevFileHashRef.current && filesHash !== prevFileHashRef.current) {
      // Files changed — allow re-scan but don't auto-run
      missingImportsFedRef.current = false
      setMissingImports([])
      setShowScanPrompt(false)
    }
    prevFileHashRef.current = filesHash
    // Do NOT auto-scan — user must trigger via "Scan" button
  }, [files])

  // User-triggered scan handler
  const handleRunScan = useCallback(() => {
    const missing = detectMissingImports(files)
    setMissingImports(missing)
    setShowScanPrompt(false)
    if (missing.length === 0) {
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

  const deviceMaxWidth: Record<ViewMode, string> = {
    desktop: '100%',
    tablet: '768px',
    mobile: '375px',
  }

  const isSandboxActive = sandboxStatus === 'running' && sandboxUrl
  const isSandboxLoading = sandboxStatus === 'initializing'
  const isSandboxOffline = !isSandboxActive && !isSandboxLoading && !!cachedSandboxUrl
  const showCachedPreview = isSandboxOffline && sandboxStatus !== 'error'

  // Display URL for the URL bar — shows current path when live, phase label during build
  const isLivePreview = !!(wcIframeReady || isSandboxActive)
  const displayUrl = isLivePreview
    ? currentPath
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

          {/* Navigation buttons — back/forward/home */}
          {isLivePreview && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={handleGoBack}
                disabled={navCount === 0}
                title="Back"
                aria-label="Navigate back"
                className="p-2.5 sm:p-1.5 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </button>
              <button
                onClick={handleGoForward}
                title="Forward"
                aria-label="Navigate forward"
                className="p-2.5 sm:p-1.5 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
              >
                <ChevronRight className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </button>
              <button
                onClick={handleGoHome}
                title="Home (/)"
                aria-label="Navigate home"
                className="p-2.5 sm:p-1.5 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
              >
                <Home className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </button>
            </div>
          )}

          {/* Center: URL bar */}
          <div className="flex-1 flex items-center min-w-0">
            <div className={cn(
              'flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-mono',
              'bg-forge-surface border border-forge-border transition-all duration-200',
              'hover:shadow-[inset_0_1px_4px_rgba(0,0,0,0.06)]',
              isSandboxActive && 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-950/30',
              isSandboxLoading && 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-950/30',
              sandboxStatus === 'error' && 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-950/30',
              showCachedPreview && 'border-forge-border bg-forge-surface/50',
            )}>
              {/* Status indicator — AnimatePresence crossfade */}
              <AnimatePresence mode="wait">
                {isSandboxActive && !isSyncing && (
                  <motion.div
                    key="live"
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ duration: 0.15 }}
                    className="shrink-0 flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
                  >
                    <div className="relative">
                      <Zap className="w-3 h-3" />
                      <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
                    </div>
                  </motion.div>
                )}
                {isSandboxActive && isSyncing && (
                  <motion.div key="syncing" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}>
                    <ArrowUpFromLine className="w-3 h-3 shrink-0 animate-pulse text-blue-500" />
                  </motion.div>
                )}
                {isSandboxLoading && (
                  <motion.div key="loading" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}>
                    <Loader2 className="w-3 h-3 shrink-0 animate-spin text-amber-600" />
                  </motion.div>
                )}
                {sandboxStatus === 'error' && (
                  <motion.div key="error" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}>
                    <AlertTriangle className="w-3 h-3 shrink-0 text-red-500" />
                  </motion.div>
                )}
                {showCachedPreview && (
                  <motion.div key="cached" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}>
                    <Globe className="w-3 h-3 shrink-0 text-forge-text-dim/50" />
                  </motion.div>
                )}
                {sandboxStatus === 'idle' && !showCachedPreview && !previewError && (
                  <motion.div key="idle" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}>
                    <Globe className="w-3 h-3 shrink-0 text-forge-text-dim" />
                  </motion.div>
                )}
                {sandboxStatus === 'idle' && !showCachedPreview && previewError && (
                  <motion.div key="idle-error" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}>
                    <AlertTriangle className="w-3 h-3 shrink-0 text-red-500" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* URL text — click to edit path, Enter to navigate */}
              {isEditingUrl && isLivePreview ? (
                <input
                  autoFocus
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onBlur={() => setIsEditingUrl(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleNavigateTo(urlInput)
                      setIsEditingUrl(false)
                    }
                    if (e.key === 'Escape') setIsEditingUrl(false)
                  }}
                  className="flex-1 min-w-0 bg-transparent outline-none text-emerald-600 dark:text-emerald-400"
                  placeholder="/"
                />
              ) : (
                <span
                  onClick={() => {
                    if (isLivePreview) {
                      setUrlInput(currentPath)
                      setIsEditingUrl(true)
                    }
                  }}
                  className={cn(
                    'truncate',
                    isLivePreview ? 'cursor-text select-all' : 'cursor-default select-none',
                    isLivePreview ? 'text-emerald-600 dark:text-emerald-400' : 'text-forge-text-dim',
                    isSandboxLoading && 'text-amber-600 dark:text-amber-400',
                    sandboxStatus === 'error' && 'text-forge-danger',
                    showCachedPreview && 'text-forge-text-dim/50',
                  )}
                >
                  {displayUrl}
                </span>
              )}

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
            {/* Scan for issues */}
            <button
              onClick={() => setShowScanPrompt(true)}
              className="p-2.5 sm:p-1.5 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
              title="Scan for missing imports"
              aria-label="Scan for missing imports"
            >
              <Search className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            </button>

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
              onClick={() => {
                setIsFullscreen(prev => {
                  if (!prev) { setShowFullscreenHint(true); setTimeout(() => setShowFullscreenHint(false), 2500) }
                  return !prev
                })
              }}
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

      {/* Fullscreen exit hint */}
      {isFullscreen && showFullscreenHint && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[60] fullscreen-hint">
          <div className="px-3 py-1.5 rounded-lg bg-forge-bg/80 backdrop-blur border border-forge-border text-[11px] text-forge-text-dim shadow-lg">
            Press <kbd className="px-1 py-0.5 rounded bg-forge-surface border border-forge-border text-[10px] font-mono">Esc</kbd> to exit fullscreen
          </div>
        </div>
      )}

      {/* ─── Preview Body ──────────────────────────────────────── */}
          <div className={cn('flex-1 overflow-hidden bg-forge-bg relative', captureFlash && 'capture-flash')}>
        <div
          className={cn(
            'h-full preview-device-frame',
            viewMode !== 'desktop' && `device-${viewMode}`,
            viewMode !== 'desktop' && 'mx-auto',
          )}
          style={{ maxWidth: deviceMaxWidth[viewMode] }}
        >
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
                // Hide static preview when a live preview (sandbox or WC) is active
                (isSandboxActive || showCachedPreview || wcIframeReady) ? 'opacity-0 pointer-events-none' : 'opacity-100',
              )}
              sandbox="allow-scripts allow-same-origin allow-forms"
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
          {/* Visible during: initializing, any active build phase, crossfade-out, OR iframe still loading */}
          {(isSandboxLoading || !!buildPhase || isCrossfading || iframeLoading) && (
            <div className={cn('sixchi-loader-scene', isCrossfading && 'forge-ready-crossfade')}>
              {/* Radial gradient background */}
              <div className="sixchi-bg-mesh" />
              <div className="sixchi-dot-grid" />

              {/* Orbital rings */}
              <div className="sixchi-orbit sixchi-orbit-outer" />
              <div className="sixchi-orbit sixchi-orbit-inner" />

              {/* Logo reveal */}
              <div className="sixchi-logo-container">
                <div className={cn('sixchi-logo-glow', buildPhase === 'ready' && 'sixchi-glow-success')} />
                <div className={cn('sixchi-logo-reveal', buildPhase === 'ready' && 'sixchi-logo-ready')}>
                  <span className="text-5xl sm:text-6xl font-bold bg-gradient-to-r from-forge-accent via-red-400 to-red-500 bg-clip-text text-transparent select-none">
                    6-&#x03C7;
                  </span>
                </div>

                {/* Ready overlay — green check on top of logo */}
                {buildPhase === 'ready' && (
                  <div className="absolute inset-0 flex items-center justify-center z-10">
                    <div className="forge-ready-check">
                      <svg className="w-12 h-12 text-emerald-500 drop-shadow-lg" viewBox="0 0 48 48" fill="none">
                        <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.15" />
                        <path d="M14 24l7 7 13-13" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="forge-check-draw" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              {/* Phase text + file count */}
              <div className="sixchi-status-text">
                <span className={cn(
                  'text-sm font-medium tracking-wide transition-colors duration-500',
                  buildPhase === 'ready' ? 'text-emerald-500' : 'shimmer-text',
                )}>
                  {buildPhase ? PHASE_LABELS[buildPhase] : 'Building your preview'}
                </span>
                {Object.keys(files).length > 0 && buildPhase !== 'ready' && (
                  <span className="text-[10px] text-forge-text-dim/40 mt-1.5 tabular-nums">
                    {Object.keys(files).length} files
                  </span>
                )}
                {/* Phase stepper */}
                <div className="mt-4">
                  <BuildPhaseIndicator phase={buildPhase} />
                </div>
              </div>

              {/* Progress track */}
              <div className="forge-progress-track">
                <div className="forge-progress-bar" style={buildPhase === 'starting' ? { animation: 'buildProgress 8s ease-out forwards, buildProgressPulse 1s ease-in-out infinite' } : undefined} />
              </div>
            </div>
          )}

          {/* Auto-starting status — shown while sandbox is idle and files exist (relaxed from isProjectReady) */}
          {sandboxStatus === 'idle' && !showCachedPreview && Object.keys(files).length > 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-forge-bg/80 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-4 animate-fade-in px-6">
                <div className="relative">
                  <div className="absolute inset-0 rounded-2xl bg-forge-accent/10 blur-lg building-placeholder-glow" />
                  <div className="relative w-14 h-14 rounded-2xl bg-forge-surface border border-forge-border flex items-center justify-center">
                    <Zap className="w-6 h-6 text-forge-accent" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm text-forge-text font-medium mb-1">
                    Preparing preview
                  </p>
                  <p className="text-xs text-forge-text-dim/60">
                    {Object.keys(files).length} files detected
                  </p>
                </div>
                <div className="flex justify-center gap-1.5">
                  <span className="building-dot" style={{ animationDelay: '0s' }} />
                  <span className="building-dot" style={{ animationDelay: '0.15s' }} />
                  <span className="building-dot" style={{ animationDelay: '0.3s' }} />
                </div>
              </div>
            </div>
          )}

          {/* Phase 1: Scan prompt — ask user before running scan */}
          <AnimatePresence>
          {showScanPrompt && missingImports.length === 0 && !missingImportsFedRef.current && (isSandboxActive || isSandboxLoading) && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="absolute bottom-3 left-3 z-20 max-w-xs"
            >
              <div className="bg-forge-bg/95 backdrop-blur border border-forge-border rounded-xl p-3 shadow-2xl space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-forge-accent/10 flex items-center justify-center shrink-0">
                    <Search className="w-3 h-3 text-forge-accent" />
                  </div>
                  <p className="text-xs font-medium text-forge-text">Scan for missing imports?</p>
                  <button
                    onClick={() => setShowScanPrompt(false)}
                    className="p-0.5 text-forge-text-dim hover:text-forge-text transition-colors shrink-0 ml-auto"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={handleRunScan}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-forge-accent hover:bg-forge-accent-hover text-white text-[10px] font-medium rounded-lg transition-colors"
                  >
                    Scan
                  </button>
                  <button
                    onClick={() => setShowScanPrompt(false)}
                    className="px-2.5 py-1.5 text-[10px] font-medium text-forge-text-dim hover:text-forge-text bg-forge-surface hover:bg-forge-surface-hover rounded-lg transition-colors"
                  >
                    No thanks
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Phase 2: Scan results — shown only after user triggered scan */}
          <AnimatePresence>
          {missingImports.length > 0 && !missingImportsFedRef.current && (isSandboxActive || isSandboxLoading) && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="absolute bottom-3 left-3 z-20 max-w-xs"
            >
              <div className="bg-forge-bg/95 backdrop-blur border border-amber-500/30 rounded-xl p-3 shadow-2xl space-y-2">
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-forge-text">Missing Imports ({missingImports.length})</p>
                    <p className="text-[10px] text-forge-text-dim mt-0.5">Some imported files don&apos;t exist yet</p>
                  </div>
                  <button
                    onClick={() => { missingImportsFedRef.current = true; setMissingImports([]) }}
                    className="p-0.5 text-forge-text-dim hover:text-forge-text transition-colors shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="max-h-20 overflow-y-auto space-y-0.5">
                  {missingImports.slice(0, 4).map((err, i) => (
                    <p key={i} className="text-[10px] font-mono text-amber-600 dark:text-amber-400 truncate">{err.replace(/^Missing module: /, '')}</p>
                  ))}
                  {missingImports.length > 4 && (
                    <p className="text-[9px] text-forge-text-dim">+{missingImports.length - 4} more</p>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {onFixErrors && (
                    <button
                      onClick={() => {
                        onFixErrors(`The preview detected missing imports. Please create the missing files:\n\n${missingImports.join('\n')}`)
                        missingImportsFedRef.current = true
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-forge-accent hover:bg-forge-accent-hover text-white text-[10px] font-medium rounded-lg transition-colors"
                    >
                      <Zap className="w-3 h-3" />
                      Fix with AI
                    </button>
                  )}
                  <button
                    onClick={() => { missingImportsFedRef.current = true; setMissingImports([]) }}
                    className="px-2.5 py-1.5 text-[10px] font-medium text-forge-text-dim hover:text-forge-text bg-forge-surface hover:bg-forge-surface-hover rounded-lg transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Sandbox error popup — bottom-left animated toast with Fix + Copy buttons */}
          <AnimatePresence>
          {sandboxStatus === 'error' && sandboxError && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="absolute bottom-3 left-3 z-20 max-w-xs"
            >
              <div className="bg-forge-bg/95 backdrop-blur border border-red-500/30 rounded-xl p-3 shadow-2xl space-y-2">
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-forge-text">Preview Error</p>
                    <p className="text-[10px] text-red-400 font-mono mt-0.5 line-clamp-3" title={sandboxError}>{sandboxError}</p>
                  </div>
                  <button
                    onClick={() => { setSandboxStatus('idle'); setSandboxError(null); hasAutoStartedRef.current = false }}
                    className="p-0.5 text-forge-text-dim hover:text-forge-text transition-colors shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex gap-1.5">
                  {onFixErrors && (
                    <button
                      onClick={() => {
                        const allErrors = consoleLogs.filter(e => e.level === 'error').map(e => e.message).join('\n')
                        const errorMsg = allErrors || sandboxError
                        onFixErrors(`The preview sandbox crashed with errors. Please fix the code:\n\n\`\`\`\n${errorMsg}\n\`\`\``)
                        setSandboxStatus('idle')
                        setSandboxError(null)
                      }}
                      className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-forge-accent hover:bg-forge-accent-hover text-white text-[10px] font-medium rounded-lg transition-colors"
                    >
                      <Zap className="w-3 h-3" />
                      Fix with AI
                    </button>
                  )}
                  <CopyErrorButton text={(() => { const allErrors = consoleLogs.filter(e => e.level === 'error').map(e => e.message).join('\n'); return allErrors || sandboxError || '' })() } />
                  <button
                    onClick={() => { hasAutoStartedRef.current = false; sandboxAvailableRef.current = null; retryCountRef.current = 0; startSandbox() }}
                    className="px-2.5 py-1.5 text-[10px] font-medium text-forge-text-dim hover:text-forge-text bg-forge-surface hover:bg-forge-surface-hover rounded-lg transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Runtime error popup — bottom-left animated toast */}
          <AnimatePresence>
          {!errorPopupDismissed && errorCount > 0 && !showConsole && sandboxStatus !== 'error' && onFixErrors && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              className="absolute bottom-3 left-3 z-20 max-w-xs"
            >
              <div className="bg-forge-bg/95 backdrop-blur border border-red-500/30 rounded-xl p-3 shadow-2xl space-y-2">
                <div className="flex items-start gap-2">
                  <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-forge-text">Runtime Error</p>
                    <p className="text-[10px] text-forge-text-dim">{errorCount} error{errorCount !== 1 ? 's' : ''} detected</p>
                  </div>
                  <button
                    onClick={() => setErrorPopupDismissed(true)}
                    className="p-0.5 text-forge-text-dim hover:text-forge-text transition-colors shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <div className="max-h-16 overflow-y-auto">
                  {consoleLogs.filter(e => e.level === 'error').slice(0, 3).map((e, i) => (
                    <p key={i} className="text-[10px] font-mono text-red-400 truncate leading-relaxed">{e.message.slice(0, 120)}</p>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => {
                      const errors = consoleLogs
                        .filter(e => e.level === 'error')
                        .map(e => e.message)
                        .join('\n')
                      onFixErrors(`The preview has runtime errors. Please fix them:\n\n\`\`\`\n${errors}\n\`\`\``)
                      setErrorPopupDismissed(true)
                    }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-forge-accent hover:bg-forge-accent-hover text-white text-[10px] font-medium rounded-lg transition-colors"
                  >
                    <Zap className="w-3 h-3" />
                    Fix with AI
                  </button>
                  <CopyErrorButton text={consoleLogs.filter(e => e.level === 'error').map(e => e.message).join('\n')} />
                  <button
                    onClick={() => { setErrorPopupDismissed(true); setShowConsole(true) }}
                    className="px-2.5 py-1.5 text-[10px] font-medium text-forge-text-dim hover:text-forge-text bg-forge-surface hover:bg-forge-surface-hover rounded-lg transition-colors"
                  >
                    Console
                  </button>
                </div>
              </div>
            </motion.div>
          )}
          </AnimatePresence>

          {/* Floating Fix with AI button — visible when console has errors and popup was dismissed */}
          {errorPopupDismissed && !showConsole && consoleLogs.some(e => e.level === 'error') && onFixErrors && (
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
                <span>Fix {Math.min(errorCount, 9)} error{errorCount !== 1 ? 's' : ''} with AI</span>
              </button>
            </div>
          )}

          {/* Iframe error overlay with diagnose button */}
          {iframeError && (
            <div className="absolute top-3 left-3 right-3 z-10 animate-fade-in">
              <div className="bg-forge-bg/95 backdrop-blur border border-red-200 dark:border-red-500/30 rounded-lg p-3 shadow-lg max-w-sm mx-auto">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                  <p className="text-xs text-red-700 dark:text-red-400 flex-1">{iframeError}</p>
                  <button
                    onClick={() => setIframeError(null)}
                    className="p-0.5 text-red-400 hover:text-red-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <button
                  onClick={() => {
                    // Dispatch preview error event for AI to auto-diagnose
                    window.dispatchEvent(new CustomEvent('forge:preview-error', {
                      detail: { url: wcPreviewUrl || 'unknown', errorType: 'refused_to_connect' }
                    }))
                    setIframeError(null)
                  }}
                  className="mt-2 text-[11px] text-amber-500 hover:text-amber-400 transition-colors"
                >
                  Diagnose with AI
                </button>
              </div>
            </div>
          )}

          {/* Live sandbox iframe — stays visible while WebContainer is loading */}
          {isSandboxActive && (
            <>
              {iframeLoading && !wcPreviewUrl && (
                <div className="absolute inset-0 z-10 pointer-events-none">
                  <div className="absolute inset-0 animate-shimmer" />
                  <div className="absolute top-3 right-3">
                    <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                  </div>
                </div>
              )}
              <iframe
                id={(!wcPreviewUrl || wcIframeReady) ? undefined : 'forge-preview-iframe'}
                key={`sandbox-${refreshKey}`}
                src={sandboxUrl}
                className={cn(
                  'w-full h-full border-0 absolute inset-0 transition-opacity duration-500',
                  'opacity-100',
                )}
                title="Live Preview"
                allow="cross-origin-isolated"
                onLoad={(e) => {
                  if (!wcPreviewUrl) setIframeLoading(false)
                  setIframeError(null)
                  setSandboxError(null)
                  // Trigger ready phase + crossfade
                  if (buildPhase && buildPhase !== 'ready') {
                    setBuildPhase('ready')
                    setIsCrossfading(true)
                    crossfadeTimerRef.current = setTimeout(() => {
                      setIsCrossfading(false)
                      setBuildPhase(null)
                    }, 600) // matches CSS crossfade duration
                  }
                  if (!wcPreviewUrl) onPreviewReady?.()
                  // Track navigation
                  try {
                    const url = (e.target as HTMLIFrameElement).contentWindow?.location.href
                    if (url) {
                      const parsed = new URL(url)
                      if (!wcIframeReady) setCurrentPath(parsed.pathname + parsed.search + parsed.hash)
                    }
                  } catch {
                    if (!wcIframeReady) setNavCount(prev => prev + 1)
                  }
                }}
                onError={() => { if (!wcPreviewUrl) setIframeError('Preview failed to load') }}
              />
            </>
          )}

          {/* WebContainer live preview — only used as fallback when v0 sandbox is NOT active.
              Next.js 15.5.x crashes in WebContainers (vercel/next.js#84026), so prefer v0. */}
          {wcPreviewUrl && !isSandboxActive && (
            <>
              {!wcIframeReady && (
                <div className="absolute top-3 right-3 z-20">
                  <Loader2 className="w-4 h-4 animate-spin text-forge-accent" />
                </div>
              )}
              <iframe
                id="forge-preview-iframe"
                key={`wc-${wcPreviewUrl}`}
                src={wcPreviewUrl}
                className={cn(
                  'w-full h-full border-0 absolute inset-0 transition-opacity duration-500',
                  wcIframeReady ? 'opacity-100' : 'opacity-0 pointer-events-none',
                )}
                title="Live Preview"
                allow="cross-origin-isolated"
                onLoad={(e) => {
                  setWcIframeReady(true)
                  setIframeLoading(false)
                  setIframeError(null)
                  onPreviewReady?.()
                  // Track navigation — try to read URL, fall back for cross-origin
                  try {
                    const url = (e.target as HTMLIFrameElement).contentWindow?.location.href
                    if (url) {
                      const parsed = new URL(url)
                      setCurrentPath(parsed.pathname + parsed.search + parsed.hash)
                    }
                  } catch {
                    setNavCount(prev => prev + 1)
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
              <div className="flex flex-col items-center justify-center h-full gap-1.5 text-forge-text-dim/50 text-[10px] py-4">
                <Terminal className="w-4 h-4 console-breathe" />
                <span>Waiting for output...</span>
              </div>
            ) : (
              <>
                {consoleLogs.slice(-50).map((entry, i, arr) => {
                  const isLast = i === arr.length - 1
                  return (
                  <div key={consoleLogs.length - 50 + i} className={cn(
                    'group/entry flex items-start py-0.5 px-1 rounded relative',
                    entry.level === 'error' ? 'text-red-500 dark:text-red-400 bg-red-500/5 console-entry-error'
                      : entry.level === 'warn' ? 'text-amber-600 dark:text-yellow-400 bg-amber-500/5 console-entry-warn'
                      : entry.level === 'info' ? 'text-blue-600 dark:text-blue-400'
                      : entry.source === 'sandbox' ? 'text-emerald-600 dark:text-green-400'
                      : 'text-forge-text',
                    isLast && 'console-entry-new',
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
                    <span className="ml-1 break-all flex-1">{entry.message}</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(entry.message)
                        setCopiedConsoleIdx(i)
                        setTimeout(() => setCopiedConsoleIdx(prev => prev === i ? null : prev), 1500)
                      }}
                      className="shrink-0 ml-1 p-0.5 rounded opacity-0 group-hover/entry:opacity-60 hover:!opacity-100 text-forge-text-dim hover:text-forge-text transition-opacity"
                      title="Copy to clipboard"
                    >
                      {copiedConsoleIdx === i ? <Check className="w-2.5 h-2.5 text-forge-success" /> : <Copy className="w-2.5 h-2.5" />}
                    </button>
                  </div>
                  )
                })}
                <div ref={consoleEndRef} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )

  return content
})
