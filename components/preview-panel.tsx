'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import {
  RefreshCw, Monitor, Smartphone, Tablet, AlertTriangle,
  Square, Loader2, Zap, ExternalLink, Maximize2, Minimize2,
  Globe, Terminal, X, ArrowUpFromLine,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PreviewPanelProps {
  files: Record<string, string>
  projectId?: string | null
}

/** Fast djb2 hash of files map — avoids serializing entire VFS */
function hashFilesForSync(files: Record<string, string>): string {
  const keys = Object.keys(files).sort()
  let h = 5381
  for (const k of keys) {
    for (let i = 0; i < k.length; i++) h = ((h << 5) + h + k.charCodeAt(i)) | 0
    h = ((h << 5) + h + files[k].length) | 0
  }
  return h.toString(36)
}

type ViewMode = 'desktop' | 'tablet' | 'mobile'

type SandboxStatus = 'idle' | 'initializing' | 'running' | 'error'

const STATUS_LABELS: Record<SandboxStatus, string> = {
  idle: '',
  initializing: 'Creating preview...',
  running: 'Live',
  error: 'Error',
}

// Minimum files needed before auto-starting sandbox
function isProjectReady(files: Record<string, string>): boolean {
  const paths = Object.keys(files)
  if (paths.length < 3) return false
  const hasPackageJson = paths.includes('package.json')
  const hasMainFile = paths.some(p =>
    p === 'app/page.tsx' || p === 'app/page.jsx' ||
    p === 'src/App.tsx' || p === 'src/App.jsx' ||
    p === 'index.html'
  )
  return hasPackageJson && hasMainFile
}

