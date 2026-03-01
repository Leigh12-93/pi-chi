'use client'

import { useState, useEffect } from 'react'
import {
  Hammer, Sparkles, FolderOpen, Trash2,
  Github, Clock, Globe, ExternalLink, Loader2,
  Lock, Star, GitBranch, Download, GitFork, Archive, Search, X,
} from 'lucide-react'
import { toast } from 'sonner'

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
  fork: boolean
  archived: boolean
  default_branch: string
  updated_at: string
  html_url: string
  stargazers_count: number
  size: number
}

interface ProjectPickerProps {
  onSelect: (name: string, id?: string, initialFiles?: Record<string, string>, query?: string) => void
  savedProjects: SavedProject[]
  loadingProjects: boolean
  onDeleteProject: (id: string) => void
  deletingProjectId?: string | null
  isLoggedIn: boolean
  loadError?: boolean
  onRetryLoad?: () => void
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
  nextjs: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  'vite-react': 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  static: 'bg-forge-surface text-forge-text-dim',
}

const LANG_COLORS: Record<string, string> = {
  TypeScript: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  JavaScript: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
  Python: 'bg-green-500/15 text-green-600 dark:text-green-400',
  Kotlin: 'bg-purple-500/15 text-purple-600 dark:text-purple-400',
  Java: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  HTML: 'bg-red-500/15 text-red-600 dark:text-red-400',
  CSS: 'bg-pink-500/15 text-pink-600 dark:text-pink-400',
  Rust: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  Go: 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400',
}

const QUICK_STARTS = [
  { label: 'Landing Page', query: 'Build a modern landing page with hero section, features grid, testimonials with avatars, pricing table, and footer. Use a cohesive color palette with gradients and animations. Make it look like a real SaaS product.' },
  { label: 'Dashboard', query: 'Build an admin dashboard with sidebar navigation, stats cards with sparklines, a chart area, recent activity feed, and a data table with sorting. Dark theme, professional look.' },
  { label: 'Portfolio', query: 'Create a portfolio site with animated hero, project showcase with hover effects, about section with skills, timeline, and a contact form. Minimal, elegant design.' },
  { label: 'E-commerce', query: 'Build an e-commerce product page with image gallery, size/color selector, add to cart, reviews section, and related products. Clean, modern design like Apple Store.' },
]

