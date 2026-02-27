'use client'

import { useState } from 'react'
import { Hammer, Plus, Sparkles, Code2, Globe, Layout } from 'lucide-react'

interface ProjectPickerProps {
  onSelect: (name: string, initialFiles?: Record<string, string>) => void
}

const TEMPLATES = [
  {
    id: 'empty',
    name: 'Empty Project',
    description: 'Start from scratch',
    icon: Plus,
    color: 'from-gray-500 to-gray-600',
  },
  {
    id: 'nextjs',
    name: 'Next.js App',
    description: 'React + Tailwind + TypeScript',
    icon: Code2,
    color: 'from-indigo-500 to-purple-600',
  },
  {
    id: 'landing',
    name: 'Landing Page',
    description: 'Hero, features, CTA, footer',
    icon: Layout,
    color: 'from-blue-500 to-cyan-500',
  },
  {
    id: 'portfolio',
    name: 'Portfolio',
    description: 'Projects, about, contact',
    icon: Globe,
    color: 'from-emerald-500 to-teal-500',
  },
]

export function ProjectPicker({ onSelect }: ProjectPickerProps) {
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)

  const handleCreate = (templateId?: string) => {
    const projectName = name.trim().replace(/[^a-zA-Z0-9_-]/g, '-').toLowerCase() || `project-${Date.now()}`
    setCreating(true)
    // For empty and basic templates, just create with the name
    // The AI will scaffold when the user gives their first prompt
    onSelect(projectName)
  }

  return (
    <div className="min-h-screen bg-forge-bg flex items-center justify-center p-8">
      <div className="max-w-lg w-full">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-forge-accent/10 mb-4">
            <Hammer className="w-8 h-8 text-forge-accent" />
          </div>
          <h1 className="text-3xl font-bold text-forge-text mb-2">Forge</h1>
          <p className="text-forge-text-dim text-sm">AI-powered React website builder</p>
        </div>

        {/* Project name input */}
        <div className="bg-forge-panel border border-forge-border rounded-xl p-6 mb-6">
          <label className="block text-xs font-medium text-forge-text-dim mb-2">Project Name</label>
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
              onClick={() => handleCreate()}
              disabled={creating}
              className="flex items-center gap-2 px-5 py-2.5 bg-forge-accent hover:bg-forge-accent-hover text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Start
            </button>
          </div>
        </div>

        {/* Quick start hint */}
        <p className="text-center text-xs text-forge-text-dim">
          Enter a name and describe what you want to build — the AI handles everything else
        </p>
      </div>
    </div>
  )
}
