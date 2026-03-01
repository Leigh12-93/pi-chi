'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import {
  RefreshCw, Monitor, Smartphone, Tablet, AlertTriangle,
  Square, Loader2, Zap, ExternalLink, Maximize2, Minimize2,
  Globe, Terminal, X, ArrowUpFromLine, Play,
} from 'lucide-react'
import { cn, hashFileMap } from '@/lib/utils'

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
}

type ViewMode = 'desktop' | 'tablet' | 'mobile'

type SandboxStatus = 'idle' | 'initializing' | 'running' | 'error'

const STATUS_LABELS: Record<SandboxStatus, string> = {
  idle: '',
  initializing: 'Creating preview...',
  running: 'Live',
  error: 'Error',
}

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

function BuildingPlaceholder() {
  return (
    <div className="flex items-center justify-center h-full bg-zinc-900 text-zinc-400">
      <div className="text-center">
        <div className="animate-pulse text-lg mb-2">Building preview...</div>
        <div className="text-sm text-zinc-500">Sandbox is starting up</div>
      </div>
    </div>
  )
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

export function PreviewPanel({ files, projectId, onFixErrors }: PreviewPanelProps) {
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
  const sandboxUrlRef = useRef<string | null>(null) // stable ref for sync effect
  const errorAutoFeedRef = useRef<Map<string, number>>(new Map()) // error → attempt count (cap at 3)
  const errorFeedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [iframeError, setIframeError] = useState<string | null>(null)
  const lastAutoFeedRef = useRef(0) // global cooldown for error auto-feed
  const consoleLogsRef = useRef(consoleLogs) // stable ref for message listener

  // Keep consoleLogsRef in sync without causing re-renders in message listener
  useEffect(() => { consoleLogsRef.current = consoleLogs }, [consoleLogs])

  const addLog = useCallback((msg: string, level: ConsoleEntry['level'] = 'system', source: ConsoleEntry['source'] = 'forge') => {
    const ts = new Date().toLocaleTimeString('en-AU', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setConsoleLogs(prev => {
      const next = [...prev.slice(-199), { timestamp: ts, level, message: msg, source }]
      requestAnimationFrame(() => consoleEndRef.current?.scrollIntoView({ behavior: 'smooth' }))
      return next
    })
  }, [])

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

    const fileCount = Object.keys(files).length
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
      setSandboxUrl(data.demoUrl)
      sandboxUrlRef.current = data.demoUrl
      setSandboxStatus('running')
      lastSyncedFilesRef.current = hashFileMap(files)

      const meta = [
        data.fileCount && `${data.fileCount} files uploaded`,
        data.skippedCount && `${data.skippedCount} skipped`,
      ].filter(Boolean).join(', ')
      if (meta) addLog(meta, 'info', 'sandbox')
    } catch (error) {
      if (controller.signal.aborted) return
      setSandboxStatus('error')
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
    hasAutoStartedRef.current = false // allow re-auto-start if user manually stops
    retryCountRef.current = 0
    addLog('Stopped', 'system', 'sandbox')
  }, [projectId, addLog])

  // ─── AUTO-START: launch sandbox when project looks ready ──────
  // Check sandbox availability first, then debounce 3s after files stabilize
  useEffect(() => {
    if (sandboxStatus !== 'idle') return
    if (hasAutoStartedRef.current) return
    if (!projectId) return
    if (!isProjectReady(files)) return

    if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current)

    autoStartTimeoutRef.current = setTimeout(async () => {
      // Check if sandbox is available (cached after first check)
      if (sandboxAvailableRef.current === null) {
        try {
          const res = await fetch('/api/sandbox?check=true')
          const data = await res.json()
          sandboxAvailableRef.current = data.available === true
        } catch {
          sandboxAvailableRef.current = false
        }
      }

      // Silently skip auto-start if sandbox is not configured
      if (!sandboxAvailableRef.current) {
        hasAutoStartedRef.current = true // don't retry
        return
      }

      hasAutoStartedRef.current = true
      startSandbox()
    }, 3000) // wait 3s for files to stabilize

    return () => {
      if (autoStartTimeoutRef.current) clearTimeout(autoStartTimeoutRef.current)
    }
  }, [files, sandboxStatus, projectId, startSandbox])

  // ─── Debounced file sync to running sandbox ───────────────────
  useEffect(() => {
    if (sandboxStatus !== 'running' || !projectId) return

    const currentHash = hashFileMap(files)
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
      addLog(message, level, 'preview')
      // Auto-open console on errors
      if (level === 'error') {
        setShowConsole(true)
        // Auto-feed error to AI (debounced, max 3 attempts per unique error)
        if (onFixErrors) {
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
              onFixErrors(`[Auto-detected preview error — attempt ${attempts + 1}/3]\n\nThe preview has runtime errors. Please fix them:\n\n\`\`\`\n${errorText}\n\`\`\``)
            }, 2000)
          }
        }
      }
    }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [addLog, onFixErrors]) // consoleLogs accessed via consoleLogsRef to avoid re-registering listener

  // Reset auto-feed attempts when files change (user or AI made fixes)
  const prevFileHashRef = useRef<string>('')
  useEffect(() => {
    const h = hashFileMap(files)
    if (prevFileHashRef.current && h !== prevFileHashRef.current) {
      // Files changed — give the new code a chance, but don't fully reset
      // (the 3-attempt cap per error message still applies)
    }
    prevFileHashRef.current = h
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

  // Display URL for the URL bar
  const displayUrl = isSandboxActive
    ? sandboxUrl
    : isSandboxLoading
      ? STATUS_LABELS[sandboxStatus]
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
                  'p-2.5 sm:p-1.5 rounded-md transition-colors',
                  viewMode === mode
                    ? 'bg-forge-accent/15 text-forge-accent'
                    : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface',
                )}
              >
                <Icon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
              </button>
            ))}
          </div>

          {/* Center: URL bar */}
          <div className="flex-1 flex items-center min-w-0">
            <div className={cn(
              'flex items-center gap-2 w-full px-3 py-1.5 rounded-lg text-xs font-mono transition-colors',
              'bg-forge-surface border border-forge-border',
              isSandboxActive && 'border-green-300 bg-green-50/50',
              isSandboxLoading && 'border-amber-300 bg-amber-50/50',
              sandboxStatus === 'error' && 'border-red-300 bg-red-50/50',
              showCachedPreview && 'border-gray-300 bg-gray-50/50',
            )}>
              {/* Status indicator */}
              {isSandboxActive && !isSyncing && (
                <div className="shrink-0 flex items-center gap-1 text-green-600">
                  <Zap className="w-3 h-3" />
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
                <Globe className="w-3 h-3 shrink-0 text-gray-400" />
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
                isSandboxActive ? 'text-green-700' : 'text-forge-text-dim',
                isSandboxLoading && 'text-amber-700',
                sandboxStatus === 'error' && 'text-red-600',
                showCachedPreview && 'text-gray-400',
              )}>
                {displayUrl}
              </span>

              {/* Sync badge */}
              {isSyncing && isSandboxActive && (
                <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-medium bg-blue-100 text-blue-600 rounded animate-pulse">
                  SYNCING
                </span>
              )}

              {/* Offline badge */}
              {showCachedPreview && (
                <span className="shrink-0 px-1.5 py-0.5 text-[9px] font-medium bg-gray-200 text-gray-500 rounded">
                  CACHED
                </span>
              )}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex items-center gap-0.5 shrink-0">
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
                  'text-red-500 hover:text-red-700 hover:bg-red-50',
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
      <div className="flex-1 overflow-hidden bg-white relative">
        <div className={cn('h-full transition-all', widthClasses[viewMode])}>
          {/* Static preview iframe — always present as base layer, srcDoc updates reactively */}
          {previewHtml === '__JSX_BUILDING_PLACEHOLDER__' && !isSandboxActive && !showCachedPreview ? (
            <div className="absolute inset-0">
              <BuildingPlaceholder />
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
              <div className="absolute inset-0 flex items-center justify-center bg-white/30 backdrop-blur-[1px]">
                <div className="flex flex-col items-center gap-3 px-6 py-4 bg-white/95 backdrop-blur border border-forge-border rounded-xl shadow-lg">
                  <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-gray-400" />
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

          {/* Building animation — shows a miniature page being painted */}
          {isSandboxLoading && (
            <div className="forge-building-scene animate-fade-in">
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
              </div>

              {/* Status below browser */}
              <div className="forge-build-status">
                <div className="forge-build-dots">
                  <span />
                  <span />
                  <span />
                </div>
                <span className="text-xs font-medium text-indigo-500/70 tracking-wide">
                  Building your preview
                </span>
                {Object.keys(files).length > 0 && (
                  <span className="text-[10px] text-indigo-400/50">
                    {Object.keys(files).length} files
                  </span>
                )}
              </div>

              {/* Progress track */}
              <div className="forge-progress-track">
                <div className="forge-progress-bar" />
              </div>
            </div>
          )}

          {/* Start Preview button — shown when sandbox is idle and project looks ready */}
          {sandboxStatus === 'idle' && !showCachedPreview && isProjectReady(files) && (
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3 animate-fade-in">
                <button
                  onClick={() => { hasAutoStartedRef.current = false; sandboxAvailableRef.current = null; retryCountRef.current = 0; startSandbox() }}
                  className="group flex items-center gap-2 px-5 py-2.5 bg-forge-accent text-white text-sm font-medium rounded-xl hover:bg-forge-accent-hover transition-all shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Play className="w-4 h-4 transition-transform group-hover:scale-110" />
                  Start Live Preview
                </button>
                <span className="text-[10px] text-forge-text-dim">
                  Opens a full sandbox with {Object.keys(files).length} files
                </span>
              </div>
            </div>
          )}

          {/* Sandbox error toast — non-blocking overlay at bottom */}
          {sandboxStatus === 'error' && sandboxError && (
            <div className="absolute bottom-3 left-3 right-3 z-10 animate-fade-in">
              <div className="bg-white/95 backdrop-blur border border-red-200 rounded-lg p-3 shadow-lg flex items-start gap-2 max-w-sm mx-auto">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-red-900">Sandbox Error</p>
                  <p className="text-[10px] text-red-600 font-mono truncate mt-0.5" title={sandboxError}>{sandboxError}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => { hasAutoStartedRef.current = false; sandboxAvailableRef.current = null; retryCountRef.current = 0; startSandbox() }}
                    className="px-2 py-1 bg-red-600 text-white text-[10px] rounded hover:bg-red-700 transition-colors"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => { setSandboxStatus('idle'); setSandboxError(null); hasAutoStartedRef.current = true }}
                    className="p-1 text-red-400 hover:text-red-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Iframe error overlay */}
          {iframeError && (
            <div className="absolute top-3 left-3 right-3 z-10 animate-fade-in">
              <div className="bg-white/95 backdrop-blur border border-red-200 rounded-lg p-3 shadow-lg flex items-center gap-2 max-w-sm mx-auto">
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
                onLoad={() => setIframeLoading(false)}
                onError={() => setIframeError('Preview failed to load')}
              />
            </>
          )}
        </div>
      </div>

      {/* ─── Console Panel ─────────────────────────────────────── */}
      {showConsole && (
        <div className="shrink-0 border-t border-forge-border bg-[#1e1e1e] max-h-[40vh] sm:max-h-[200px] flex flex-col">
          {/* Console header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-[#333]">
            <div className="flex items-center gap-2">
              <Terminal className="w-3 h-3 text-gray-400" />
              <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider">Console</span>
              {consoleLogs.length > 0 && (
                <span className="text-[10px] text-gray-500">({consoleLogs.length})</span>
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
                className="text-[10px] text-gray-500 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-[#333] transition-colors"
              >
                Clear
              </button>
              <button
                onClick={() => setShowConsole(false)}
                className="p-0.5 text-gray-500 hover:text-gray-300 rounded hover:bg-[#333] transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          </div>
          {/* Console body */}
          <div className="flex-1 overflow-y-auto p-2 font-mono text-xs sm:text-[11px] leading-relaxed">
            {consoleLogs.length === 0 ? (
              <div className="text-gray-600 text-center py-4">No logs yet</div>
            ) : (
              <>
                {consoleLogs.map((entry, i) => (
                  <div key={i} className={cn(
                    'py-0.5 px-1 rounded',
                    entry.level === 'error' ? 'text-red-400 bg-red-950/20'
                      : entry.level === 'warn' ? 'text-yellow-400'
                      : entry.level === 'info' ? 'text-blue-400'
                      : entry.source === 'sandbox' ? 'text-green-400'
                      : 'text-gray-300',
                  )}>
                    <span className="text-gray-600 select-none">[{entry.timestamp}]</span>
                    {entry.level !== 'system' && (
                      <span className={cn('ml-1 text-[9px] uppercase font-medium',
                        entry.level === 'error' ? 'text-red-500'
                        : entry.level === 'warn' ? 'text-yellow-500'
                        : 'text-gray-500'
                      )}>{entry.level}</span>
                    )}
                    <span className="ml-1">{entry.message}</span>
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
