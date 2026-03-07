'use client'

import { useState, useEffect } from 'react'
import { GitBranch, Upload, FolderInput, ExternalLink, Link, Loader2, Search, Unlink, Download } from 'lucide-react'
import { toast } from 'sonner'

interface GitPanelProps {
  githubRepoUrl: string | null
  projectId: string | null
  onAction: (action: string) => void
  onRepoConnected?: (url: string) => void
  onRepoDisconnected?: () => void
  files?: Record<string, string>
  onBulkFileUpdate?: (files: Record<string, string>, opts?: { replace?: boolean }) => void
  modifiedFiles?: Set<string>
}

interface GithubRepo {
  name: string
  full_name: string
  html_url: string
  updated_at: string
}

export function GitPanel({ githubRepoUrl, projectId, onAction, onRepoConnected, onRepoDisconnected, files, onBulkFileUpdate, modifiedFiles }: GitPanelProps) {
  const [showConnect, setShowConnect] = useState(false)
  const [repoInput, setRepoInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [pulling, setPulling] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // Auto-loaded repos from GitHub
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')

  // Load repos when Connect panel opens
  useEffect(() => {
    if (!showConnect || repos.length > 0) return
    setLoadingRepos(true)
    fetch('/api/github/repos?per_page=100')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : data.repos || []
        if (list.length > 0) {
          setRepos(list.sort((a: GithubRepo, b: GithubRepo) =>
            new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          ))
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRepos(false))
  }, [showConnect, repos.length])

  const filteredRepos = repos.filter(r =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  )

  const handleConnect = async (url?: string) => {
    const repoUrl = url || repoInput.trim()
    if (!repoUrl || !projectId) return
    setConnecting(true)
    setError('')

    let normalized = repoUrl
    if (!normalized.startsWith('https://')) {
      normalized = `https://github.com/${normalized}`
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_repo_url: normalized }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to connect')
      } else {
        onRepoConnected?.(normalized)
        setShowConnect(false)
        setRepoInput('')
      }
    } catch {
      setError('Network error')
    } finally {
      setConnecting(false)
    }
  }

  const handlePullLatest = async () => {
    if (!githubRepoUrl || !onBulkFileUpdate) return
    const parts = githubRepoUrl.replace('https://github.com/', '').split('/')
    const owner = parts[0]
    const repo = parts[1]
    if (!owner || !repo) return

    setPulling(true)
    try {
      const res = await fetch('/api/github/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo }),
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error('Pull failed', { description: data.error || `HTTP ${res.status}` })
        return
      }
      const data = await res.json()
      if (data.files && Object.keys(data.files).length > 0) {
        onBulkFileUpdate({ ...(files || {}), ...data.files })
        toast.success(`Pulled ${data.fileCount} files`, {
          description: `From ${owner}/${repo}${data.branch ? ` (${data.branch})` : ''}`,
        })
      } else {
        toast.info('No files found in repository')
      }
    } catch {
      toast.error('Pull failed', { description: 'Network error' })
    } finally {
      setPulling(false)
    }
  }

  const handleDisconnect = async () => {
    if (!projectId) return
    setDisconnecting(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/connect`, {
        method: 'DELETE',
      })
      if (res.ok) {
        onRepoDisconnected?.()
        toast.success('Repository disconnected')
      } else {
        toast.error('Failed to disconnect')
      }
    } catch {
      toast.error('Failed to disconnect')
    } finally {
      setDisconnecting(false)
    }
  }

  if (!githubRepoUrl) {
    const changedCount = modifiedFiles?.size || 0

    return (
      <div className="p-3 space-y-3">
        <p className="text-xs text-forge-text-dim">No repository connected</p>
        <button
          onClick={() => onAction('create-repo')}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-forge-accent text-white hover:bg-forge-accent/90 active:scale-[0.98] transition-all duration-150"
        >
          <GitBranch className="w-3.5 h-3.5" />
          Create Repository
        </button>
        <button
          onClick={() => setShowConnect(!showConnect)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-forge-border hover:bg-forge-surface active:scale-[0.98] transition-all duration-150"
        >
          <Link className="w-3.5 h-3.5" />
          Connect Existing Repo
        </button>
        {showConnect && (
          <div className="space-y-2 animate-fade-in">
            {/* Repo search/select */}
            {loadingRepos ? (
              <div className="flex items-center gap-2 py-3 justify-center">
                <Loader2 className="w-3.5 h-3.5 animate-spin text-forge-text-dim" />
                <span className="text-[10px] text-forge-text-dim">Loading repositories...</span>
              </div>
            ) : repos.length > 0 ? (
              <>
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-forge-text-dim" />
                  <input
                    type="text"
                    placeholder="Search your repos..."
                    value={repoSearch}
                    onChange={e => setRepoSearch(e.target.value)}
                    className="w-full pl-7 pr-2 py-1.5 text-xs bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
                  />
                </div>
                <div className="max-h-40 overflow-y-auto space-y-0.5 rounded-md border border-forge-border bg-forge-bg">
                  {filteredRepos.slice(0, 20).map(repo => (
                    <button
                      key={repo.full_name}
                      onClick={() => handleConnect(repo.html_url)}
                      disabled={connecting}
                      className="group/repo w-full flex items-center gap-2 px-2 py-1.5 text-xs text-left hover:bg-forge-surface border-l-2 border-l-transparent hover:border-l-forge-accent active:scale-[0.98] transition-all duration-150"
                    >
                      <GitBranch className="w-3 h-3 text-forge-text-dim group-hover/repo:text-forge-accent shrink-0 transition-colors" />
                      <span className="truncate text-forge-text font-mono">{repo.full_name}</span>
                    </button>
                  ))}
                  {filteredRepos.length === 0 && (
                    <p className="text-[10px] text-forge-text-dim text-center py-2">No matching repos</p>
                  )}
                </div>
              </>
            ) : null}

            {/* Manual input fallback */}
            <div className="flex items-center gap-2 px-1">
              <span className="flex-1 h-px bg-forge-border" />
              <span className="text-[9px] text-forge-text-dim">or enter manually</span>
              <span className="flex-1 h-px bg-forge-border" />
            </div>
            <input
              type="text"
              placeholder="owner/repo or GitHub URL"
              value={repoInput}
              onChange={e => setRepoInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleConnect()}
              className="w-full px-2 py-1.5 text-xs font-mono bg-forge-bg border border-forge-border rounded-md focus:outline-none focus:border-forge-accent"
            />
            {error && <p className="text-[10px] text-red-400">{error}</p>}
            <button
              onClick={() => handleConnect()}
              disabled={!repoInput.trim() || connecting}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-forge-accent text-white hover:bg-forge-accent/90 disabled:opacity-40 transition-colors"
            >
              {connecting && <Loader2 className="w-3 h-3 animate-spin" />}
              Connect
            </button>
          </div>
        )}
        <button
          onClick={() => onAction('push')}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-forge-border hover:bg-forge-surface active:scale-[0.98] transition-all duration-150"
        >
          <Upload className="w-3.5 h-3.5" />
          Push to GitHub
          {changedCount > 0 && (
            <span className="ml-auto px-1.5 py-0.5 text-[10px] font-medium bg-forge-accent/15 text-forge-accent rounded-full">
              {changedCount}
            </span>
          )}
        </button>
        <button
          onClick={() => onAction('import')}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-forge-border hover:bg-forge-surface active:scale-[0.98] transition-all duration-150"
        >
          <FolderInput className="w-3.5 h-3.5" />
          Import from GitHub
        </button>
      </div>
    )
  }

  const repoName = githubRepoUrl.replace('https://github.com/', '')

  return (
    <div className="p-3 space-y-3">
      <a
        href={githubRepoUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-xs text-forge-accent hover:underline"
      >
        <GitBranch className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">{repoName}</span>
        <ExternalLink className="w-3 h-3 shrink-0" />
      </a>
      <button
        onClick={() => onAction('push')}
        className="w-full flex items-center gap-2 px-3 py-3 sm:py-2 text-sm sm:text-xs rounded-lg bg-forge-accent text-white hover:bg-forge-accent/90 active:scale-[0.98] transition-all duration-150 min-h-[44px]"
      >
        <Upload className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
        Push to GitHub
        {(modifiedFiles?.size || 0) > 0 && (
          <span className="ml-auto px-1.5 py-0.5 text-[10px] font-medium bg-white/20 text-white rounded-full">
            {modifiedFiles!.size}
          </span>
        )}
      </button>
      <button
        onClick={handlePullLatest}
        disabled={pulling}
        className="w-full flex items-center gap-2 px-3 py-3 sm:py-2 text-sm sm:text-xs rounded-lg border border-forge-border hover:bg-forge-surface active:scale-[0.98] transition-all duration-150 disabled:opacity-50 min-h-[44px]"
      >
        {pulling ? <Loader2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 animate-spin" /> : <Download className="w-4 h-4 sm:w-3.5 sm:h-3.5" />}
        {pulling ? 'Pulling...' : 'Pull Latest'}
      </button>
      <button
        onClick={handleDisconnect}
        disabled={disconnecting}
        className="w-full flex items-center gap-2 px-3 py-3 sm:py-2 text-sm sm:text-xs rounded-lg border border-forge-border text-forge-text-dim hover:text-red-400 hover:border-red-400/30 hover:bg-red-500/5 active:scale-[0.98] transition-all duration-150 disabled:opacity-50 min-h-[44px]"
      >
        {disconnecting ? <Loader2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 animate-spin" /> : <Unlink className="w-4 h-4 sm:w-3.5 sm:h-3.5" />}
        Disconnect
      </button>
    </div>
  )
}
