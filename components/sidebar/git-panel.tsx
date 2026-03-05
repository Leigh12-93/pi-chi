'use client'

import { useState } from 'react'
import { GitBranch, Upload, FolderInput, ExternalLink, Link, Loader2 } from 'lucide-react'

interface GitPanelProps {
  githubRepoUrl: string | null
  projectId: string | null
  onAction: (action: string) => void
  onRepoConnected?: (url: string) => void
}

export function GitPanel({ githubRepoUrl, projectId, onAction, onRepoConnected }: GitPanelProps) {
  const [showConnect, setShowConnect] = useState(false)
  const [repoInput, setRepoInput] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')

  const handleConnect = async () => {
    if (!repoInput.trim() || !projectId) return
    setConnecting(true)
    setError('')

    // Normalize input: accept "owner/repo" or full URL
    let url = repoInput.trim()
    if (!url.startsWith('https://')) {
      url = `https://github.com/${url}`
    }

    try {
      const res = await fetch(`/api/projects/${projectId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ github_repo_url: url }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Failed to connect')
      } else {
        onRepoConnected?.(url)
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
          className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-forge-accent text-white hover:bg-forge-accent/90 transition-colors"
        >
          <GitBranch className="w-3.5 h-3.5" />
          Create Repository
        </button>
        <button
          onClick={() => setShowConnect(!showConnect)}
          className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-forge-border hover:bg-forge-surface transition-colors"
        >
          <Link className="w-3.5 h-3.5" />
          Connect Existing Repo
        </button>
        {showConnect && (
          <div className="space-y-2 animate-fade-in">
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
              onClick={handleConnect}
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
          className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-forge-border hover:bg-forge-surface transition-colors"
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
        className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-forge-accent text-white hover:bg-forge-accent/90 transition-colors"
      >
        <Upload className="w-3.5 h-3.5" />
        Push to GitHub
      </button>
      <button
        onClick={() => onAction('import')}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-forge-border hover:bg-forge-surface transition-colors"
      >
        <FolderInput className="w-3.5 h-3.5" />
        Pull Latest
      </button>
    </div>
  )
}
