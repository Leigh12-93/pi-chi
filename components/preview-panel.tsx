'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import {
  RefreshCw, Monitor, Smartphone, Tablet, AlertTriangle,
  Code2, Play, Square, Loader2, Zap, ExternalLink,
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
  installing: 'Installing dependencies...',
  starting: 'Starting dev server...',
  running: 'Running',
  error: 'Error',
}

export function PreviewPanel({ files, projectId }: PreviewPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('desktop')
  const [refreshKey, setRefreshKey] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)

  // Sandbox state
  const [sandboxStatus, setSandboxStatus] = useState<SandboxStatus>('idle')
  const [sandboxUrl, setSandboxUrl] = useState<string | null>(null)
  const [sandboxError, setSandboxError] = useState<string | null>(null)
  const [sandboxId, setSandboxId] = useState<string | null>(null)
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSyncedFilesRef = useRef<string>('')

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
    <div class="mt-4 text-xs text-gray-400">
      Project type: <span class="font-mono bg-gray-100 px-2 py-1 rounded">${projectType}</span>
    </div>
  </div>
</body></html>`
  }

  // Helper to create error state HTML
  const createErrorState = (error: string) => {
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script></head>
<body class="min-h-screen bg-red-50 flex items-center justify-center">
  <div class="text-center text-red-600 max-w-md">
    <div class="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-full flex items-center justify-center">
      <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
      </svg>
    </div>
    <h3 class="text-lg font-medium text-red-900 mb-2">Preview Error</h3>
    <p class="text-sm text-red-700 font-mono bg-red-100 p-3 rounded">${error}</p>
  </div>
</body></html>`
  }

  // Build static preview HTML from project files (fallback when no sandbox)
  const previewHtml = useMemo(() => {
    setPreviewError(null)

    try {
      if (Object.keys(files).length === 0) {
        return createEmptyState('No files created yet', 'Start building to see a preview')
      }

      if (projectType === 'static' && files['index.html']) {
        return files['index.html']
      }

      const appFile = files['src/App.tsx'] || files['src/App.jsx'] || files['app/page.tsx'] || files['app/page.jsx']
      if (!appFile) {
        if (projectType === 'nextjs') {
          return createEmptyState('Next.js project detected', 'Create app/page.tsx to see preview')
        } else if (projectType === 'vite') {
          return createEmptyState('Vite project detected', 'Create src/App.tsx to see preview')
        } else {
          return createEmptyState('No main component found', 'Create a main component file')
        }
      }

      const jsxMatch = appFile.match(/return\s*\(\s*([\s\S]*)\s*\)\s*\}?\s*$/m)
      let jsx = jsxMatch ? jsxMatch[1] : '<div class="p-8 text-center">Preview loading...</div>'

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
      return createErrorState(errorMessage)
    }
  }, [files, refreshKey, projectType])

  // ─── Sandbox controls ─────────────────────────────────────────

  const startSandbox = useCallback(async () => {
    if (!projectId) return
    if (Object.keys(files).length === 0) return

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

      setSandboxId(data.sandboxId)
      setSandboxUrl(data.url)
      setSandboxStatus('running')
      lastSyncedFilesRef.current = JSON.stringify(files)
    } catch (error) {
      setSandboxStatus('error')
      setSandboxError(error instanceof Error ? error.message : 'Network error')
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
    setSandboxId(null)
    setSandboxError(null)
  }, [projectId])

  // Debounced file sync to running sandbox
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
      if (projectId && sandboxStatus === 'running') {
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
            <div className="flex items-center gap-1 text-forge-danger text-xs mr-1">
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

          {/* Open in new tab (when sandbox running) */}
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

          {/* Run / Stop sandbox button */}
          {isSandboxActive || isSandboxLoading ? (
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
          ) : (
            <button
              onClick={startSandbox}
              disabled={!projectId || Object.keys(files).length === 0}
              className={cn(
                'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                'bg-green-100 text-green-700 hover:bg-green-200',
                (!projectId || Object.keys(files).length === 0) && 'opacity-50 cursor-not-allowed',
              )}
              title="Run in sandbox (real Node.js environment)"
            >
              <Play className="w-3 h-3" />
              <span>Run</span>
            </button>
          )}

          {/* Refresh */}
          <button
            onClick={() => {
              if (isSandboxActive) {
                // Refresh sandbox iframe
                setRefreshKey(k => k + 1)
              } else {
                setRefreshKey(k => k + 1)
              }
            }}
            className="p-1.5 rounded text-forge-text-dim hover:text-forge-text transition-colors"
            title="Refresh preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Preview content */}
      <div className="flex-1 overflow-auto bg-white p-0">
        <div className={cn('h-full transition-all', widthClasses[viewMode])}>
          {/* Loading state */}
          {isSandboxLoading && (
            <div className="h-full flex items-center justify-center bg-gray-50">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-forge-accent mx-auto mb-3" />
                <p className="text-sm font-medium text-gray-700">{STATUS_LABELS[sandboxStatus]}</p>
                <p className="text-xs text-gray-500 mt-1">Setting up your development environment</p>
              </div>
            </div>
          )}

          {/* Sandbox error state */}
          {sandboxStatus === 'error' && sandboxError && (
            <div className="h-full flex items-center justify-center bg-red-50 p-4">
              <div className="text-center max-w-md">
                <AlertTriangle className="w-8 h-8 text-red-500 mx-auto mb-3" />
                <p className="text-sm font-medium text-red-900 mb-2">Sandbox Error</p>
                <p className="text-xs text-red-700 font-mono bg-red-100 p-3 rounded mb-3 break-all">{sandboxError}</p>
                <div className="flex gap-2 justify-center">
                  <button
                    onClick={startSandbox}
                    className="px-3 py-1.5 bg-red-600 text-white text-xs rounded hover:bg-red-700 transition-colors"
                  >
                    Retry
                  </button>
                  <button
                    onClick={() => { setSandboxStatus('idle'); setSandboxError(null) }}
                    className="px-3 py-1.5 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300 transition-colors"
                  >
                    Use static preview
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Sandbox running — show live iframe */}
          {isSandboxActive && !isSandboxLoading && (
            <iframe
              key={`sandbox-${refreshKey}`}
              src={sandboxUrl}
              className="w-full h-full border-0"
              title="Live Preview"
              allow="cross-origin-isolated"
            />
          )}

          {/* Static preview (no sandbox) */}
          {sandboxStatus === 'idle' && (
            <iframe
              key={`static-${refreshKey}`}
              srcDoc={previewHtml}
              className="w-full h-full border-0"
              sandbox="allow-scripts allow-same-origin"
              title="Preview"
            />
          )}
        </div>
      </div>
    </div>
  )
}
