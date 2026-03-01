'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertCircle, CheckCircle2, Plug, Plus, Trash2, ExternalLink } from 'lucide-react'
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plug className="w-5 h-5" />
            MCP Server Manager
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-6">
          {/* Connected Servers */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Connected Servers</h3>
            {servers.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Plug className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No MCP servers connected</p>
                <p className="text-sm">Connect to external services below</p>
              </div>
            ) : (
              <div className="space-y-3">
                {servers.map((server) => (
                  <Card key={server.id} className="relative">
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{server.name}</CardTitle>
                        <div className="flex items-center gap-2">
                          {server.status === 'connected' && (
                            <Badge variant="secondary" className="bg-green-100 text-green-700">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              Connected
                            </Badge>
                          )}
                          {server.status === 'error' && (
                            <Badge variant="destructive">
                              <AlertCircle className="w-3 h-3 mr-1" />
                              Error
                            </Badge>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => disconnectServer(server.id)}
                          >
                            Disconnect
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => removeServer(server.id)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <CardDescription className="text-xs font-mono truncate">
                        {server.url}
                      </CardDescription>
                    </CardHeader>
                    {server.tools && server.tools.length > 0 && (
                      <CardContent className="pt-0">
                        <div className="flex flex-wrap gap-1">
                          {server.tools.slice(0, 5).map((tool) => (
                            <Badge key={tool} variant="outline" className="text-xs">
                              {tool}
                            </Badge>
                          ))}
                          {server.tools.length > 5 && (
                            <Badge variant="outline" className="text-xs">
                              +{server.tools.length - 5} more
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    )}
                    {server.error && (
                      <CardContent className="pt-0">
                        <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                          {server.error}
                        </div>
                      </CardContent>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Custom Server Connection */}
          <div>
            <h3 className="text-lg font-semibold mb-3">Connect Custom Server</h3>
            <Card>
              <CardContent className="pt-6">
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="custom-name">Server Name</Label>
                      <Input
                        id="custom-name"
                        placeholder="My MCP Server"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-url">Server URL</Label>
                      <Input
                        id="custom-url"
                        placeholder="https://api.example.com/mcp"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                      />
                    </div>
                  </div>
                  <Button onClick={connectCustomServer} disabled={isLoading}>
                    <Plus className="w-4 h-4 mr-2" />
                    Connect Server
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preset Servers */}
          <div>
            <div>
              <h3 className="text-lg font-semibold mb-3">Popular MCP Servers</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                {MCP_SERVER_TEMPLATES.map((preset) => (
                  <Card key={preset.name} className="cursor-pointer hover:bg-muted/50 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium">{preset.name}</CardTitle>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => connectPresetServer(preset)}
                          disabled={isLoading}
                        >
                          <Plus className="w-3 h-3" />
                        </Button>
                      </div>
                      <CardDescription className="text-xs">{preset.description}</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex flex-wrap gap-1">
                        {preset.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                      {preset.docsUrl && (
                        <a
                          href={preset.docsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-xs text-blue-600 hover:underline mt-2"
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Documentation
                        </a>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}