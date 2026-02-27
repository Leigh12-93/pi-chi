'use client'

import { useMemo, useState, useEffect } from 'react'
import { RefreshCw, Monitor, Smartphone, Tablet, Code2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PreviewPanelProps {
  files: Record<string, string>
}

type ViewMode = 'desktop' | 'tablet' | 'mobile'

export function PreviewPanel({ files }: PreviewPanelProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('desktop')
  const [refreshKey, setRefreshKey] = useState(0)

  // Build preview HTML from project files
  const previewHtml = useMemo(() => {
    // If there's a plain index.html, use it directly (static sites)
    if (files['index.html'] && !files['src/main.tsx'] && !files['app/page.tsx']) {
      return files['index.html']
    }

    // For React projects, build a simple preview by extracting the main component
    // and rendering it with React from CDN
    const appFile = files['src/App.tsx'] || files['src/App.jsx'] || files['app/page.tsx'] || files['app/page.jsx']
    if (!appFile) {
      return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><script src="https://cdn.tailwindcss.com"></script></head>
<body class="min-h-screen bg-gray-950 flex items-center justify-center">
  <div class="text-center text-gray-500">
    <p class="text-sm">No preview available</p>
    <p class="text-xs mt-1">Create files to see a preview</p>
  </div>
</body></html>`
    }

    // Extract JSX from the default export function
    // This is a simplified approach — it extracts the return statement
    const jsxMatch = appFile.match(/return\s*\(\s*([\s\S]*)\s*\)\s*\}?\s*$/m)
    let jsx = jsxMatch ? jsxMatch[1] : '<div>Preview loading...</div>'

    // Clean up TSX syntax for plain HTML
    jsx = jsx
      .replace(/className=/g, 'class=')
      .replace(/\{\/\*.*?\*\/\}/g, '') // Remove JSX comments
      .replace(/\{`([^`]*)`\}/g, '$1') // Template literals
      .replace(/\{'([^']*)'\}/g, '$1') // String expressions
      .replace(/<(\w+)\s*\/>/g, '<$1></$1>') // Self-closing tags

    // Get CSS
    const css = files['app/globals.css'] || files['src/index.css'] || ''
    const hasTailwind = css.includes('tailwindcss') || css.includes('tailwind')

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
  }, [files, refreshKey])

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
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          className="p-1.5 rounded text-forge-text-dim hover:text-forge-text transition-colors"
          title="Refresh preview"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Preview iframe */}
      <div className="flex-1 overflow-auto bg-white p-0">
        <div className={cn('h-full transition-all', widthClasses[viewMode])}>
          <iframe
            key={refreshKey}
            srcDoc={previewHtml}
            className="w-full h-full border-0"
            sandbox="allow-scripts"
            title="Preview"
          />
        </div>
      </div>
    </div>
  )
}
