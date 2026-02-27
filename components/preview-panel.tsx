'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import {
  RefreshCw, Monitor, Smartphone, Tablet, AlertTriangle,
  Code2, Square, Loader2, Zap, ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PreviewPanelProps {
  files: Record<string, string>
  projectId?: string | null
}

type ViewMode = 'desktop' | 'tablet' | 'mobile'

type SandboxStatus = 'idle' | 'booting' | 'writing' | 'installing' | 'starting' | 'running' | 'error'

const STATUS_LABELS: Record<SandboxStatus, string> = {
  idle: '',
  booting: 'Creating VM...',
  writing: 'Writing files...',
  installing: 'Installing deps...',
  starting: 'Starting server...',
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

  // Sandbox state
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus>('idle')
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null)
  const [sandboxError, setSandboxError] = useState<string | null>(null)
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoStartTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedFilesRef = useRef<string>('')
  const startingRef = useRef(false) // prevent double-starts
  const hasAutoStartedRef = useRef(false) // only auto-start once per session
  const sandboxAvailableRef = useRef<boolean | null>(null) // cached sandbox availability check

  // Detect project type
  const projectType = useMemo(() => {
    if (files['next.config.ts'] || files['next.config.js']) return 'nextjs'
    if (files['vite.config.ts'] || files['vite.config.js']) return 'vite'
    if (files['index.html'] && !files['src/main.tsx'] && !files['app/page.tsx']) return 'static'
    if (files['src/main.tsx'] || files['src/main.jsx']) return 'vite'
    if (files['app/page.tsx'] || files['app/page.jsx']) return 'nextjs'
    return 'unknown'
  }, [files])

  // Helper to create empty state HTML
  const createEmptyState = (title: string, subtitle: string) => {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script></head>
<body class="min-h-screen bg-gray-50 flex items-center justify-center">
  <div class="text-center text-gray-600 max-w-md">
    <div class="w-16 h-16 mx-auto mb-4 bg-gray-200 rounded-full flex items-center justify-center">
      <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"></path>
      </svg>
    </div>
    <h3 class="text-lg font-medium text-gray-900 mb-2">${title}</h3>
    <p class="text-sm text-gray-500">${subtitle}</p>
  </div>
</body></html>`
  }

  // Build static preview HTML (instant, shown while sandbox boots)
  const previewHtml = useMemo(() => {
    setPreviewError(null)

    try {
      if (Object.keys(files).length === 0) {
        return createEmptyState('No files yet', 'Start building to see a preview')
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

    startingRef.current = true
    setSandboxStatus('booting')
    setSandboxError(null)
    setSandboxUrl(null)

    try {
      const res = await fetch('/api/sandbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          files,
          framework: projectType !== 'unknown' ? projectType : undefined,
        }),
      })

      const data = await res.json()

      if (!res.ok || !data.ok) {
        setSandboxStatus('error')
        setSandboxError(data.error || 'Failed to create sandbox')
        return
      }

      setSandboxUrl(data.url)
      setSandboxStatus('running')
      lastSyncedFilesRef.current = JSON.stringify(files)
    } catch (error) {
      setSandboxStatus('error')
      setSandboxError(error instanceof Error ? error.message : 'Network error')
    } finally {
      startingRef.current = false
    }
  }, [projectId, files, projectType])

  const stopSandbox = useCallback(async () => {
    if (!projectId) return

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
    hasAutoStartedRef.current = false // allow re-auto-start if user manually stops
  }, [projectId])

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

    const currentHash = JSON.stringify(files)
    if (currentHash === lastSyncedFilesRef.current) return

    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)

    syncTimeoutRef.current = setTimeout(async () => {
      try {
        await fetch('/api/sandbox', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, files }),
        })
        lastSyncedFilesRef.current = currentHash
      } catch { /* sync failed — will retry on next change */ }
    }, 1500)

    return () => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current)
    }
  }, [files, sandboxStatus, projectId])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (projectId && (sandboxStatus === 'running' || startingRef.current)) {
        fetch('/api/sandbox', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        }).catch(() => {})
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const widthClasses: Record<ViewMode, string> = {
    desktop: 'w-full',
    tablet: 'w-[768px] mx-auto',
    mobile: 'w-[375px] mx-auto',
  }

  const isSandboxActive = sandboxStatus === 'running' && sandboxUrl
  const isSandboxLoading = ['booting', 'writing', 'installing', 'starting'].includes(sandboxStatus)

  return (
    <div className="h-full flex flex-col bg-forge-surface">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-forge-border bg-forge-panel shrink-0">
        <div className="flex items-center gap-1">
          {/* Project type indicator */}
          <div className="flex items-center gap-1.5 mr-2 px-2 py-1 bg-forge-surface rounded text-xs">
            <Code2 className="w-3 h-3 text-forge-accent" />
            <span className="text-forge-text-dim font-mono">{projectType}</span>
          </div>

          {/* View mode buttons */}
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
                'p-1.5 rounded transition-colors',
                viewMode === mode ? 'bg-forge-accent/20 text-forge-accent' : 'text-forge-text-dim hover:text-forge-text',
              )}
            >
              <Icon className="w-3.5 h-3.5" />
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {/* Sandbox status */}
          {isSandboxLoading && (
            <div className="flex items-center gap-1.5 text-xs text-amber-600 mr-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              <span>{STATUS_LABELS[sandboxStatus]}</span>
            </div>
          )}

          {isSandboxActive && (
            <div className="flex items-center gap-1.5 text-xs text-green-600 mr-1">
              <Zap className="w-3 h-3" />
              <span>Live</span>
            </div>
          )}

          {sandboxStatus === 'error' && (
            <div className="flex items-center gap-1 text-forge-danger text-xs mr-1" title={sandboxError || 'Error'}>
              <AlertTriangle className="w-3 h-3" />
              <span>Error</span>
            </div>
          )}

          {previewError && sandboxStatus === 'idle' && (
            <div className="flex items-center gap-1 text-forge-danger text-xs mr-1">
              <AlertTriangle className="w-3 h-3" />
              <span>Error</span>
            </div>
          )}

          {/* Open in new tab */}
          {isSandboxActive && (
            <a
              href={sandboxUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded text-forge-text-dim hover:text-forge-text transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}

          {/* Stop button (only when sandbox is active) */}
          {(isSandboxActive || isSandboxLoading) && (
            <button
              onClick={stopSandbox}
              disabled={isSandboxLoading}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                'bg-red-100 text-red-700 hover:bg-red-200',
                isSandboxLoading && 'opacity-50 cursor-not-allowed',
              )}
              title="Stop sandbox"
            >
              <Square className="w-3 h-3" />
              <span>Stop</span>
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="p-1.5 rounded text-forge-text-dim hover:text-forge-text transition-colors"
            title="Refresh preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-auto bg-white p-0 relative">
        <div className={cn('h-full transition-all', widthClasses[viewMode])}>
          {/* Always show static preview underneath as instant feedback */}
          <iframe
            key={`static-${refreshKey}`}
            srcDoc={previewHtml}
            className={cn(
              'w-full h-full border-0 absolute inset-0',
              isSandboxActive ? 'hidden' : 'block',
            )}
            sandbox="allow-scripts allow-same-origin"
            title="Static Preview"
          />

          {/* Loading indicator while sandbox boots — small banner, not blocking */}
          {isSandboxLoading && (
            <div className="absolute top-2 left-2 right-2 z-10">
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 shadow flex items-center gap-2 max-w-xs mx-auto">
                <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-amber-800">{STATUS_LABELS[sandboxStatus]}</p>
                  <p className="text-[10px] text-amber-600">Static preview shown below</p>
                </div>
              </div>
            </div>
          )}

          {/* Sandbox error — small toast at bottom, not a blocking overlay */}
          {sandboxStatus === 'error' && sandboxError && (
            <div className="absolute bottom-3 left-3 right-3 z-10">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 shadow-lg flex items-start gap-2 max-w-sm mx-auto">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-red-900">Sandbox Error</p>
                  <p className="text-[10px] text-red-700 font-mono truncate mt-0.5" title={sandboxError}>{sandboxError}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => { hasAutoStartedRef.current = false; sandboxAvailableRef.current = null; startSandbox() }}
                    className="px-2 py-1 bg-red-600 text-white text-[10px] rounded hover:bg-red-700 transition-colors"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => { setSandboxStatus('idle'); setSandboxError(null); hasAutoStartedRef.current = true }}
                    className="px-2 py-1 bg-red-200 text-red-800 text-[10px] rounded hover:bg-red-300 transition-colors"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Live sandbox iframe */}
          {isSandboxActive && (
            <iframe
              key={`sandbox-${refreshKey}`}
              src={sandboxUrl}
              className="w-full h-full border-0"
              title="Live Preview"
              allow="cross-origin-isolated"
            />
          )}
        </div>
      </div>
    </div>
  )
}
