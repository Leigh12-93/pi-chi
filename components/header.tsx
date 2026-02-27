'use client'

import { useSession, signIn, signOut } from 'next-auth/react'
import { Hammer, FolderOpen, FileText, Github, LogOut } from 'lucide-react'

interface HeaderProps {
  projectName: string
  onSwitchProject: () => void
  fileCount: number
}

export function Header({ projectName, onSwitchProject, fileCount }: HeaderProps) {
  const { data: session, status } = useSession()

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

      <div className="flex items-center gap-3">
        <span className="text-[10px] text-forge-text-dim">Claude Sonnet 4</span>

        {status === 'loading' ? (
          <div className="w-6 h-6 rounded-full bg-forge-surface animate-pulse" />
        ) : session?.user ? (
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-forge-surface text-[10px] text-forge-text-dim">
              <Github className="w-3 h-3" />
              <span>{session.user.name || session.user.email}</span>
            </div>
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                className="w-6 h-6 rounded-full border border-forge-border"
              />
            )}
            <button
              onClick={() => signOut()}
              className="p-1 text-forge-text-dim hover:text-forge-danger transition-colors"
              title="Sign out"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn('github')}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-forge-surface hover:bg-forge-accent/20 text-xs text-forge-text-dim hover:text-forge-text transition-colors"
          >
            <Github className="w-3.5 h-3.5" />
            Sign in
          </button>
        )}
      </div>
    </header>
  )
}
