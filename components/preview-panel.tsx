'use client'

import { useMemo, useState } from 'react'
import { RefreshCw, Monitor, Smartphone, Tablet, AlertTriangle, ExternalLink, Code2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PreviewPanelProps {
  files: Record<string, string>
}

type ViewMode = 'desktop' | 'tablet' | 'mobile'

export function PreviewPanel({ files }: PreviewPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('desktop')
  const [refreshKey, setRefreshKey] = useState(0)
  const [previewError, setPreviewError] = useState<string | null>(null)

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

  // Build preview HTML from project files
  const previewHtml = useMemo(() => {
    setPreviewError(null)
    
    try {
      // No files to preview
      if (Object.keys(files).length === 0) {
        return createEmptyState('No files created yet', 'Start building to see a preview')
      }

      // Static HTML projects
      if (projectType === 'static' && files['index.html']) {
        return files['index.html']
      }

      // For React/Next.js projects, build a simple preview
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

      // Extract JSX from the default export function
      // This is a simplified approach — it extracts the return statement
      const jsxMatch = appFile.match(/return\\s*\\(\\s*([\\s\\S]*)\\s*\\)\\s*\\}?\\s*$/m)
      let jsx = jsxMatch ? jsxMatch[1] : '<div class="p-8 text-center">Preview loading...</div>'

      // Clean up TSX syntax for plain HTML
      jsx = jsx
        .replace(/className=/g, 'class=')
        .replace(/\\{\\/\\*.*?\\*\\/\\}/g, '') // Remove JSX comments
        .replace(/\\{`([^`]*)`\\}/g, '$1') // Template literals
        .replace(/\\{'([^']*)'\\}/g, '$1') // String expressions
        .replace(/<(\\w+)\\s*\\/>/g, '<$1></$1>') // Self-closing tags
        .replace(/\\{[^}]*\\}/g, '') // Remove remaining JSX expressions

      // Get CSS
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
    ${css.replace(/@import\\s+"tailwindcss";\\s*/g, '').replace(/@import\\s+'tailwindcss';\\s*/g, '')}
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

  const widthClasses: Record<ViewMode, string> = {
    desktop: 'w-full',
    tablet: 'w-[768px] mx-auto',
    mobile: 'w-[375px] mx-auto',
  }

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
          {previewError && (
            <div className="flex items-center gap-1 text-forge-danger text-xs">
              <AlertTriangle className="w-3 h-3" />
              <span>Error</span>
            </div>
          )}
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="p-1.5 rounded text-forge-text-dim hover:text-forge-text transition-colors"
            title="Refresh preview"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 overflow-auto bg-white p-0">
        <div className={cn('h-full transition-all', widthClasses[viewMode])}>
          <iframe
            key={refreshKey}
            srcDoc={previewHtml}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
            title="Preview"
          />
        </div>
      </div>
    </div>
  )
}