'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  FolderGit2, Code2, BookOpen, Beaker, Wrench,
  Cpu, FlaskConical, Star, RefreshCw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { ProjectDetail } from './project-detail'
import type { BrainProject, ProjectManifest } from '@/lib/brain/brain-types'

interface ProjectsPanelProps {
  projects: BrainProject[]
  className?: string
}

type CategoryFilter = 'all' | 'code' | 'creative' | 'research' | 'hardware' | 'tool' | 'experiment'

const categoryConfig: Record<string, { icon: React.ElementType; color: string }> = {
  code: { icon: Code2, color: 'text-blue-400' },
  creative: { icon: BookOpen, color: 'text-purple-400' },
  research: { icon: Beaker, color: 'text-cyan-400' },
  hardware: { icon: Cpu, color: 'text-orange-400' },
  tool: { icon: Wrench, color: 'text-emerald-400' },
  experiment: { icon: FlaskConical, color: 'text-pink-400' },
}

const statusBadge: Record<string, string> = {
  planning: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  building: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  running: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  showcase: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  archived: 'bg-gray-500/10 text-gray-500 border-gray-500/20',
}

function formatRelativeTime(dateStr: string): string {
  try {
    const diff = Date.now() - new Date(dateStr).getTime()
    if (diff < 60000) return 'just now'
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
    return `${Math.floor(diff / 86400000)}d ago`
  } catch { return '' }
}

export function ProjectsPanel({ projects, className }: ProjectsPanelProps) {
  const [filter, setFilter] = useState<CategoryFilter>('all')
  const [selectedProject, setSelectedProject] = useState<ProjectManifest | null>(null)
  const [fullProjects, setFullProjects] = useState<ProjectManifest[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch full project manifests from API (includes outputs, tags, etc.)
  useEffect(() => {
    async function fetchProjects() {
      setLoading(true)
      try {
        const res = await fetch('/api/brain/projects')
        if (res.ok) {
          const data = await res.json()
          setFullProjects(data.projects || [])
        }
      } catch { /* fall back to brain state projects */ }
      setLoading(false)
    }
    fetchProjects()
  }, [projects.length]) // Re-fetch when brain state project count changes

  // Merge: prefer API manifests, fall back to brain state
  const mergedProjects = useMemo(() => {
    if (fullProjects.length > 0) return fullProjects
    // Convert BrainProject to minimal manifest shape
    return projects.map(p => ({
      ...p,
      category: p.category || 'experiment' as const,
      updatedAt: p.createdAt,
      outputs: p.outputs || [],
      tags: p.tags || [],
    }))
  }, [fullProjects, projects])

  const filtered = useMemo(() => {
    if (filter === 'all') return mergedProjects
    return mergedProjects.filter(p => p.category === filter)
  }, [mergedProjects, filter])

  const categories = useMemo(() => {
    const cats = new Set(mergedProjects.map(p => p.category))
    return ['all', ...Array.from(cats)] as CategoryFilter[]
  }, [mergedProjects])

  // Show detail view
  if (selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        onBack={() => setSelectedProject(null)}
      />
    )
  }

  return (
    <div className={cn('h-full flex flex-col', className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm">
        <FolderGit2 className="w-3.5 h-3.5 text-pi-accent" />
        <span className="text-xs font-bold text-pi-text">Projects</span>
        <span className="text-[10px] text-pi-text-dim bg-pi-surface px-1.5 py-0.5 rounded-full font-mono">
          {mergedProjects.length}
        </span>
        {loading && (
          <RefreshCw className="w-3 h-3 text-pi-text-dim animate-spin ml-auto" />
        )}
      </div>

      {/* Category filter chips */}
      {categories.length > 2 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-pi-border/50 overflow-x-auto">
          {categories.map(cat => {
            const config = cat !== 'all' ? categoryConfig[cat] : null
            return (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={cn(
                  'text-[9px] px-2.5 py-1 rounded-full font-medium transition-all whitespace-nowrap flex items-center gap-1',
                  filter === cat
                    ? 'bg-pi-accent/10 text-pi-accent border border-pi-accent/30'
                    : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface border border-transparent'
                )}
              >
                {config && <config.icon className={cn('w-2.5 h-2.5', config.color)} />}
                <span className="capitalize">{cat}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* Projects grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-12 text-pi-text-dim"
          >
            <FolderGit2 className="w-10 h-10 mb-3 opacity-15" />
            <p className="text-xs font-medium">No projects yet</p>
            <p className="text-[10px] mt-1 text-center max-w-[200px]">
              Pi-Chi will create structured projects as it builds things.
            </p>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            <AnimatePresence>
              {filtered.map((project, i) => {
                const config = categoryConfig[project.category] || categoryConfig.experiment
                const CatIcon = config.icon
                const outputCount = (project.outputs || []).length
                const hasFeatured = (project.outputs || []).some(o => o.featured)

                return (
                  <motion.button
                    key={project.id}
                    initial={{ opacity: 0, y: 8, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ delay: i * 0.05, type: 'spring', stiffness: 500, damping: 30 }}
                    className={cn(
                      'border border-pi-border rounded-lg bg-pi-surface/50 transition-all cursor-pointer hover:bg-pi-surface/80 text-left w-full',
                      project.status === 'running' && 'ring-1 ring-emerald-500/20',
                      project.status === 'showcase' && 'ring-1 ring-purple-500/20',
                    )}
                    onClick={() => setSelectedProject(project as ProjectManifest)}
                  >
                    <div className="p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <CatIcon className={cn('w-4 h-4 shrink-0', config.color)} />
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-pi-text leading-tight truncate">{project.name}</p>
                          </div>
                        </div>
                        <span className={cn(
                          'text-[8px] px-1.5 py-px rounded-full font-medium border shrink-0 capitalize',
                          statusBadge[project.status] || statusBadge.planning
                        )}>
                          {project.status}
                        </span>
                      </div>

                      <p className="text-[10px] text-pi-text-dim mt-1.5 leading-relaxed line-clamp-2">
                        {project.description}
                      </p>

                      <div className="flex items-center gap-2 mt-2">
                        {outputCount > 0 && (
                          <span className="text-[9px] text-pi-text-dim flex items-center gap-1">
                            {hasFeatured && <Star className="w-2.5 h-2.5 text-yellow-500" />}
                            {outputCount} output{outputCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {project.tags && project.tags.length > 0 && (
                          <div className="flex gap-1 overflow-hidden">
                            {project.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="text-[8px] px-1.5 py-px rounded-full bg-pi-surface border border-pi-border/50 text-pi-text-dim truncate">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        <span className="text-[9px] text-pi-text-dim/40 font-mono ml-auto">
                          {formatRelativeTime(project.updatedAt || project.createdAt)}
                        </span>
                      </div>
                    </div>
                  </motion.button>
                )
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
