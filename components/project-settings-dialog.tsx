'use client'

import { useState, useEffect } from 'react'
import { X, Settings2, Brain, Trash2, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ProjectSettingsDialogProps {
  open: boolean
  onClose: () => void
  projectName: string
  projectId: string | null
  framework?: string
  onUpdateSettings: (settings: { name?: string; description?: string }) => void
}

type Tab = 'general' | 'memory'

export function ProjectSettingsDialog({
  open,
  onClose,
  projectName,
  projectId,
  framework,
  onUpdateSettings,
}: ProjectSettingsDialogProps) {
  const [tab, setTab] = useState<Tab>('general')
  const [name, setName] = useState(projectName)
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  // Memory state
  const [memory, setMemory] = useState<Record<string, string>>({})
  const [loadingMemory, setLoadingMemory] = useState(false)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  useEffect(() => {
    if (open) {
      setName(projectName)
      setTab('general')
    }
  }, [open, projectName])

  // Load memory when Memory tab is selected
  useEffect(() => {
    if (!open || tab !== 'memory' || !projectId) return
    setLoadingMemory(true)
    fetch(`/api/projects/${projectId}`)
      .then(res => res.json())
      .then(data => {
        if (data.memory && typeof data.memory === 'object') {
          setMemory(data.memory)
        } else {
          setMemory({})
        }
      })
      .catch(() => setMemory({}))
      .finally(() => setLoadingMemory(false))
  }, [open, tab, projectId])

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

  const handleDeleteMemoryKey = async (key: string) => {
    if (!projectId) return
    const updated = { ...memory }
    delete updated[key]
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memory: updated }),
      })
      setMemory(updated)
    } catch { /* ignore */ }
  }

  const handleAddMemory = async () => {
    if (!projectId || !newKey.trim() || !newValue.trim()) return
    const updated = { ...memory, [newKey.trim()]: newValue.trim() }
    try {
      await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memory: updated }),
      })
      setMemory(updated)
      setNewKey('')
      setNewValue('')
    } catch { /* ignore */ }
  }

  const memorySize = JSON.stringify(memory).length
  const memoryKeys = Object.keys(memory)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose} role="dialog" aria-modal="true" aria-label="Project settings">
      <div className="absolute inset-0 bg-forge-overlay backdrop-blur-md animate-fade-in" />
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

        {/* Tab bar */}
        <div className="flex border-b border-forge-border px-5">
          {(['general', 'memory'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
                tab === t
                  ? 'text-forge-accent border-forge-accent'
                  : 'text-forge-text-dim border-transparent hover:text-forge-text hover:border-forge-border'
              )}
            >
              {t === 'general' ? 'General' : 'Memory'}
              {t === 'memory' && memoryKeys.length > 0 && (
                <span className="ml-1 text-[10px] text-forge-text-dim/60">({memoryKeys.length})</span>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'general' ? (
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
        ) : (
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-forge-text-dim">
                AI-saved project insights that persist across sessions.
              </p>
              <span className="text-[10px] text-forge-text-dim/50">{(memorySize / 1024).toFixed(1)}KB / 5KB</span>
            </div>

            {loadingMemory ? (
              <div className="text-xs text-forge-text-dim py-4 text-center">Loading memory...</div>
            ) : memoryKeys.length === 0 ? (
              <div className="text-xs text-forge-text-dim py-6 text-center flex flex-col items-center gap-2">
                <Brain className="w-5 h-5 text-forge-text-dim/30" />
                <span>No memory entries yet.</span>
                <span className="text-[10px] text-forge-text-dim/50">The AI will save project insights as it works.</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-[200px] overflow-y-auto">
                {memoryKeys.map(key => (
                  <div key={key} className="flex items-start gap-2 p-2 bg-forge-surface rounded-lg border border-forge-border">
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-medium text-forge-accent">{key}</span>
                      <p className="text-[11.5px] text-forge-text-dim mt-0.5 whitespace-pre-wrap break-words">
                        {String(memory[key])}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteMemoryKey(key)}
                      className="p-1 text-forge-text-dim/30 hover:text-red-500 transition-colors shrink-0"
                      title="Remove"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add new memory entry */}
            <div className="border-t border-forge-border pt-3 space-y-2">
              <input
                type="text"
                value={newKey}
                onChange={e => setNewKey(e.target.value)}
                placeholder="Key (e.g., framework, conventions)"
                className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-1.5 text-[12px] text-forge-text placeholder:text-forge-text-dim/40 outline-none focus:border-forge-accent/50 transition-all"
              />
              <textarea
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                placeholder="Value..."
                rows={2}
                className="w-full bg-forge-surface border border-forge-border rounded-lg px-3 py-1.5 text-[12px] text-forge-text placeholder:text-forge-text-dim/40 outline-none focus:border-forge-accent/50 resize-none transition-all"
              />
              <button
                onClick={handleAddMemory}
                disabled={!newKey.trim() || !newValue.trim() || !projectId}
                className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-white bg-forge-accent hover:bg-forge-accent-hover rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add Entry
              </button>
            </div>
          </div>
        )}

        {/* Footer */}
        {tab === 'general' && (
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
        )}
      </div>
    </div>
  )
}