export function ProjectPicker({ onSelect, savedProjects, loadingProjects, onDeleteProject, deletingProjectId, isLoggedIn, loadError, onRetryLoad }: ProjectPickerProps) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const deletingId = deletingProjectId ?? null
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [importingRepo, setImportingRepo] = useState<string | null>(null)
  const [tab, setTab] = useState<'projects' | 'github'>('projects')
  const [searchQuery, setSearchQuery] = useState('')

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
    await onDeleteProject(id)
  }

  const handleImportRepo = async (repo: GitHubRepo) => {
    if (repo.archived) {
      toast.error('Cannot import archived repository')
      return
    }
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

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Import failed (HTTP ${res.status})`)
      }

      const data = await res.json()
      if (!data.files || Object.keys(data.files).length === 0) {
        toast.error('No importable files found', { description: 'Repository may only contain binary files or be empty.' })
        return
      }
      toast.success(`Imported ${data.fileCount} files`, {
        description: `From ${repo.full_name} (${data.branch || repo.default_branch})`,
      })
      onSelect(repo.name, undefined, data.files)
    } catch (err) {
      console.error('Failed to import repo:', err)
      toast.error('Import failed', {
        description: err instanceof Error ? err.message : 'Repository may be too large or inaccessible.',
      })
    } finally {
      setImportingRepo(null)
    }
  }

  return (
    <div className="min-h-screen bg-forge-bg flex items-center justify-center p-4 sm:p-8">
      <div className="max-w-3xl w-full">
        {/* Logo */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-forge-accent/20 to-purple-500/20 mb-4 sm:mb-5 shadow-sm animate-breathe">
            <Hammer className="w-7 h-7 sm:w-8 sm:h-8 text-forge-accent" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold mb-2 tracking-tight">
            <span className="bg-gradient-to-r from-forge-accent to-purple-500 bg-clip-text text-transparent">Forge</span>
          </h1>
          <p className="text-forge-text-dim text-sm text-pretty">AI-powered website builder with superpowers</p>
        </div>

        {/* Auth prompt */}
        {!isLoggedIn && (
          <div className="bg-forge-panel border border-forge-border rounded-xl p-4 mb-6 text-center">
            <p className="text-sm text-forge-text-dim mb-3">
              Sign in with GitHub to save projects and deploy to your account
            </p>
            <a
              href="/api/auth/login"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-forge-text text-forge-bg text-sm font-medium hover:bg-forge-text/90 transition-colors"
            >
              <Github className="w-4 h-4" />
              Sign in with GitHub
            </a>
          </div>
        )}

        {/* New project */}
        <div className="bg-forge-panel border border-forge-border rounded-2xl p-4 sm:p-6 mb-6">
          <label className="block text-xs font-medium text-forge-text-dim mb-2.5">New Project</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="my-awesome-app"
              className="flex-1 bg-forge-surface border border-forge-border rounded-xl px-4 py-3 sm:py-2.5 text-sm text-forge-text placeholder:text-forge-text-dim/50 outline-none focus:border-forge-accent/50 focus:ring-2 focus:ring-forge-accent/10 transition-all"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={creating}
              className="flex items-center justify-center gap-2 px-5 py-3 sm:py-2.5 bg-forge-accent hover:bg-forge-accent-hover text-white text-sm font-medium rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm hover:shadow-md hover:shadow-forge-accent/25"
            >
              <Sparkles className="w-4 h-4" />
              Create
            </button>
          </div>

          {/* Quick starts */}
          <div className="flex flex-wrap gap-2 mt-4">
            <span className="text-[10px] text-forge-text-dim/60 self-center mr-1 hidden sm:inline">Quick start:</span>
            {QUICK_STARTS.map((qs, i) => (
              <button
                key={qs.label}
                onClick={() => {
                  const pName = qs.label.toLowerCase().replace(/\s+/g, '-')
                  onSelect(pName, undefined, undefined, qs.query)
                }}
                className={`px-4 py-2.5 sm:px-3 sm:py-1.5 text-xs sm:text-[11px] rounded-lg border border-forge-border text-forge-text-dim hover:text-forge-text hover:border-forge-accent/50 hover:bg-forge-accent/5 hover:shadow-sm transition-all animate-fade-in-up stagger-${i + 1}`}
              >
                {qs.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tabs: Saved Projects / GitHub Repos */}
        {isLoggedIn && (
          <div>
            <div className="flex items-center gap-1 mb-4 border-b border-forge-border relative">
              <button
                onClick={() => setTab('projects')}
                className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                  tab === 'projects'
                    ? 'text-forge-accent'
                    : 'text-forge-text-dim hover:text-forge-text'
                }`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                Saved Projects
                {savedProjects.length > 0 && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-forge-surface">{savedProjects.length}</span>
                )}
                {tab === 'projects' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-forge-accent rounded-full transition-all" />
                )}
              </button>
              <button
                onClick={() => setTab('github')}
                className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                  tab === 'github'
                    ? 'text-forge-accent'
                    : 'text-forge-text-dim hover:text-forge-text'
                }`}
              >
                <Github className="w-3.5 h-3.5" />
                GitHub Repos
                {githubRepos.length > 0 && (
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-forge-surface">{githubRepos.length}</span>
                )}
                {tab === 'github' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-forge-accent rounded-full transition-all" />
                )}
              </button>
              {(loadingProjects || loadingRepos) && (
                <Loader2 className="w-3.5 h-3.5 text-forge-text-dim animate-spin ml-auto" />
              )}
            </div>

            {/* Search filter */}
            {((tab === 'projects' && savedProjects.length > 0) || (tab === 'github' && githubRepos.length > 0)) && (
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-forge-text-dim" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={tab === 'projects' ? 'Filter projects...' : 'Filter repositories...'}
                  className="w-full pl-9 pr-8 py-2 text-xs bg-forge-surface border border-forge-border rounded-lg text-forge-text placeholder:text-forge-text-dim/50 outline-none focus:border-forge-accent/50 focus:ring-2 focus:ring-forge-accent/10 transition-all"
                />
                <button
                  onClick={() => setSearchQuery('')}
                  className={`absolute right-2.5 top-1/2 -translate-y-1/2 text-forge-text-dim hover:text-forge-text transition-opacity ${searchQuery ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                  tabIndex={searchQuery ? 0 : -1}
                  aria-label="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Saved Projects Tab */}
            {tab === 'projects' && (
              <>
                {loadingProjects ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} className={`rounded-xl border border-forge-border p-4 space-y-3 animate-fade-in stagger-${i}`}>
                        <div className="flex items-center justify-between">
                          <div className="h-4 w-32 rounded animate-skeleton" />
                          <div className="h-4 w-14 rounded animate-skeleton" />
                        </div>
                        <div className="h-3 w-48 rounded animate-skeleton" />
                        <div className="h-3 w-24 rounded animate-skeleton" />
                      </div>
                    ))}
                  </div>
                ) : loadError ? (
                  <div className="flex flex-col items-center py-12 border border-dashed border-red-300 dark:border-red-800 rounded-2xl bg-red-50/50 dark:bg-red-950/20">
                    <p className="text-sm text-red-600 dark:text-red-400 font-medium mb-1">Failed to load projects</p>
                    <p className="text-xs text-forge-text-dim/60 mb-3">Check your connection and try again</p>
                    {onRetryLoad && (
                      <button
                        onClick={onRetryLoad}
                        className="px-4 py-2 text-xs font-medium rounded-lg bg-forge-accent text-white hover:bg-forge-accent-hover transition-colors"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                ) : savedProjects.length === 0 ? (
                  <div className="flex flex-col items-center py-12 border border-dashed border-forge-border rounded-2xl">
                    <div className="w-12 h-12 rounded-xl bg-forge-surface flex items-center justify-center mb-3">
                      <FolderOpen className="w-6 h-6 text-forge-text-dim/40" />
                    </div>
                    <p className="text-sm text-forge-text-dim font-medium mb-1">No saved projects</p>
                    <p className="text-xs text-forge-text-dim/60">Create one above or import from GitHub</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {savedProjects.filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.description?.toLowerCase().includes(searchQuery.toLowerCase())).map(project => (
                      <button
                        key={project.id}
                        onClick={() => onSelect(project.name, project.id)}
                        className="group relative bg-forge-panel border border-forge-border border-l-2 border-l-transparent rounded-xl p-4 text-left hover:border-forge-accent/50 hover:border-l-forge-accent hover:bg-forge-accent/5 hover:shadow-sm transition-all"
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

                        <div className="flex items-center gap-3 text-xs sm:text-[10px] text-forge-text-dim">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {formatRelative(project.updated_at)}
                          </span>

                          {project.vercel_url && (
                            <a href={project.vercel_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 py-1 hover:text-forge-accent">
                              <Globe className="w-3 h-3" /> Live <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}

                          {project.github_repo_url && (
                            <a href={project.github_repo_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex items-center gap-1 py-1 hover:text-forge-accent">
                              <Github className="w-3 h-3" /> Repo <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </div>

                        <button
                          onClick={e => handleDelete(e, project.id)}
                          disabled={deletingId === project.id}
                          className="absolute top-3 right-3 p-1.5 rounded-lg opacity-0 group-hover:opacity-100 text-forge-text-dim hover:text-forge-danger hover:bg-forge-danger/10 transition-all"
                          title="Delete project"
                          aria-label="Delete project"
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
                    {githubRepos.filter(r => !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase()) || r.description?.toLowerCase().includes(searchQuery.toLowerCase())).map(repo => (
                      <button
                        key={repo.id}
                        onClick={() => handleImportRepo(repo)}
                        disabled={importingRepo === repo.full_name}
                        className="group relative bg-forge-panel border border-forge-border rounded-xl p-4 text-left hover:border-forge-accent/50 hover:bg-forge-accent/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="flex items-start justify-between mb-1.5">
                          <h3 className="text-sm font-medium text-forge-text group-hover:text-forge-accent transition-colors truncate pr-2 flex items-center gap-1.5">
                            {repo.private && <Lock className="w-3 h-3 text-forge-text-dim shrink-0" />}
                            {repo.fork && <GitFork className="w-3 h-3 text-forge-text-dim shrink-0" />}
                            {repo.archived && <Archive className="w-3 h-3 text-amber-500 shrink-0" />}
                            {repo.name}
                          </h3>
                          <div className="flex items-center gap-1 shrink-0">
                            {repo.archived && (
                              <span className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400">archived</span>
                            )}
                            {repo.language && (
                              <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${LANG_COLORS[repo.language] || 'bg-forge-surface text-forge-text-dim'}`}>
                                {repo.language}
                              </span>
                            )}
                          </div>
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
        <p className="text-center text-[11px] text-forge-text-dim/60 mt-10">
          Powered by Claude Sonnet 4 &middot; Self-improving AI &middot; GitHub + Vercel + Database
        </p>
      </div>
    </div>
  )
}
