'use client'

import { useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import {
  Hammer, Plus, Sparkles, FolderOpen, Trash2,
  Github, Clock, Globe, ExternalLink, Loader2,
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
  nextjs: 'bg-blue-500/20 text-blue-400',
  'vite-react': 'bg-purple-500/20 text-purple-400',
  static: 'bg-gray-500/20 text-gray-400',
}

const QUICK_STARTS = [
  { label: 'Landing Page', query: 'Build a modern landing page with hero section, features grid, testimonials with avatars, pricing table, and footer. Use a cohesive color palette with gradients and animations. Make it look like a real SaaS product.' },
  { label: 'Dashboard', query: 'Build an admin dashboard with sidebar navigation, stats cards with sparklines, a chart area, recent activity feed, and a data table with sorting. Dark theme, professional look.' },
  { label: 'Portfolio', query: 'Create a portfolio site with animated hero, project showcase with hover effects, about section with skills, timeline, and a contact form. Minimal, elegant design.' },
  { label: 'E-commerce', query: 'Build an e-commerce product page with image gallery, size/color selector, add to cart, reviews section, and related products. Clean, modern design like Apple Store.' },
]

export function ProjectPicker({ onSelect, savedProjects, loadingProjects, onDeleteProject, isLoggedIn }: ProjectPickerProps) {
  const { status } = useSession()
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  return (
    <div className="min-h-screen bg-forge-bg flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-forge-accent/10 mb-4">
            <Hammer className="w-8 h-8 text-forge-accent" />
          </div>
          <h1 className="text-3xl font-bold text-forge-text mb-2">Forge</h1>
          <p className="text-forge-text-dim text-sm">AI-powered website builder with superpowers</p>
        </div>

        {/* Auth prompt */}
        {status !== 'loading' && !isLoggedIn && (
          <div className="bg-forge-panel border border-forge-border rounded-xl p-4 mb-6 text-center">
            <p className="text-sm text-forge-text-dim mb-3">
              Sign in with GitHub to save projects and deploy to your account
            </p>
            <button
              onClick={() => signIn('github')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-gray-900 text-sm font-medium hover:bg-gray-100 transition-colors"
            >
              <Github className="w-4 h-4" />
              Sign in with GitHub
            </button>
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

        {/* Saved projects */}
        {isLoggedIn && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-forge-text flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-forge-text-dim" />
                Your Projects
              </h2>
              {loadingProjects && (
                <Loader2 className="w-3.5 h-3.5 text-forge-text-dim animate-spin" />
              )}
            </div>

            {savedProjects.length === 0 && !loadingProjects ? (
              <div className="text-center py-8 text-forge-text-dim text-sm border border-dashed border-forge-border rounded-xl">
                No projects yet. Create one above to get started.
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
                        <a
                          href={project.vercel_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 hover:text-forge-accent"
                        >
                          <Globe className="w-3 h-3" />
                          Live
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}

                      {project.github_repo_url && (
                        <a
                          href={project.github_repo_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 hover:text-forge-accent"
                        >
                          <Github className="w-3 h-3" />
                          Repo
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      )}
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={e => handleDelete(e, project.id)}
                      disabled={deletingId === project.id}
                      className="absolute top-3 right-3 p-1 rounded opacity-0 group-hover:opacity-100 text-forge-text-dim hover:text-forge-danger hover:bg-forge-danger/10 transition-all"
                      title="Delete project"
                    >
                      {deletingId === project.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </button>
                ))}
              </div>
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
