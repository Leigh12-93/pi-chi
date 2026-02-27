'use client'

import { useState, useEffect } from 'react'
import {
  Hammer, Sparkles, FolderOpen, Trash2,
  Github, Clock, Globe, ExternalLink, Loader2,
  Lock, Star, GitBranch, Download,
} from 'lucide-react'

interface SavedProject {
  id: string
  name: string
  description: string
  framework: string
  github_repo_url: string | null
  vercel_url: string | null
  updated_at: string
  created_at: string
}

interface GitHubRepo {
  id: number
  name: string
  full_name: string
  description: string
  language: string
  private: boolean
  default_branch: string
  updated_at: string
  html_url: string
  stargazers_count: number
}

interface ProjectPickerProps {
  onSelect: (name: string, id?: string, initialFiles?: Record<string, string>) => void
  savedProjects: SavedProject[]
  loadingProjects: boolean
  onDeleteProject: (id: string) => void
  isLoggedIn: boolean
}

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

const FRAMEWORK_COLORS: Record<string, string> = {
  nextjs: 'bg-blue-100 text-blue-700',
  'vite-react': 'bg-purple-100 text-purple-700',
  static: 'bg-gray-100 text-gray-600',
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: 'bg-blue-100 text-blue-700',
  JavaScript: 'bg-amber-100 text-amber-700',
  Python: 'bg-green-100 text-green-700',
  Kotlin: 'bg-purple-100 text-purple-700',
  Java: 'bg-orange-100 text-orange-700',
  HTML: 'bg-red-100 text-red-700',
  CSS: 'bg-pink-100 text-pink-700',
  Rust: 'bg-amber-100 text-amber-700',
  Go: 'bg-cyan-100 text-cyan-700',
}

const QUICK_STARTS = [
  { label: 'Landing Page', query: 'Build a modern landing page with hero section, features grid, testimonials with avatars, pricing table, and footer. Use a cohesive color palette with gradients and animations. Make it look like a real SaaS product.' },
  { label: 'Dashboard', query: 'Build an admin dashboard with sidebar navigation, stats cards with sparklines, a chart area, recent activity feed, and a data table with sorting. Dark theme, professional look.' },
  { label: 'Portfolio', query: 'Create a portfolio site with animated hero, project showcase with hover effects, about section with skills, timeline, and a contact form. Minimal, elegant design.' },
  { label: 'E-commerce', query: 'Build an e-commerce product page with image gallery, size/color selector, add to cart, reviews section, and related products. Clean, modern design like Apple Store.' },
]

