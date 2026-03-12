'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Check, AlertCircle } from 'lucide-react'
import { getLanguageFromPath } from '@/lib/utils'

interface StatusBarProps {
  activeFile: string | null
  fileCount: number
  framework?: string
  saveStatus?: 'idle' | 'pending' | 'saving' | 'saved' | 'error'
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
  pending: { label: 'Unsaved changes', color: 'text-amber-400' },
  saving: { label: 'Saving...', color: 'text-amber-500' },
  saved:  { label: 'All changes saved', color: 'text-green-500' },
  error:  { label: 'Save failed — Ctrl+S to retry', color: 'text-red-500' },
}

const FRAMEWORK_COLORS: Record<string, string> = {
  'Next.js': 'bg-gray-500',
  'Vite': 'bg-purple-500',
  'Static': 'bg-blue-400',
  'React': 'bg-cyan-400',
}

function SaveStatusIcon({ status }: { status: string }) {
  if (status === 'pending') return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse-dot" />
  if (status === 'saving') return <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
  if (status === 'saved') return <Check className="w-3.5 h-3.5 text-green-500 animate-check-in" />
  if (status === 'error') return <AlertCircle className="w-3.5 h-3.5 text-red-500" />
  return null
}

export function StatusBar({ activeFile, fileCount, framework, saveStatus = 'idle' }: StatusBarProps) {
  const language = activeFile ? getLanguageFromPath(activeFile) : null
  const langDisplay = language ? LANG_DISPLAY[language] || language : null

  // Track displayed status with crossfade: fade out old, then fade in new
  const [displayed, setDisplayed] = useState(saveStatus)
  const [visible, setVisible] = useState(saveStatus !== 'idle')
  const displayedRef = useRef(displayed)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null)
  displayedRef.current = displayed

  useEffect(() => {
    if (saveStatus === 'saved') {
      setLastSavedAt(new Date().toLocaleTimeString('en-AU', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }
  }, [saveStatus])

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
  const frameworkDotColor = framework ? FRAMEWORK_COLORS[framework] || 'bg-forge-text-dim' : null

  return (
    <div role="status" aria-live="polite" className="h-6 flex items-center justify-between px-3 border-t border-forge-border bg-forge-panel text-[10px] text-forge-text-dim shrink-0 select-none">
      <div className="flex items-center gap-3">
        {langDisplay && (
          <span className="font-medium">{langDisplay}</span>
        )}
        {activeFile && (
          <span className="items-center gap-3 hidden md:flex">
            <span className="w-px h-3 bg-forge-border" />
            <span>UTF-8</span>
          </span>
        )}
        <span className="w-px h-3 bg-forge-border hidden md:block" />
        <span className="hidden md:inline">{fileCount} file{fileCount !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex items-center gap-3">
        {info && (
          <span
            className={`flex items-center gap-1 transition-all duration-200 ease-out ${info.color} ${visible ? 'opacity-100' : 'opacity-0'}`}
            title={lastSavedAt ? `Last saved at ${lastSavedAt}` : undefined}
          >
            <SaveStatusIcon status={displayed} />
            {info.label}
          </span>
        )}
        {framework && (
          <>
            <span className="w-px h-3 bg-forge-border" />
            <span className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[9px] font-medium bg-forge-surface text-forge-text-dim border border-forge-border shadow-sm" title={`Detected framework: ${framework}`}>
              {frameworkDotColor && <span className={`w-1.5 h-1.5 rounded-full ${frameworkDotColor}`} />}
              {framework}
            </span>
          </>
        )}
      </div>
    </div>
  )
}
