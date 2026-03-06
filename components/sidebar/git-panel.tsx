'use client'

import { useState, useEffect } from 'react'
import { GitBranch, Upload, FolderInput, ExternalLink, Link, Loader2, Search } from 'lucide-react'

interface GitPanelProps {
  githubRepoUrl: string | null
  projectId: string | null
  onAction: (action: string) => void
  onRepoConnected?: (url: string) => void
}

interface GithubRepo {
  name: string
  full_name: string
  html_url: string
  updated_at: string
}

export function GitPanel({ githubRepoUrl, projectId, onAction, onRepoConnected }: GitPanelProps) {
  const [showConnect, setShowConnect] = useState(false)
  const [repoInput, setRepoInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  // Auto-loaded repos from GitHub
  const [repos, setRepos] = useState<GithubRepo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [repoSearch, setRepoSearch] = useState('')

  // Load repos when Connect panel opens
  useEffect(() => {
    if (!showConnect || repos.length > 0) return
    setLoadingRepos(true)
    fetch('/api/github/repos')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setRepos(data.sort((a: GithubRepo, b: GithubRepo) =>
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

  if (!githubRepoUrl) {
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
        className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-forge-accent text-white hover:bg-forge-accent/90 active:scale-[0.98] transition-all duration-150"
      >
        <Upload className="w-3.5 h-3.5" />
        Push to GitHub
      </button>
      <button
        onClick={() => onAction('import')}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-forge-border hover:bg-forge-surface active:scale-[0.98] transition-all duration-150"
      >
        <FolderInput className="w-3.5 h-3.5" />
        Pull Latest
      </button>
    </div>
  )
}
