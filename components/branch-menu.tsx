'use client'

import { useState, useEffect, useRef } from 'react'
import { GitBranch, Plus, Check, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BranchMenuProps {
  owner: string
  repo: string
  currentBranch?: string
  onSwitch?: (branch: string) => void
}

export function BranchMenu({ owner, repo, currentBranch = 'main', onSwitch }: BranchMenuProps) {
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open || !owner || !repo) return
    setLoading(true)
    fetch(`/api/github/branches?owner=${owner}&repo=${repo}`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          const names = data.map((b: any) => b.name || b)
          setBranches(names)
          // Auto-detect: if currentBranch not in list, switch to first available branch
          if (names.length > 0 && !names.includes(currentBranch)) {
            onSwitch?.(names[0])
          }
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, owner, repo])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleCreateBranch = async () => {
    if (!newBranchName.trim()) return
    setCreating(true)
    try {
      await fetch('/api/github/branches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo, branch: newBranchName.trim(), from: currentBranch }),
      })
      setBranches(prev => [newBranchName.trim(), ...prev])
      setNewBranchName('')
      onSwitch?.(newBranchName.trim())
    } catch (e) { console.warn('[forge:branch] Failed to create branch:', e) }
    setCreating(false)
  }

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-forge-text-dim hover:text-forge-text bg-forge-surface border border-forge-border rounded-lg transition-colors"
      >
        <GitBranch className="w-3.5 h-3.5" />
        <span className="max-w-[100px] truncate">{currentBranch}</span>
        <ChevronDown className="w-3 h-3" />
      </button>

      {open && (
        <div className="absolute top-full mt-1 left-0 w-64 bg-forge-bg border border-forge-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-forge-border">
            <div className="flex gap-1.5">
              <input
                value={newBranchName}
                onChange={e => setNewBranchName(e.target.value)}
                placeholder="New branch name..."
                className="flex-1 px-2 py-1 text-xs bg-forge-surface border border-forge-border rounded text-forge-text placeholder:text-forge-text-dim/50 focus:outline-none focus:border-forge-accent"
                onKeyDown={e => e.key === 'Enter' && handleCreateBranch()}
              />
              <button
                onClick={handleCreateBranch}
                disabled={!newBranchName.trim() || creating}
                className="px-2 py-1 text-xs bg-forge-accent text-white rounded hover:bg-forge-accent-hover disabled:opacity-50 transition-colors"
              >
                {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
              </button>
            </div>
          </div>

          <div className="max-h-48 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-4 h-4 animate-spin text-forge-text-dim" />
              </div>
            ) : branches.length === 0 ? (
              <p className="text-xs text-forge-text-dim text-center py-3">No branches found</p>
            ) : (
              branches.map(branch => (
                <button
                  key={branch}
                  onClick={() => { onSwitch?.(branch); setOpen(false) }}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-forge-surface transition-colors',
                    branch === currentBranch ? 'text-forge-accent' : 'text-forge-text-dim',
                  )}
                >
                  {branch === currentBranch && <Check className="w-3 h-3 shrink-0" />}
                  <span className={cn('truncate', branch !== currentBranch && 'ml-5')}>{branch}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
