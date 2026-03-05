'use client'

import { GitBranch, Upload, FolderInput, ExternalLink } from 'lucide-react'

interface GitPanelProps {
  githubRepoUrl: string | null
  onAction: (action: string) => void
}

export function GitPanel({ githubRepoUrl, onAction }: GitPanelProps) {
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
