'use client'

import { Rocket, Download } from 'lucide-react'

interface DeployPanelProps {
  onAction: (action: string) => void
}

export function DeployPanel({ onAction }: DeployPanelProps) {
  return (
    <div className="p-3 space-y-3">
      <button
        onClick={() => onAction('deploy')}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg bg-forge-accent text-white hover:bg-forge-accent/90 transition-colors"
      >
        <Rocket className="w-3.5 h-3.5" />
        Deploy to Vercel
      </button>
      <button
        onClick={() => onAction('download')}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs rounded-lg border border-forge-border hover:bg-forge-surface transition-colors"
      >
        <Download className="w-3.5 h-3.5" />
        Download ZIP
      </button>
    </div>
  )
}
