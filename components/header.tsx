'use client'

import { useState } from 'react'
import { Hammer, FolderOpen, GitBranch, ExternalLink, Loader2, Terminal } from 'lucide-react'
import type { Project } from '@/lib/types'
import { cn } from '@/lib/utils'

interface HeaderProps {
  project: Project
  onSwitchProject: () => void
  previewUrl: string | null
}

export function Header({ project, onSwitchProject, previewUrl }: HeaderProps) {
  const [deploying, setDeploying] = useState(false)
  const [terminalOpen, setTerminalOpen] = useState(false)
  const [terminalOutput, setTerminalOutput] = useState('')
  const [terminalCmd, setTerminalCmd] = useState('')

  const handleDeploy = async () => {
    setDeploying(true)
    // Deployment is handled through chat — just open it
    setDeploying(false)
  }

  const runTerminalCmd = async () => {
    if (!terminalCmd.trim()) return
    setTerminalOutput(prev => prev + `$ ${terminalCmd}\n`)
    try {
      // Use the chat API's run_command through a direct endpoint would be better,
      // but for now we'll just show a message
      setTerminalOutput(prev => prev + 'Use the chat to run commands (e.g. "run npm install")\n')
    } catch {
      setTerminalOutput(prev => prev + 'Error\n')
    }
    setTerminalCmd('')
  }

  return (
    <>
      <header className="h-12 flex items-center justify-between px-4 border-b border-forge-border bg-forge-panel shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Hammer className="w-5 h-5 text-forge-accent" />
            <span className="font-bold text-sm text-forge-text">Forge</span>
          </div>
          <div className="w-px h-5 bg-forge-border" />
          <button
            onClick={onSwitchProject}
            className="flex items-center gap-1.5 px-2 py-1 text-xs text-forge-text-dim hover:text-forge-text hover:bg-forge-surface rounded transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>{project.name}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTerminalOpen(!terminalOpen)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors',
              terminalOpen ? 'bg-forge-accent/20 text-forge-accent' : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface'
            )}
          >
            <Terminal className="w-3.5 h-3.5" />
            Terminal
          </button>

          {previewUrl && (
            <a
              href={previewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-forge-text-dim hover:text-forge-text hover:bg-forge-surface rounded transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Preview
            </a>
          )}

          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-forge-accent hover:bg-forge-accent-hover text-white rounded transition-colors disabled:opacity-50"
          >
            {deploying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />}
            Deploy
          </button>
        </div>
      </header>

      {/* Terminal drawer */}
      {terminalOpen && (
        <div className="h-48 border-b border-forge-border bg-[#0d0d0d] flex flex-col shrink-0">
          <div className="flex-1 overflow-auto p-3 font-mono text-xs text-gray-300 whitespace-pre-wrap">
            {terminalOutput || 'Terminal — use the chat panel to run commands\n'}
          </div>
          <div className="flex items-center border-t border-forge-border px-3 py-1.5">
            <span className="text-forge-accent text-xs mr-2">$</span>
            <input
              type="text"
              value={terminalCmd}
              onChange={e => setTerminalCmd(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runTerminalCmd()}
              className="flex-1 bg-transparent text-xs text-gray-300 outline-none font-mono"
              placeholder="Type a command..."
            />
          </div>
        </div>
      )}
    </>
  )
}