export function PreviewPanel({ files, projectId }: PreviewPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('desktop')
  const [refreshKey, setRefreshKey] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showConsole, setShowConsole] = useState(false)
  const [consoleLogs, setConsoleLogs] = useState<string[]>([])

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

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString('en-AU', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setConsoleLogs(prev => {
      const next = [...prev.slice(-99), `[${ts}] ${msg}`]
      // Auto-scroll on next tick
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

  // Detect project type
  const projectType = useMemo(() => {
    if (files['next.config.ts'] || files['next.config.js']) return 'nextjs'
    if (files['vite.config.ts'] || files['vite.config.js']) return 'vite'
    if (files['index.html'] && !files['src/main.tsx'] && !files['app/page.tsx']) return 'static'
    if (files['src/main.tsx'] || files['src/main.jsx']) return 'vite'
    if (files['app/page.tsx'] || files['app/page.jsx']) return 'nextjs'
    return 'unknown'
  }, [files])

  // Log status changes to console
  useEffect(() => {
    if (sandboxStatus !== 'idle') {
      const label = STATUS_LABELS[sandboxStatus]
      if (label) addLog(`[sandbox] ${label}`)
    }
  }, [sandboxStatus, addLog])

  // Log errors to console
  useEffect(() => {
    if (sandboxError) addLog(`[error] ${sandboxError}`)
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

  // Build static preview HTML (instant, shown while sandbox boots)
  const previewHtml = useMemo(() => {
    setPreviewError(null)

    try {
      if (Object.keys(files).length === 0) {
        return createEmptyState('No preview available', 'Start building to see a preview')
      }

      if (projectType === 'static' && files['index.html']) {
        return files['index.html']
      }

      const appFile = files['src/App.tsx'] || files['src/App.jsx'] || files['app/page.tsx'] || files['app/page.jsx']
      if (!appFile) {
        if (projectType === 'nextjs') return createEmptyState('Next.js project', 'Waiting for app/page.tsx...')
        if (projectType === 'vite') return createEmptyState('Vite project', 'Waiting for src/App.tsx...')
        return createEmptyState('Building...', 'Preview will appear when ready')
      }

      const jsxMatch = appFile.match(/return\s*\(\s*([\s\S]*)\s*\)\s*\}?\s*$/m)
      let jsx = jsxMatch ? jsxMatch[1] : '<div class="p-8 text-center">Building...</div>'

      jsx = jsx
        .replace(/className=/g, 'class=')
        .replace(/\{\/\*.*?\*\/\}/g, '')
        .replace(/\{`([^`]*)`\}/g, '$1')
        .replace(/\{'([^']*)'\}/g, '$1')
        .replace(/<(\w+)\s*\/>/g, '<$1></$1>')
        .replace(/\{[^}]*\}/g, '')

      const css = files['app/globals.css'] || files['src/index.css'] || ''
      const hasTailwind = css.includes('tailwindcss') || css.includes('tailwind')

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  ${hasTailwind ? '<script src="https://cdn.tailwindcss.com"></script>' : ''}
  <style>
    ${css.replace(/@import\s+"tailwindcss";\s*/g, '').replace(/@import\s+'tailwindcss';\s*/g, '')}
    body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  ${jsx}
</body>
</html>`
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setPreviewError(errorMessage)
      return createEmptyState('Preview Error', errorMessage)
    }
  }, [files, refreshKey, projectType])

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
    addLog(`[sandbox] Uploading ${fileCount} files...`)

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
          addLog(`[sandbox] Retrying in ${delay / 1000}s (attempt ${retryCountRef.current}/2)...`)
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
      lastSyncedFilesRef.current = hashFilesForSync(files)

      const meta = [
        data.fileCount && `${data.fileCount} files uploaded`,
        data.skippedCount && `${data.skippedCount} skipped`,
      ].filter(Boolean).join(', ')
      if (meta) addLog(`[sandbox] ${meta}`)
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
    addLog('[sandbox] Stopped')
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

    const currentHash = hashFilesForSync(files)
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
          addLog('[sync] Preview URL updated')
        }
        if (data.synced > 0) {
          addLog(`[sync] ${data.synced} files synced`)
        }
      } catch {
        addLog('[sync] Failed — will retry on next change')
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
      if (projectId && (sandboxStatus === 'running' || startingRef.current)) {
        fetch('/api/sandbox', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        }).catch(() => {})
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
                  'p-1.5 rounded-md transition-colors',
                  viewMode === mode
                    ? 'bg-forge-accent/15 text-forge-accent'
                    : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface',
                )}
              >
                <Icon className="w-3.5 h-3.5" />
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
                if (isSandboxActive) addLog('[sandbox] Refreshed')
              }}
              className="p-1.5 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
              title="Refresh preview"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>

            {/* Open in new tab */}
            {isSandboxActive && (
              <a
                href={sandboxUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {/* Console toggle */}
            <button
              onClick={() => setShowConsole(prev => !prev)}
              className={cn(
                'p-1.5 rounded-md transition-colors',
                showConsole
                  ? 'bg-forge-accent/15 text-forge-accent'
                  : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface',
              )}
              title="Toggle console"
            >
              <Terminal className="w-3.5 h-3.5" />
            </button>

            {/* Fullscreen toggle */}
            <button
              onClick={() => setIsFullscreen(prev => !prev)}
              className="p-1.5 rounded-md text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              {isFullscreen
                ? <Minimize2 className="w-3.5 h-3.5" />
                : <Maximize2 className="w-3.5 h-3.5" />
              }
            </button>

            {/* Stop button */}
            {(isSandboxActive || isSandboxLoading) && (
              <button
                onClick={stopSandbox}
                className={cn(
                  'p-1.5 rounded-md transition-colors',
                  'text-red-500 hover:text-red-700 hover:bg-red-50',
                )}
                title="Stop sandbox"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ─── Preview Body ──────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden bg-white relative">
        <div className={cn('h-full transition-all', widthClasses[viewMode])}>
          {/* Static preview iframe — always present as base layer */}
          <iframe
            key={`static-${refreshKey}`}
            srcDoc={previewHtml}
            className={cn(
              'w-full h-full border-0 absolute inset-0 transition-opacity duration-300',
              (isSandboxActive || showCachedPreview) ? 'opacity-0 pointer-events-none' : 'opacity-100',
            )}
            sandbox="allow-scripts allow-same-origin"
            title="Static Preview"
          />

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
                    className="px-3 py-1.5 text-[11px] font-medium bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover transition-colors"
                  >
                    Restart Sandbox
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading banner — non-blocking overlay at top */}
          {isSandboxLoading && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 animate-fade-in">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur border border-amber-200 rounded-full shadow-sm">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-600" />
                <span className="text-xs font-medium text-amber-800">
                  {STATUS_LABELS[sandboxStatus]}
                  {Object.keys(files).length > 0 && (
                    <span className="text-amber-500 ml-1">({Object.keys(files).length} files)</span>
                  )}
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

          {/* Live sandbox iframe */}
          {isSandboxActive && (
            <>
              {iframeLoading && (
                <div className="absolute top-3 right-3 z-10">
                  <Loader2 className="w-4 h-4 animate-spin text-green-500" />
                </div>
              )}
              <iframe
                key={`sandbox-${refreshKey}`}
                src={sandboxUrl}
                className="w-full h-full border-0 absolute inset-0"
                title="Live Preview"
                allow="cross-origin-isolated"
                onLoad={() => setIframeLoading(false)}
              />
            </>
          )}
        </div>
      </div>

      {/* ─── Console Panel ─────────────────────────────────────── */}
      {showConsole && (
        <div className="shrink-0 border-t border-forge-border bg-[#1e1e1e] max-h-[200px] flex flex-col">
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
          <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed">
            {consoleLogs.length === 0 ? (
              <div className="text-gray-600 text-center py-4">No logs yet</div>
            ) : (
              <>
                {consoleLogs.map((log, i) => (
                  <div key={i} className={cn(
                    'py-0.5 px-1 rounded',
                    log.includes('[error]') ? 'text-red-400'
                      : log.includes('[sync]') ? 'text-blue-400'
                      : log.includes('[sandbox]') ? 'text-green-400'
                      : 'text-gray-300',
                  )}>
                    {log}
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
