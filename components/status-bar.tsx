'use client'

import { useEffect, useRef, useState } from 'react'
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

const SAVE_TEXT: Record<string, { label: string; color: string }> = {
  saving: { label: 'Saving...', color: 'text-amber-500' },
  saved:  { label: 'Saved',     color: 'text-green-500' },
  error:  { label: 'Save failed', color: 'text-red-500' },
}

export function StatusBar({ activeFile, fileCount, framework, saveStatus = 'idle' }: StatusBarProps) {
  const language = activeFile ? getLanguageFromPath(activeFile) : null
  const langDisplay = language ? LANG_DISPLAY[language] || language : null

  // Track displayed status with crossfade: fade out old, then fade in new
  const [displayed, setDisplayed] = useState(saveStatus)
  const [visible, setVisible] = useState(saveStatus !== 'idle')
  const displayedRef = useRef(displayed)
  displayedRef.current = displayed

  useEffect(() => {
    if (saveStatus === 'idle') {
      // Fade out then clear
      setVisible(false)
    } else if (saveStatus !== displayedRef.current) {
      // Fade out, swap text, fade in
      setVisible(false)
      const timer = setTimeout(() => {
        setDisplayed(saveStatus)
        setVisible(true)
      }, 150)
      return () => clearTimeout(timer)
    } else {
      setVisible(true)
    }
  }, [saveStatus])

  const info = SAVE_TEXT[displayed]

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
        {info && (
          <span
            className={`transition-opacity duration-150 ${info.color} ${visible ? 'opacity-100' : 'opacity-0'}`}
          >
            {info.label}
          </span>
        )}
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
