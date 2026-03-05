'use client'

import { Database } from 'lucide-react'

const FORGE_TABLES = [
  'forge_projects',
  'forge_project_files',
  'forge_chat_messages',
  'forge_deployments',
]

interface DbPanelProps {
  onOpenDbExplorer: () => void
}

export function DbPanel({ onOpenDbExplorer }: DbPanelProps) {
  return (
    <div className="p-3 space-y-3">
      <p className="text-[10px] uppercase tracking-wider text-forge-text-dim font-medium">Tables</p>
      <div className="space-y-0.5">
        {FORGE_TABLES.map(table => (
          <button
            key={table}
            onClick={onOpenDbExplorer}
            className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-forge-surface transition-colors text-left"
          >
            <Database className="w-3.5 h-3.5 text-forge-text-dim shrink-0" />
            <span className="truncate text-forge-text font-mono">{table}</span>
          </button>
        ))}
      </div>
      <button
        onClick={onOpenDbExplorer}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs rounded-lg border border-forge-border hover:bg-forge-surface transition-colors"
      >
        Open SQL Explorer
      </button>
    </div>
  )
}
