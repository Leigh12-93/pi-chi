'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle2, Plug, Plus, Trash2, ExternalLink, X } from 'lucide-react'
import { MCP_SERVER_TEMPLATES } from '@/lib/mcp-registry'
import { toast } from 'sonner'

interface MCPServer {
  id: string
  name: string
  url: string
  status: 'connected' | 'disconnected' | 'error'
  tools?: string[]
  error?: string
}

interface MCPManagerProps {
  isOpen: boolean
  onClose: () => void
}

export function MCPManager({ isOpen, onClose }: MCPManagerProps) {
  const [servers, setServers] = useState<MCPServer[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [customUrl, setCustomUrl] = useState('')
  const [customName, setCustomName] = useState('')

  // Load servers on mount
  useEffect(() => {
    if (isOpen) {
      loadServers()
    }
  }, [isOpen])

  const loadServers = async () => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/mcp')
      if (!res.ok) throw new Error('Failed to load servers')
      const data = await res.json()
      setServers(data.servers || [])
    } catch (err) {
      toast.error('Failed to load MCP servers')
    } finally {
      setIsLoading(false)
    }
  }

  const connectServer = async (config: { name: string; url: string; token?: string }) => {
    try {
      setIsLoading(true)
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      toast.success(`Connected to ${config.name}`)
      await loadServers()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const disconnectServer = async (serverId: string) => {
    try {
      const res = await fetch('/api/mcp', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, action: 'disconnect' }),
      })
      if (!res.ok) throw new Error('Disconnect failed')

      toast.success('Server disconnected')
      await loadServers()
    } catch (err) {
      toast.error('Failed to disconnect')
    }
  }

  const removeServer = async (serverId: string) => {
    try {
      const res = await fetch('/api/mcp', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId }),
      })
      if (!res.ok) throw new Error('Remove failed')

      toast.success('Server removed')
      await loadServers()
    } catch (err) {
      toast.error('Failed to remove server')
    }
  }

  const connectCustomServer = async () => {
    if (!customUrl.trim() || !customName.trim()) {
      toast.error('Please enter both URL and name')
      return
    }

    await connectServer({
      name: customName.trim(),
      url: customUrl.trim(),
    })

    setCustomUrl('')
    setCustomName('')
  }

  const connectPresetServer = async (preset: typeof MCP_SERVER_TEMPLATES[0]) => {
    const token = preset.authType !== 'none' ? prompt(`Enter ${preset.name} API key or token:`) ?? undefined : undefined
    if (preset.authType !== 'none' && !token) return

    await connectServer({
      name: preset.name,
      url: preset.urlPlaceholder,
      token,
    })
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-4xl max-h-[80vh] bg-pi-bg border border-pi-border rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-pi-border shrink-0">
          <div className="flex items-center gap-2">
            <Plug className="w-4 h-4 text-pi-accent" />
            <h2 className="text-sm font-medium text-pi-text">MCP Server Manager</h2>
          </div>
          <button onClick={onClose} className="p-1 text-pi-text-dim hover:text-pi-text rounded transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Connected Servers */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-pi-text-dim font-medium mb-3">Connected Servers</p>
            {servers.length === 0 ? (
              <div className="text-center py-8">
                <Plug className="w-10 h-10 mx-auto mb-3 text-pi-text-dim/30" />
                <p className="text-xs text-pi-text-dim">No MCP servers connected</p>
                <p className="text-[10px] text-pi-text-dim/70 mt-1">Connect to external services below</p>
              </div>
            ) : (
              <div className="space-y-3">
                {servers.map((server) => (
                  <div key={server.id} className="p-4 rounded-xl bg-pi-surface border border-pi-border">
                    {/* Server header */}
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-pi-text">{server.name}</span>
                      <div className="flex items-center gap-2">
                        {server.status === 'connected' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-green-500/10 text-green-400">
                            <CheckCircle2 className="w-3 h-3" />
                            Connected
                          </span>
                        )}
                        {server.status === 'error' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-full bg-red-500/10 text-red-400">
                            <AlertCircle className="w-3 h-3" />
                            Error
                          </span>
                        )}
                        <button
                          onClick={() => disconnectServer(server.id)}
                          className="px-2.5 py-1 text-[10px] text-pi-text-dim border border-pi-border rounded-lg hover:text-pi-text hover:bg-pi-surface/80 transition-colors"
                        >
                          Disconnect
                        </button>
                        <button
                          onClick={() => removeServer(server.id)}
                          className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <p className="text-[10px] font-mono text-pi-text-dim truncate">{server.url}</p>

                    {/* Tool badges */}
                    {server.tools && server.tools.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-3">
                        {server.tools.slice(0, 5).map((tool) => (
                          <span key={tool} className="px-2 py-0.5 text-[10px] rounded-full bg-pi-accent/10 text-pi-accent border border-pi-accent/20">
                            {tool}
                          </span>
                        ))}
                        {server.tools.length > 5 && (
                          <span className="px-2 py-0.5 text-[10px] rounded-full bg-pi-accent/10 text-pi-accent border border-pi-accent/20">
                            +{server.tools.length - 5} more
                          </span>
                        )}
                      </div>
                    )}

                    {/* Error message */}
                    {server.error && (
                      <div className="mt-3 px-3 py-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
                        {server.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Custom Server Connection */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-pi-text-dim font-medium mb-3">Connect Custom Server</p>
            <div className="p-4 rounded-xl bg-pi-surface border border-pi-border space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label htmlFor="custom-name" className="text-xs text-pi-text-dim">Server Name</label>
                  <input
                    id="custom-name"
                    placeholder="My MCP Server"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-pi-bg border border-pi-border rounded-lg text-pi-text placeholder:text-pi-text-dim/50 focus:outline-none focus:border-pi-accent"
                  />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="custom-url" className="text-xs text-pi-text-dim">Server URL</label>
                  <input
                    id="custom-url"
                    placeholder="https://api.example.com/mcp"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-pi-bg border border-pi-border rounded-lg text-pi-text placeholder:text-pi-text-dim/50 focus:outline-none focus:border-pi-accent"
                  />
                </div>
              </div>
              <button
                onClick={connectCustomServer}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium bg-pi-accent text-white rounded-lg hover:bg-pi-accent-hover disabled:opacity-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Connect Server
              </button>
            </div>
          </div>

          {/* Preset Servers */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-pi-text-dim font-medium mb-3">Popular MCP Servers</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {MCP_SERVER_TEMPLATES.map((preset) => (
                <div
                  key={preset.name}
                  className="p-4 rounded-xl bg-pi-surface border border-pi-border hover:border-pi-accent/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-pi-text">{preset.name}</span>
                    <button
                      onClick={() => connectPresetServer(preset)}
                      disabled={isLoading}
                      className="p-1.5 text-pi-text-dim hover:text-pi-accent hover:bg-pi-accent/10 rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[10px] text-pi-text-dim mb-3">{preset.description}</p>
                  <div className="flex flex-wrap gap-1">
                    {preset.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 text-[10px] rounded-full bg-pi-accent/10 text-pi-accent">
                        {tag}
                      </span>
                    ))}
                  </div>
                  {preset.docsUrl && (
                    <a
                      href={preset.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-pi-accent hover:underline mt-2"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Documentation
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
