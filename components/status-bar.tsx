'use client'

import { getLanguageFromPath } from '@/lib/utils'

interface StatusBarProps {
  activeFile: string | null
  fileCount: number
  framework?: string
  saveStatus?: 'idle' | 'saving' | 'saved' | 'error'
}

const LANG_DISPLAY: Record<string, string> = {
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  css: 'CSS',
  html: 'HTML',
  json: 'JSON',
  markdown: 'Markdown',
  plaintext: 'Plain Text',
}

export function StatusBar({ activeFile, fileCount, framework, saveStatus = 'idle' }: StatusBarProps) {
  const language = activeFile ? getLanguageFromPath(activeFile) : null
  const langDisplay = language ? LANG_DISPLAY[language] || language : null

  return (
    <div className="h-6 flex items-center justify-between px-3 border-t border-forge-border bg-forge-panel text-[10px] text-forge-text-dim shrink-0 hidden md:flex select-none">
      <div className="flex items-center gap-3">
        {langDisplay && (
          <span className="font-medium">{langDisplay}</span>
        )}
        {activeFile && (
          <>
            <span className="w-px h-3 bg-forge-border" />
            <span>UTF-8</span>
          </>
        )}
        <span className="w-px h-3 bg-forge-border" />
        <span>{fileCount} file{fileCount !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="transition-all duration-300">
          {saveStatus === 'saving' && <span className="text-amber-500">Saving...</span>}
          {saveStatus === 'saved' && <span className="text-green-500 animate-fade-in">Saved</span>}
          {saveStatus === 'error' && <span className="text-red-500 animate-fade-in">Save failed</span>}
        </span>
        {framework && (
          <>
            <span className="w-px h-3 bg-forge-border" />
            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-forge-surface text-forge-text-dim border border-forge-border" title={`Detected framework: ${framework}`}>
              {framework}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
