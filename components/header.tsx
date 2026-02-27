'use client'

import { Hammer, FolderOpen, FileText, Rocket } from 'lucide-react'

interface HeaderProps {
  projectName: string
  onSwitchProject: () => void
  fileCount: number
}

export function Header({ projectName, onSwitchProject, fileCount }: HeaderProps) {
  return (
    <header className="h-11 flex items-center justify-between px-4 border-b border-forge-border bg-forge-panel shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <Hammer className="w-4 h-4 text-forge-accent" />
          <span className="font-bold text-sm text-forge-text">Forge</span>
        </div>
        <div className="w-px h-4 bg-forge-border" />
        <button
          onClick={onSwitchProject}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-forge-text-dim hover:text-forge-text hover:bg-forge-surface rounded transition-colors"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span>{projectName}</span>
        </button>
        {fileCount > 0 && (
          <span className="text-[10px] text-forge-text-dim flex items-center gap-1">
            <FileText className="w-3 h-3" />
            {fileCount} files
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 text-[10px] text-forge-text-dim">
        <span>Claude Sonnet 4</span>
        <span className="text-forge-accent">●</span>
      </div>
    </header>
  )
}
