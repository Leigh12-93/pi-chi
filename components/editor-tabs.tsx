'use client'

import { useRef, useState, useCallback, useEffect } from 'react'
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

const FILE_ICONS: Record<string, string> = {
  tsx: 'text-blue-400',
  jsx: 'text-cyan-400',
  ts: 'text-blue-500',
  js: 'text-yellow-400',
  css: 'text-purple-400',
  html: 'text-orange-400',
  json: 'text-green-400',
  md: 'text-gray-400',
  sql: 'text-blue-300',
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
    <div className="flex items-center bg-forge-panel border-b border-forge-border relative">
      {/* Left scroll button */}
      {showLeftArrow && (
        <button
          onClick={() => scroll('left')}
          className="absolute left-0 z-10 h-full px-1 bg-gradient-to-r from-forge-panel to-transparent hover:from-forge-surface"
        >
          <ChevronLeft className="w-3 h-3 text-forge-text-dim" />
        </button>
      )}

      {/* Tabs */}
      <div
        ref={scrollRef}
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
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={() => handleDrop(idx)}
              onDragEnd={handleDragEnd}
              onClick={() => onFileSelect(file)}
              onAuxClick={(e) => {
                if (e.button === 1) { // Middle click to close
                  e.preventDefault()
                  onCloseFile(file)
                }
              }}
              className={cn(
                'group relative flex items-center gap-1.5 px-3 py-2 text-xs cursor-pointer transition-all whitespace-nowrap select-none min-w-0',
                'border-r border-forge-border/50',
                isActive
                  ? 'bg-forge-surface text-forge-text'
                  : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface/50',
                isDragTarget && 'border-l-2 border-l-forge-accent',
                dragIndex === idx && 'opacity-50',
              )}
            >
              <span className={cn('text-[10px]', FILE_ICONS[ext] || 'text-forge-text-dim')}>
                {ext}
              </span>
              <span className="truncate max-w-[120px]">{name}</span>
              {isModified && (
                <span className="w-1.5 h-1.5 rounded-full bg-forge-accent shrink-0" />
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onCloseFile(file)
                }}
                className="ml-0.5 p-0.5 opacity-0 group-hover:opacity-100 hover:text-forge-danger text-[10px] transition-opacity rounded"
                aria-label={`Close ${name}`}
              >
                <X className="w-3 h-3" />
              </button>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-forge-accent" />
              )}
            </div>
          )
        })}
      </div>

      {/* Right scroll button */}
      {showRightArrow && (
        <button
          onClick={() => scroll('right')}
          className="absolute right-0 z-10 h-full px-1 bg-gradient-to-l from-forge-panel to-transparent hover:from-forge-surface"
        >
          <ChevronRight className="w-3 h-3 text-forge-text-dim" />
        </button>
      )}
    </div>
  )
}
