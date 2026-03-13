'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EditorTabsProps {
  openFiles: string[]
  activeFile: string | null
  onFileSelect: (path: string) => void
  onCloseFile: (path: string) => void
  onReorder?: (from: number, to: number) => void
  modifiedFiles?: Set<string>
}

const FILE_ICON_COLORS: Record<string, string> = {
  tsx: 'bg-blue-400',
  jsx: 'bg-cyan-400',
  ts: 'bg-blue-500',
  js: 'bg-yellow-400',
  css: 'bg-purple-400',
  html: 'bg-orange-400',
  json: 'bg-green-400',
  md: 'bg-gray-400',
  sql: 'bg-blue-300',
}

export function EditorTabs({
  openFiles,
  activeFile,
  onFileSelect,
  onCloseFile,
  onReorder,
  modifiedFiles,
}: EditorTabsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [showLeftArrow, setShowLeftArrow] = useState(false)
  const [showRightArrow, setShowRightArrow] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)

  // Check scroll overflow
  const checkOverflow = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setShowLeftArrow(el.scrollLeft > 0)
    setShowRightArrow(el.scrollLeft < el.scrollWidth - el.clientWidth - 1)
  }, [])

  useEffect(() => {
    checkOverflow()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', checkOverflow)
    const observer = new ResizeObserver(checkOverflow)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', checkOverflow)
      observer.disconnect()
    }
  }, [checkOverflow, openFiles.length])

  // Scroll active tab into view
  useEffect(() => {
    if (!activeFile || !scrollRef.current) return
    const idx = openFiles.indexOf(activeFile)
    if (idx === -1) return
    const tab = scrollRef.current.children[idx] as HTMLElement
    if (tab) tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [activeFile, openFiles])

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -120 : 120, behavior: 'smooth' })
  }

  // Drag and drop reorder
  const handleDragStart = (idx: number) => setDragIndex(idx)
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    setDropIndex(idx)
  }
  const handleDrop = (idx: number) => {
    if (dragIndex !== null && dragIndex !== idx && onReorder) {
      onReorder(dragIndex, idx)
    }
    setDragIndex(null)
    setDropIndex(null)
  }
  const handleDragEnd = () => {
    setDragIndex(null)
    setDropIndex(null)
  }

  if (openFiles.length === 0) return null

  return (
    <div className="flex items-center bg-pi-panel border-b border-pi-border relative">
      {/* Left scroll button */}
      {showLeftArrow && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 z-10 h-full px-1 bg-gradient-to-r from-pi-panel to-transparent hover:from-pi-surface scroll-btn-in"
        >
          <ChevronLeft className="w-3 h-3 text-pi-text-dim" />
        </button>
      )}

      {/* Tabs */}
      <div
        ref={scrollRef}
        role="tablist"
        aria-label="Open files"
        className="flex items-center overflow-x-auto scrollbar-none gap-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {openFiles.map((file, idx) => {
          const name = file.split('/').pop() || file
          const ext = name.split('.').pop()?.toLowerCase() || ''
          const isActive = activeFile === file
          const isModified = modifiedFiles?.has(file)
          const isDragTarget = dropIndex === idx && dragIndex !== idx

          return (
            <div
              key={file}
              role="tab"
              aria-selected={isActive}
              aria-label={name}
              tabIndex={isActive ? 0 : -1}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              onClick={() => onFileSelect(file)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') {
                  e.preventDefault()
                  const next = openFiles[idx + 1]
                  if (next) onFileSelect(next)
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault()
                  const prev = openFiles[idx - 1]
                  if (prev) onFileSelect(prev)
                } else if (e.key === 'Delete' || (e.key === 'w' && (e.ctrlKey || e.metaKey))) {
                  e.preventDefault()
                  onCloseFile(file)
                }
              }}
              onAuxClick={(e) => {
                if (e.button === 1) { // Middle click to close
                  e.preventDefault()
                  onCloseFile(file)
                }
              }}
              title={file}
              className={cn(
                'group relative flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer transition-all duration-150 whitespace-nowrap select-none min-w-0',
                'border-r border-pi-border/50',
                isActive
                  ? 'bg-pi-surface text-pi-text'
                  : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface/50',
                isDragTarget && 'border-l-2 border-l-pi-accent bg-pi-accent/5 shadow-[inset_2px_0_4px_-2px_rgba(99,102,241,0.3)]',
                dragIndex === idx && 'opacity-40 scale-[0.97]',
              )}
            >
              {/* Color dot for file extension */}
              <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', FILE_ICON_COLORS[ext] || 'bg-pi-text-dim')} />
              <span className="truncate max-w-[120px]">{name}</span>
              {isModified && (
                <span className="w-1.5 h-1.5 rounded-full bg-pi-accent shrink-0" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseFile(file)
                }}
                className="ml-0.5 p-0.5 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-pi-danger text-[10px] transition-all duration-150 rounded hover:bg-pi-danger/10"
                aria-label={`Close ${name}`}
              >
                <X className="w-3 h-3" />
              </button>
              {isActive && (
                <motion.span
                  layoutId="editor-tab-indicator"
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-pi-accent"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Right scroll button */}
      {showRightArrow && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 z-10 h-full px-1 bg-gradient-to-l from-pi-panel to-transparent hover:from-pi-surface scroll-btn-in"
        >
          <ChevronRight className="w-3 h-3 text-pi-text-dim" />
        </button>
      )}
    </div>
  )
}
