'use client'

import { useState, useEffect } from 'react'
import { Hammer, Plus, FolderOpen, Clock, Loader2, Sparkles, ArrowRight, GitBranch, Package } from 'lucide-react'
import { cn, formatRelative } from '@/lib/utils'
import type { Project } from '@/lib/types'

interface ProjectPickerProps {
  onSelect: (project: Project) => void
  onCreateNew: (name: string) => void
}

export function ProjectPicker({ onSelect, onCreateNew }: ProjectPickerProps) {
  const [projects, setProjects] = useState<Array<Project & { hasPackageJson?: boolean; hasGit?: boolean }>>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetch('/api/chat')
      .then(r => r.json())
      .then(data => {
        setProjects(data.projects || [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const handleCreate = () => {
    const name = newName.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase()
    if (!name) return
    setCreating(true)
    onCreateNew(name)
  }

  return (
    <div className="min-h-screen bg-forge-bg flex items-center justify-center p-8">
      <div className="max-w-2xl w-full">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-forge-accent/10 mb-4">
            <Hammer className="w-8 h-8 text-forge-accent" />
          </div>
          <h1 className="text-3xl font-bold text-forge-text mb-2">Forge</h1>
          <p className="text-forge-text-dim">AI-powered React website builder</p>
        </div>

        {/* New project */}
        <div className="bg-forge-panel border border-forge-border rounded-xl p-6 mb-6">
          <h2 className="text-sm font-semibold text-forge-text mb-4 flex items-center gap-2">
            <Plus className="w-4 h-4 text-forge-accent" />
            New Project
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="my-awesome-app"
              className="flex-1 bg-forge-surface border border-forge-border rounded-lg px-4 py-2.5 text-sm text-forge-text placeholder:text-forge-text-dim/50 outline-none focus:border-forge-accent/50 transition-colors"
              autoFocus
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || creating}
              className="flex items-center gap-2 px-5 py-2.5 bg-forge-accent hover:bg-forge-accent-hover text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Create
            </button>
          </div>
        </div>

        {/* Existing projects */}
        <div className="bg-forge-panel border border-forge-border rounded-xl p-6">
          <h2 className="text-sm font-semibold text-forge-text mb-4 flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-forge-accent" />
            Recent Projects
          </h2>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-forge-accent" />
            </div>
          ) : projects.length === 0 ? (
            <p className="text-forge-text-dim text-sm text-center py-8">
              No projects yet. Create one to get started!
            </p>
          ) : (
            <div className="space-y-1">
              {projects.map(p => (
                <button
                  key={p.name}
                  onClick={() => onSelect(p)}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg hover:bg-forge-surface/80 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-forge-accent/10 flex items-center justify-center">
                      <FolderOpen className="w-4 h-4 text-forge-accent" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-forge-text">{p.name}</div>
                      <div className="flex items-center gap-2 text-[11px] text-forge-text-dim">
                        <Clock className="w-3 h-3" />
                        <span>{formatRelative(p.updatedAt)}</span>
                        {p.hasPackageJson && (
                          <span className="flex items-center gap-0.5">
                            <Package className="w-3 h-3" /> npm
                          </span>
                        )}
                        {p.hasGit && (
                          <span className="flex items-center gap-0.5">
                            <GitBranch className="w-3 h-3" /> git
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-forge-text-dim opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
