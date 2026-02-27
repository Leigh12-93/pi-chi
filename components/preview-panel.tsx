'use client'

import { useState } from 'react'
import { RefreshCw, ExternalLink, Globe, Play, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PreviewPanelProps {
  projectName: string
  url: string | null
  onUrlChange: (url: string | null) => void
}

export function PreviewPanel({ projectName, url, onUrlChange }: PreviewPanelProps) {
  const [inputUrl, setInputUrl] = useState(url || '')
  const [loading, setLoading] = useState(false)
  const [starting, setStarting] = useState(false)

  const handleStartDev = async () => {
    setStarting(true)
    // The dev server would be started through the chat AI
    // For now, show instructions
    setStarting(false)
  }

  const handleRefresh = () => {
    if (!url) return
    setLoading(true)
    // Force iframe refresh by toggling key
    const iframe = document.querySelector('#preview-iframe') as HTMLIFrameElement
    if (iframe) {
      iframe.src = iframe.src
    }
    setTimeout(() => setLoading(false), 1000)
  }

  const handleNavigate = () => {
    const target = inputUrl.trim()
    if (!target) return
    const withProtocol = target.startsWith('http') ? target : `http://${target}`
    onUrlChange(withProtocol)
    setInputUrl(withProtocol)
  }

  return (
    <div className="h-full flex flex-col bg-forge-surface">
      {/* URL bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-forge-border bg-forge-panel shrink-0">
        <button
          onClick={handleRefresh}
          disabled={!url}
          className="p-1 rounded hover:bg-forge-surface text-forge-text-dim hover:text-forge-text disabled:opacity-30 transition-colors"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </button>

        <div className="flex-1 flex items-center bg-forge-surface rounded border border-forge-border">
          <Globe className="w-3 h-3 ml-2 text-forge-text-dim" />
          <input
            type="text"
            value={inputUrl}
            onChange={e => setInputUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleNavigate()}
            placeholder="http://localhost:3000"
            className="flex-1 bg-transparent px-2 py-1 text-xs text-forge-text outline-none"
          />
        </div>

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-forge-surface text-forge-text-dim hover:text-forge-text transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Preview area */}
      <div className="flex-1 relative">
        {url ? (
          <iframe
            id="preview-iframe"
            src={url}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center max-w-xs">
              <div className="w-16 h-16 rounded-2xl bg-forge-accent/10 flex items-center justify-center mx-auto mb-4">
                <Play className="w-8 h-8 text-forge-accent" />
              </div>
              <h3 className="text-sm font-medium text-forge-text mb-2">No preview running</h3>
              <p className="text-xs text-forge-text-dim mb-4">
                Ask the AI to start the dev server, or enter a URL above to preview your project.
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => {
                    onUrlChange('http://localhost:3000')
                    setInputUrl('http://localhost:3000')
                  }}
                  className="w-full px-3 py-2 text-xs border border-forge-border rounded-lg hover:border-forge-accent/50 hover:bg-forge-accent/5 text-forge-text-dim hover:text-forge-text transition-all"
                >
                  localhost:3000
                </button>
                <button
                  onClick={() => {
                    onUrlChange('http://localhost:5173')
                    setInputUrl('http://localhost:5173')
                  }}
                  className="w-full px-3 py-2 text-xs border border-forge-border rounded-lg hover:border-forge-accent/50 hover:bg-forge-accent/5 text-forge-text-dim hover:text-forge-text transition-all"
                >
                  localhost:5173 (Vite)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
