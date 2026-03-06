'use client'

import { useState, useEffect } from 'react'
import { Rocket, Download, Link, ExternalLink, Loader2, Check, LogIn, AlertCircle, Settings } from 'lucide-react'

interface VercelProject {
  id: string
  name: string
  url: string | null
}

interface DeployPanelProps {
  onAction: (action: string) => void
  projectId: string | null
  vercelProjectId?: string | null
  onVercelConnected?: (id: string) => void
  onOpenSettings?: () => void
}

export function DeployPanel({ onAction, projectId, vercelProjectId, onVercelConnected, onOpenSettings }: DeployPanelProps) {
  const [showConnect, setShowConnect] = useState(false)
  const [vercelProjects, setVercelProjects] = useState<VercelProject[]>([])
  const [loadingProjects, setLoadingProjects] = useState(false)
  const [selectedProject, setSelectedProject] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [needsAuth, setNeedsAuth] = useState(false)
  const [hasOAuth, setHasOAuth] = useState(false)

  // Check if OAuth is available on mount
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setHasOAuth(!!data?.oauthProviders?.vercel)
        setNeedsAuth(!data?.hasVercelToken)
      })
      .catch(() => {})
  }, [])

  // Fetch Vercel projects when connect section is opened
  useEffect(() => {
    if (!showConnect) return
    setLoadingProjects(true)
    setNeedsAuth(false)
    setError('')
    fetch('/api/vercel/projects')
      .then(async r => {
        const data = await r.json()
        if (!r.ok) {
          if (data.error === 'no_token' || data.error === 'token_invalid') {
            setNeedsAuth(true)
          } else {
            setError(data.message || data.error || 'Failed to load projects')
          }
          return
        }
        if (Array.isArray(data)) setVercelProjects(data)
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoadingProjects(false))
  }, [showConnect])

  const handleConnect = async () => {
    if (!selectedProject || !projectId) return
    setConnecting(true)
    setError('')
    try {
      const res = await fetch(`/api/projects/${projectId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vercel_project_id: selectedProject }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to connect')
      } else {
        onVercelConnected?.(selectedProject)
        setShowConnect(false)
      }
    } catch {
      setError('Network error')
    } finally {
      setConnecting(false)
    }
  }

  const connectedProject = vercelProjectId
    ? vercelProjects.find(p => p.id === vercelProjectId)
    : null
  const connectedName = connectedProject?.name || vercelProjectId

  return (
    <div className="p-3 space-y-3">
      <button
        onClick={() => onAction('deploy')}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-forge-accent text-white hover:bg-forge-accent/90 active:scale-[0.98] transition-all duration-150"
      >
        <Rocket className="w-3.5 h-3.5" />
        Deploy to Vercel
      </button>
      <button
        onClick={() => onAction('download')}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-forge-border hover:bg-forge-surface active:scale-[0.98] transition-all duration-150"
      >
        <Download className="w-3.5 h-3.5" />
        Download ZIP
      </button>

      {/* Vercel connection status */}
      <div className="border-t border-forge-border pt-3">
        <p className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium mb-2">Vercel Project</p>
        {vercelProjectId ? (
          <a
            href={connectedProject?.url || `https://vercel.com/~/projects/${vercelProjectId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-2 py-1.5 bg-forge-surface rounded-md hover:bg-forge-surface/80 transition-colors"
          >
            <Check className="w-3 h-3 text-forge-success shrink-0" />
            <span className="text-xs text-forge-text truncate">{connectedName}</span>
            <ExternalLink className="w-3 h-3 text-forge-text-dim shrink-0 ml-auto" />
          </a>
        ) : (
          <>
            <button
              onClick={() => setShowConnect(!showConnect)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-forge-border hover:bg-forge-surface active:scale-[0.98] transition-all duration-150"
            >
              <Link className="w-3.5 h-3.5" />
              Connect Vercel Project
            </button>
            {showConnect && (
              <div className="mt-2 space-y-2 animate-fade-in">
                {loadingProjects ? (
                  <div className="flex items-center gap-2 py-2 text-xs text-forge-text-dim">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Loading projects...
                  </div>
                ) : needsAuth ? (
                  /* No Vercel token — show login options */
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 p-2 rounded-md bg-forge-surface text-xs text-forge-text-dim">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
                      <span>Connect your Vercel account to see your projects.</span>
                    </div>
                    {hasOAuth ? (
                      <a
                        href="/api/auth/vercel"
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg bg-white text-black hover:bg-gray-100 transition-colors font-medium"
                      >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 76 65" fill="currentColor">
                          <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
                        </svg>
                        Login with Vercel
                      </a>
                    ) : (
                      <button
                        onClick={() => onOpenSettings?.()}
                        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg border border-forge-border hover:bg-forge-surface transition-colors"
                      >
                        <Settings className="w-3.5 h-3.5" />
                        Add Vercel Token in Settings
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                    <select
                      value={selectedProject}
                      onChange={e => setSelectedProject(e.target.value)}
                      className="w-full px-2 py-1.5 text-xs bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
                    >
                      <option value="">Select a project...</option>
                      {vercelProjects.map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleConnect}
                      disabled={!selectedProject || connecting}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-forge-accent text-white hover:bg-forge-accent/90 disabled:opacity-40 transition-colors"
                    >
                      {connecting && <Loader2 className="w-3 h-3 animate-spin" />}
                      Connect
                    </button>
                  </>
                )}
                {error && <p className="text-[10px] text-red-400">{error}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