export function ProjectPicker({ onSelect, savedProjects, loadingProjects, onDeleteProject, isLoggedIn }: ProjectPickerProps) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [importingRepo, setImportingRepo] = useState<string | null>(null)
  const [tab, setTab] = useState<'projects' | 'github'>('projects')

  // Load GitHub repos when logged in
  useEffect(() => {
    if (isLoggedIn) {
      setLoadingRepos(true)
      fetch('/api/github/repos')
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) setGithubRepos(data)
        })
        .catch(() => {})
        .finally(() => setLoadingRepos(false))
    }
  }, [isLoggedIn])

  const handleCreate = () => {
    const projectName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || `project-${Date.now()}`
    setCreating(true)
    onSelect(projectName)
  }

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation()
    if (!confirm('Delete this project? This cannot be undone.')) return
    setDeletingId(id)
    await onDeleteProject(id)
    setDeletingId(null)
  }

  const handleImportRepo = async (repo: GitHubRepo) => {
    setImportingRepo(repo.full_name)
    try {
      const res = await fetch('/api/github/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          owner: repo.full_name.split('/')[0],
          repo: repo.name,
          branch: repo.default_branch,
        }),
      })

      if (!res.ok) throw new Error('Import failed')

      const data = await res.json()
      onSelect(repo.name, undefined, data.files)
    } catch (err) {
      console.error('Failed to import repo:', err)
      alert('Failed to import repository. It may be too large or contain no text files.')
    } finally {
      setImportingRepo(null)
    }
  }

  return (
    <div className="min-h-screen bg-forge-bg flex items-center justify-center p-8">
      <div className="max-w-3xl w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-forge-accent/10 mb-4">
            <Hammer className="w-8 h-8 text-forge-accent" />
          </div>
          <h1 className="text-3xl font-bold text-forge-text mb-2">Forge</h1>
          <p className="text-forge-text-dim text-sm">AI-powered website builder with superpowers</p>
        </div>

        {/* Auth prompt */}
        {!isLoggedIn && (
          <div className="bg-forge-panel border border-forge-border rounded-xl p-4 mb-6 text-center">
            <p className="text-sm text-forge-text-dim mb-3">
              Sign in with GitHub to save projects and deploy to your account
            </p>
            <a
              href="/api/auth/login"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors"
            >
              <Github className="w-4 h-4" />
              Sign in with GitHub
            </a>
          </div>
        )}

        {/* New project */}
        <div className="bg-forge-panel border border-forge-border rounded-xl p-6 mb-6">
          <label className="block text-xs font-medium text-forge-text-dim mb-2">New Project</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="my-awesome-app"
              className="flex-1 bg-forge-surface border border-forge-border rounded-lg px-4 py-2.5 text-sm text-forge-text placeholder:text-forge-text-dim/50 outline-none focus:border-forge-accent/50 transition-colors"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center gap-2 px-5 py-2.5 bg-forge-accent hover:bg-forge-accent-hover text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Create
            </button>
          </div>

          {/* Quick starts */}
          <div className="flex flex-wrap gap-2 mt-3">
            {QUICK_STARTS.map(qs => (
              <button
                key={qs.label}
                onClick={() => {
                  const pName = qs.label.toLowerCase().replace(/\s+/g, '-')
                  onSelect(pName)
                }}
                className="px-2.5 py-1 text-[11px] rounded-md border border-forge-border text-forge-text-dim hover:text-forge-text hover:border-forge-accent/50 hover:bg-forge-accent/5 transition-all"
              >
                {qs.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs: Saved Projects / GitHub Repos */}
        {isLoggedIn && (
          <div>
            <div className="flex items-center gap-1 mb-4 border-b border-forge-border">
              <button
                onClick={() => setTab('projects')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === 'projects'
                    ? 'border-forge-accent text-forge-accent'
                    : 'border-transparent text-forge-text-dim hover:text-forge-text'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Saved Projects
                {savedProjects.length > 0 && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-forge-surface">{savedProjects.length}</span>
                )}
              </button>
              <button
                onClick={() => setTab('github')}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  tab === 'github'
                    ? 'border-forge-accent text-forge-accent'
                    : 'border-transparent text-forge-text-dim hover:text-forge-text'
                }`}
              >
                <Github className="w-3.5 h-3.5" />
                GitHub Repos
                {githubRepos.length > 0 && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-forge-surface">{githubRepos.length}</span>
                )}
              </button>
              {(loadingProjects || loadingRepos) && (
                <Loader2 className="w-3.5 h-3.5 text-forge-text-dim animate-spin ml-auto" />
              )}
            </div>

            {/* Saved Projects Tab */}
            {tab === 'projects' && (
              <>
                {savedProjects.length === 0 && !loadingProjects ? (
                  <div className="text-center py-8 text-forge-text-dim text-sm border border-dashed border-forge-border rounded-xl">
                    No saved projects yet. Create one above or import from GitHub.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {savedProjects.map(project => (
                      <button
                        key={project.id}
                        onClick={() => onSelect(project.name, project.id)}
                        className="group relative bg-forge-panel border border-forge-border rounded-xl p-4 text-left hover:border-forge-accent/50 hover:bg-forge-accent/5 transition-all"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-sm font-medium text-forge-text group-hover:text-forge-accent transition-colors truncate pr-2">
                            {project.name}
                          </h3>
                          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${FRAMEWORK_COLORS[project.framework] || FRAMEWORK_COLORS.static}`}>
                            {project.framework}
                          </span>
                        </div>

                        {project.description && (
                          <p className="text-xs text-forge-text-dim truncate mb-2">{project.description}</p>
                        )}

                        <div className="flex items-center gap-3 text-[10px] text-forge-text-dim">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatRelative(project.updated_at)}
                          </span>

                          {project.vercel_url && (
                            <a href={project.vercel_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 hover:text-forge-accent">
                              <Globe className="w-3 h-3" /> Live <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}

                          {project.github_repo_url && (
                            <a href={project.github_repo_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 hover:text-forge-accent">
                              <Github className="w-3 h-3" /> Repo <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>

                        <button
                          onClick={e => handleDelete(e, project.id)}
                          disabled={deletingId === project.id}
                          className="absolute top-3 right-3 p-1 rounded opacity-0 group-hover:opacity-100 text-forge-text-dim hover:text-forge-danger hover:bg-forge-danger/10 transition-all"
                          title="Delete project"
                        >
                          {deletingId === project.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* GitHub Repos Tab */}
            {tab === 'github' && (
              <>
                {githubRepos.length === 0 && !loadingRepos ? (
                  <div className="text-center py-8 text-forge-text-dim text-sm border border-dashed border-forge-border rounded-xl">
                    No repositories found.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {githubRepos.map(repo => (
                      <button
                        key={repo.id}
                        onClick={() => handleImportRepo(repo)}
                        disabled={importingRepo === repo.full_name}
                        className="group relative bg-forge-panel border border-forge-border rounded-xl p-4 text-left hover:border-forge-accent/50 hover:bg-forge-accent/5 transition-all disabled:opacity-60"
                      >
                        <div className="flex items-start justify-between mb-1.5">
                          <h3 className="text-sm font-medium text-forge-text group-hover:text-forge-accent transition-colors truncate pr-2 flex items-center gap-1.5">
                            {repo.private && <Lock className="w-3 h-3 text-forge-text-dim shrink-0" />}
                            {repo.name}
                          </h3>
                          {repo.language && (
                            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded shrink-0 ${LANG_COLORS[repo.language] || 'bg-gray-100 text-gray-600'}`}>
                              {repo.language}
                            </span>
                          )}
                        </div>

                        {repo.description && (
                          <p className="text-xs text-forge-text-dim truncate mb-2">{repo.description}</p>
                        )}

                        <div className="flex items-center gap-3 text-[10px] text-forge-text-dim">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatRelative(repo.updated_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <GitBranch className="w-3 h-3" />
                            {repo.default_branch}
                          </span>
                          {repo.stargazers_count > 0 && (
                            <span className="flex items-center gap-1">
                              <Star className="w-3 h-3" />
                              {repo.stargazers_count}
                            </span>
                          )}
                        </div>

                        {/* Import indicator */}
                        {importingRepo === repo.full_name ? (
                          <div className="absolute inset-0 flex items-center justify-center bg-forge-panel/90 rounded-xl">
                            <div className="flex items-center gap-2 text-xs text-forge-accent">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Importing...
                            </div>
                          </div>
                        ) : (
                          <div className="absolute top-3 right-3 p-1 rounded opacity-0 group-hover:opacity-100 text-forge-text-dim hover:text-forge-accent transition-all">
                            <Download className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-[10px] text-forge-text-dim mt-8">
          Powered by Claude Sonnet 4 &middot; Self-improving AI &middot; Full database + GitHub + Vercel access
        </p>
      </div>
    </div>
  )
}
