'use client'

import { useState, useEffect } from 'react'
import { X, Settings2 } from 'lucide-react'

interface ProjectSettingsDialogProps {
  open: boolean
  onClose: () => void
  projectName: string
  projectId: string | null
  framework?: string
  onUpdateSettings: (settings: { name?: string; description?: string }) => void
}

export function ProjectSettingsDialog({
  open,
  onClose,
  projectName,
  projectId,
  framework,
  onUpdateSettings,
}: ProjectSettingsDialogProps) {
  const [name, setName] = useState(projectName)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(projectName)
    }
  }, [open, projectName])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const handleSave = async () => {
    setSaving(true)
    try {
      if (projectId) {
        await fetch(`/api/projects/${projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        })
      }
      onUpdateSettings({ name: name.trim(), description: description.trim() })
      onClose()
    } catch {
      // Silently fail — settings are non-critical
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative w-full max-w-md mx-4 bg-forge-bg rounded-2xl shadow-2xl border border-forge-border overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-forge-border">
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4 text-forge-accent" />
            <h2 className="text-sm font-semibold text-forge-text">Project Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-forge-text-dim mb-1.5">Project Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-sm text-forge-text outline-none focus:border-forge-accent/50 focus:ring-2 focus:ring-forge-accent/10 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-forge-text-dim mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              placeholder="Optional project description..."
              className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-2 text-sm text-forge-text placeholder:text-forge-text-dim/50 outline-none focus:border-forge-accent/50 focus:ring-2 focus:ring-forge-accent/10 resize-none transition-all"
            />
          </div>

          {framework && (
            <div>
              <label className="block text-xs font-medium text-forge-text-dim mb-1.5">Framework</label>
              <div className="px-3 py-2 bg-forge-surface border border-forge-border rounded-lg text-sm text-forge-text-dim">
                {framework}
              </div>
            </div>
          )}

          {projectId && (
            <div>
              <label className="block text-xs font-medium text-forge-text-dim mb-1.5">Project ID</label>
              <div className="px-3 py-2 bg-forge-surface border border-forge-border rounded-lg text-[11px] font-mono text-forge-text-dim truncate">
                {projectId}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-forge-border bg-forge-surface/30">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs text-forge-text-dim hover:text-forge-text rounded-lg hover:bg-forge-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-1.5 text-xs font-medium text-white bg-forge-accent hover:bg-forge-accent-hover rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
