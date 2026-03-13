'use client'

import { useState, useRef, useEffect, useMemo, useCallback, memo } from 'react'
import {
  ChevronRight, FolderOpen, Folder,
  MoreHorizontal, Trash2, Edit3, Copy, FileText,
  Search, X, FilePlus, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileNode } from '@/lib/types'
import { toast } from 'sonner'

const FILE_TYPE_COLORS: Record<string, string> = {
  tsx: 'bg-blue-500',
  jsx: 'bg-cyan-500',
  ts: 'bg-blue-600',
  js: 'bg-yellow-500',
  mjs: 'bg-yellow-500',
  cjs: 'bg-yellow-500',
  css: 'bg-purple-500',
  scss: 'bg-pink-500',
  html: 'bg-orange-500',
  json: 'bg-green-500',
  md: 'bg-gray-400',
  mdx: 'bg-gray-500',
  svg: 'bg-amber-500',
  png: 'bg-pink-400',
  jpg: 'bg-pink-400',
  jpeg: 'bg-pink-400',
  gif: 'bg-pink-400',
  webp: 'bg-pink-400',
  ico: 'bg-pink-300',
  txt: 'bg-gray-300',
  env: 'bg-yellow-600',
  gitignore: 'bg-gray-400',
  yml: 'bg-red-400',
  yaml: 'bg-red-400',
  toml: 'bg-gray-500',
  lock: 'bg-gray-300',
  sql: 'bg-blue-400',
  sh: 'bg-green-600',
  bash: 'bg-green-600',
  py: 'bg-green-500',
  rs: 'bg-orange-600',
  go: 'bg-cyan-600',
}

function FileTypeDot({ name }: { name: string }) {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  const special = name.startsWith('.') ? name.slice(1).toLowerCase() : ''
  const color = FILE_TYPE_COLORS[special] || FILE_TYPE_COLORS[ext] || 'bg-gray-300'
  return <span className={cn('w-2 h-2 rounded-full shrink-0', color)} />
}

interface FileTreeProps {
  files: FileNode[]
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileDelete?: (path: string) => void
  onFileRename?: (oldPath: string, newPath: string) => void
  onFileCreate?: (path: string) => void
  fileContents?: Record<string, string>
  modifiedFiles?: Set<string>
  aiEditingFiles?: Set<string>
  fileDiffs?: Map<string, { added: number; removed: number }>
}

/** Recursively filter nodes matching search query */
function filterNodes(nodes: FileNode[], query: string): FileNode[] {
  const q = query.toLowerCase()
  const result: FileNode[] = []
  for (const node of nodes) {
    if (node.type === 'directory') {
      const filteredChildren = filterNodes(node.children || [], query)
      if (filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren })
      }
    } else if (node.name.toLowerCase().includes(q) || node.path.toLowerCase().includes(q)) {
      result.push(node)
    }
  }
  return result
}

export const FileTree = memo(function FileTree({
  files, activeFile, onFileSelect, onFileDelete, onFileRename, onFileCreate, fileContents, modifiedFiles,
  aiEditingFiles, fileDiffs,
}: FileTreeProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [showNewFile, setShowNewFile] = useState(false)
  const [newFilePath, setNewFilePath] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const newFileRef = useRef<HTMLInputElement>(null)

  const filteredFiles = useMemo(() => {
    if (!searchQuery.trim()) return files
    return filterNodes(files, searchQuery.trim())
  }, [files, searchQuery])

  useEffect(() => {
    if (showSearch) requestAnimationFrame(() => searchRef.current?.focus())
  }, [showSearch])

  useEffect(() => {
    if (showNewFile) requestAnimationFrame(() => newFileRef.current?.focus())
  }, [showNewFile])

  // Ctrl+F to search files
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey) {
        const el = document.querySelector('[data-file-tree]')
        if (el) {
          e.preventDefault()
          setShowSearch(true)
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleCreateFile = useCallback(() => {
    const path = newFilePath.trim()
    if (!path || !onFileCreate) return
    onFileCreate(path)
    setNewFilePath('')
    setShowNewFile(false)
    toast.success('File created', { description: path, duration: 2000 })
  }, [newFilePath, onFileCreate])

  return (
    <div className="h-full bg-pi-panel border-r border-pi-border flex flex-col" data-file-tree role="tree" aria-label="File explorer">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 sm:py-2 border-b border-pi-border shrink-0">
        <span className="text-xs sm:text-[10px] uppercase tracking-wider text-pi-text-dim font-semibold">
          Files
        </span>
        <div className="flex items-center gap-0.5">
          {onFileCreate && (
            <button
              onClick={() => { setShowNewFile(prev => !prev); if (showNewFile) setNewFilePath('') }}
              className={cn(
                'p-2 sm:p-1 rounded transition-colors',
                showNewFile ? 'text-pi-accent bg-pi-accent/10' : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface',
              )}
              title="New file"
              aria-label="New file"
            >
              <FilePlus className="w-4 h-4 sm:w-3 sm:h-3" />
            </button>
          )}
          <button
            onClick={() => { setShowSearch(prev => !prev); if (showSearch) setSearchQuery('') }}
            className={cn(
              'p-2 sm:p-1 rounded transition-colors',
              showSearch ? 'text-pi-accent bg-pi-accent/10' : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface',
            )}
            title="Search files (Ctrl+F)"
            aria-label="Search files"
          >
            <Search className="w-4 h-4 sm:w-3 sm:h-3" />
          </button>
        </div>
      </div>

      {/* New file input */}
      {showNewFile && (
        <div className="px-2 py-1.5 border-b border-pi-border animate-fade-in">
          <div className="relative">
            <FilePlus className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-pi-accent" />
            <input
              ref={newFileRef}
              value={newFilePath}
              onChange={e => setNewFilePath(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateFile()
                if (e.key === 'Escape') { setShowNewFile(false); setNewFilePath('') }
              }}
              placeholder="path/to/file.tsx"
              aria-label="New file path"
              className="w-full pl-7 pr-7 py-2 sm:py-1 text-xs sm:text-[11px] bg-pi-surface border border-pi-accent/50 rounded-md text-pi-text outline-none focus:border-pi-accent focus:ring-2 focus:ring-pi-accent/20 placeholder:text-pi-text-dim/50"
            />
            {newFilePath && (
              <button
                onClick={handleCreateFile}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-pi-accent hover:text-pi-accent-hover"
                title="Create file (Enter)"
                aria-label="Create file"
              >
                <Check className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search input */}
      {showSearch && (
        <div className="px-2 py-1.5 border-b border-pi-border animate-fade-in">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-pi-text-dim" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setShowSearch(false); setSearchQuery('') } }}
              placeholder="Filter files..."
              aria-label="Filter files"
              className="w-full pl-7 pr-7 py-2 sm:py-1 text-xs sm:text-[11px] bg-pi-surface border border-pi-border rounded-md text-pi-text outline-none focus:border-pi-accent/50 placeholder:text-pi-text-dim/50"
            />
            {searchQuery && (
              <span className="absolute right-7 top-1/2 -translate-y-1/2 text-[9px] text-pi-text-dim/50 tabular-nums">
                {filteredFiles.length} result{filteredFiles.length !== 1 ? 's' : ''}
              </span>
            )}
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-pi-text-dim hover:text-pi-text"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mobile breadcrumbs — show current file path */}
      {activeFile && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-pi-border text-[10px] text-pi-text-dim font-mono overflow-x-auto whitespace-nowrap md:hidden shrink-0">
          {activeFile.split('/').map((segment, i, arr) => (
            <span key={i} className="flex items-center gap-0.5">
              {i > 0 && <ChevronRight className="w-2.5 h-2.5 shrink-0 opacity-40" />}
              <span className={cn(
                'px-0.5 rounded',
                i === arr.length - 1 ? 'text-pi-text font-medium' : 'text-pi-text-dim',
              )}>{segment}</span>
            </span>
          ))}
        </div>
      )}

      {/* Recently Modified section */}
      {modifiedFiles && modifiedFiles.size > 0 && !searchQuery && (
        <div className="border-b border-pi-border shrink-0">
          <div className="px-3 py-1.5 flex items-center justify-between">
            <span className="text-[9px] uppercase tracking-wider text-pi-accent/70 font-semibold">
              Modified ({modifiedFiles.size})
            </span>
          </div>
          <div className="px-1 pb-1.5 space-y-px max-h-[120px] overflow-y-auto">
            {[...modifiedFiles].map(path => {
              const name = path.split('/').pop() || path
              const diff = fileDiffs?.get(path)
              return (
                <button
                  key={path}
                  onClick={() => onFileSelect(path)}
                  className={cn(
                    'w-full flex items-center gap-1.5 px-2 py-1 text-left text-[11px] rounded-md transition-colors group',
                    activeFile === path ? 'bg-pi-accent/10 text-pi-accent' : 'text-pi-text-dim hover:bg-pi-surface hover:text-pi-text',
                  )}
                >
                  <FileTypeDot name={name} />
                  <span className="truncate flex-1 font-mono">{name}</span>
                  {diff && (
                    <span className="text-[9px] tabular-nums shrink-0">
                      {diff.added > 0 && <span className="text-emerald-500">+{diff.added}</span>}
                      {diff.added > 0 && diff.removed > 0 && ' '}
                      {diff.removed > 0 && <span className="text-red-400">-{diff.removed}</span>}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto py-1 scroll-fade-bottom">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 py-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-pi-accent/10 to-purple-500/10 flex items-center justify-center mb-3 animate-breathe">
              <FileText className="w-5 h-5 text-pi-accent/50" />
            </div>
            <p className="text-xs font-medium text-pi-text-dim text-center">No files yet</p>
            <p className="text-[10px] text-pi-text-dim/60 text-center mt-1 max-w-[180px]">
              Describe what you want to build in the chat to get started
            </p>
            {onFileCreate && (
              <button
                onClick={() => setShowNewFile(true)}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-pi-accent hover:bg-pi-accent/10 rounded-lg transition-colors"
              >
                <FilePlus className="w-3 h-3" />
                Create a file
              </button>
            )}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="px-3 py-6 text-center text-pi-text-dim text-[11px]">
            No files matching &ldquo;{searchQuery}&rdquo;
          </div>
        ) : (
          <TreeNodes
            nodes={filteredFiles}
            activeFile={activeFile}
            onFileSelect={onFileSelect}
            onFileDelete={onFileDelete}
            onFileRename={onFileRename}
            fileContents={fileContents}
            modifiedFiles={modifiedFiles}
            aiEditingFiles={aiEditingFiles}
            fileDiffs={fileDiffs}
            depth={0}
            forceExpand={!!searchQuery}
          />
        )}
      </div>
    </div>
  )
})

function TreeNodes({
  nodes, activeFile, onFileSelect, onFileDelete, onFileRename, fileContents, modifiedFiles,
  aiEditingFiles, fileDiffs, depth, forceExpand,
}: {
  nodes: FileNode[]
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileDelete?: (path: string) => void
  onFileRename?: (oldPath: string, newPath: string) => void
  fileContents?: Record<string, string>
  modifiedFiles?: Set<string>
  aiEditingFiles?: Set<string>
  fileDiffs?: Map<string, { added: number; removed: number }>
  depth: number
  forceExpand?: boolean
}) {
  return (
    <>
      {nodes.map(node => (
        <TreeItem
          key={node.path}
          node={node}
          activeFile={activeFile}
          onFileSelect={onFileSelect}
          onFileDelete={onFileDelete}
          onFileRename={onFileRename}
          fileContents={fileContents}
          modifiedFiles={modifiedFiles}
          aiEditingFiles={aiEditingFiles}
          fileDiffs={fileDiffs}
          depth={depth}
          forceExpand={forceExpand}
        />
      ))}
    </>
  )
}

function TreeItem({
  node, activeFile, onFileSelect, onFileDelete, onFileRename, fileContents, modifiedFiles,
  aiEditingFiles, fileDiffs, depth, forceExpand,
}: {
  node: FileNode
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileDelete?: (path: string) => void
  onFileRename?: (oldPath: string, newPath: string) => void
  fileContents?: Record<string, string>
  modifiedFiles?: Set<string>
  aiEditingFiles?: Set<string>
  fileDiffs?: Map<string, { added: number; removed: number }>
  depth: number
  forceExpand?: boolean
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const isExpanded = forceExpand || expanded
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState<{ x: number; y: number } | null>(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState(node.name)
  const [copied, setCopied] = useState(false)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)

  const isDir = node.type === 'directory'
  const isActive = activeFile === node.path
  const isModified = !isDir && modifiedFiles?.has(node.path)

  // Cleanup copy badge timer on unmount
  useEffect(() => () => { if (copyTimerRef.current) clearTimeout(copyTimerRef.current) }, [])

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setShowContextMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Focus input when renaming starts
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isRenaming])

  const handleRename = () => {
    if (newName && newName !== node.name && onFileRename) {
      const parentDir = node.path.substring(0, node.path.lastIndexOf('/') + 1)
      const newPath = parentDir + newName
      onFileRename(node.path, newPath)
    }
    setIsRenaming(false)
    setNewName(node.name)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleRename()
    else if (e.key === 'Escape') { setIsRenaming(false); setNewName(node.name) }
  }

  const handleCopyContents = () => {
    if (!fileContents || !fileContents[node.path]) return
    navigator.clipboard.writeText(fileContents[node.path]).then(() => {
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 2000)
      toast.success('Copied to clipboard', { description: node.name, duration: 1500 })
    }).catch(() => {})
    setShowContextMenu(false)
  }

  return (
    <div className="relative">
      <div className="flex items-center group">
        {/* Indent guide lines — one per ancestor depth level */}
        {depth > 0 && Array.from({ length: depth }, (_, i) => (
          <span
            key={i}
            className="absolute top-0 bottom-0 border-l border-pi-border/40 group-hover:border-pi-border/60 transition-colors"
            style={{ left: `${i * 12 + 13}px` }}
            aria-hidden="true"
          />
        ))}
        <button
          onClick={() => {
            if (isDir) setExpanded(!expanded)
            else onFileSelect(node.path)
          }}
          role="treeitem"
          aria-expanded={isDir ? isExpanded : undefined}
          aria-label={isDir ? `${node.name} folder` : node.name}
          className={cn(
            'flex items-center gap-1.5 sm:gap-1 flex-1 text-left px-2 py-2.5 sm:py-[5px] text-xs sm:text-[12px] hover:bg-pi-surface-hover/50 transition-all duration-150 min-h-[44px] sm:min-h-0 border-l-2',
            isActive && !isDir && 'bg-pi-accent/10 text-pi-accent border-l-pi-accent',
            !isActive && !isDir && 'text-pi-text-dim hover:text-pi-text border-l-transparent hover:translate-x-0.5',
            !isActive && isDir && 'text-pi-text-dim hover:text-pi-text border-l-transparent',
            !isDir && aiEditingFiles?.has(node.path) && 'animate-ai-edit-pulse',
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isDir ? (
            <>
              <ChevronRight className={cn('w-3 h-3 shrink-0 text-pi-text-dim transition-transform duration-200', isExpanded && 'rotate-90')} />
              {isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-500 transition-colors" />
              ) : (
                <Folder className="w-3.5 h-3.5 shrink-0 text-amber-400 transition-colors" />
              )}
              {node.children && (
                <span className="text-[9px] text-pi-text-dim/40 ml-0.5">({node.children.length})</span>
              )}
            </>
          ) : (
            <>
              <span className="w-3 shrink-0" />
              <FileTypeDot name={node.name} />
            </>
          )}

          {isRenaming ? (
            <input
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={handleKeyDown}
              className="ml-1 bg-pi-surface border border-pi-accent rounded px-1 py-0 text-[12px] text-pi-text outline-none focus:ring-2 focus:ring-pi-accent/30 flex-1 min-w-0"
            />
          ) : (
            <>
              <span className={cn('truncate ml-1', isModified && 'text-amber-500 dark:text-amber-400')} title={node.path}>
                {node.name}
              </span>
              {!isDir && fileDiffs?.get(node.path) && (() => {
                const diff = fileDiffs.get(node.path)!
                return (
                  <span className="text-[9px] font-mono ml-auto mr-1 shrink-0 flex gap-0.5">
                    {diff.added > 0 && <span className="text-emerald-500">+{diff.added}</span>}
                    {diff.removed > 0 && <span className="text-pi-danger">-{diff.removed}</span>}
                  </span>
                )
              })()}
              {isModified && !fileDiffs?.get(node.path) && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 ml-auto mr-1 modified-dot-pulse" title="Modified" />
              )}
            </>
          )}
        </button>

        {/* Context menu trigger */}
        {!isDir && (onFileDelete || onFileRename || fileContents) && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              const rect = (e.target as HTMLElement).getBoundingClientRect()
              setContextMenuPos({ x: rect.right - 140, y: rect.bottom + 4 })
              setShowContextMenu(!showContextMenu)
            }}
            className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100 p-2 sm:p-1 hover:bg-pi-surface hover:rotate-90 rounded transition-all duration-150 mr-1"
            aria-label="File options"
            title="More options"
          >
            <MoreHorizontal className="w-4 h-4 sm:w-3 sm:h-3 text-pi-text-dim" />
          </button>
        )}
      </div>

      {/* Context menu */}
      {showContextMenu && !isDir && contextMenuPos && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-pi-panel border border-pi-border rounded-lg shadow-lg py-1 min-w-[140px] animate-scale-in origin-top-right"
          style={{ left: Math.min(contextMenuPos.x, window.innerWidth - 160), top: Math.min(contextMenuPos.y, window.innerHeight - 200) }}
        >
          {onFileRename && (
            <button
              onClick={() => {
                setIsRenaming(true)
                setShowContextMenu(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 sm:py-1.5 text-sm sm:text-xs text-pi-text hover:bg-pi-surface transition-colors"
            >
              <Edit3 className="w-4 h-4 sm:w-3 sm:h-3" />
              Rename
            </button>
          )}
          <button
            onClick={() => {
              navigator.clipboard.writeText(node.path).catch(() => {})
              toast.success('Path copied', { duration: 1500 })
              setShowContextMenu(false)
            }}
            className="flex items-center gap-2 w-full px-3 py-2.5 sm:py-1.5 text-sm sm:text-xs text-pi-text hover:bg-pi-surface transition-colors"
          >
            <Copy className="w-4 h-4 sm:w-3 sm:h-3" />
            Copy path
          </button>
          {fileContents && fileContents[node.path] !== undefined && (
            <button
              onClick={handleCopyContents}
              className="flex items-center gap-2 w-full px-3 py-2.5 sm:py-1.5 text-sm sm:text-xs text-pi-text hover:bg-pi-surface transition-colors"
            >
              {copied
                ? <Check className="w-4 h-4 sm:w-3 sm:h-3 text-green-500" />
                : <Copy className="w-4 h-4 sm:w-3 sm:h-3" />
              }
              Copy contents
            </button>
          )}
          {onFileDelete && (
            <button
              onClick={() => {
                onFileDelete(node.path)
                setShowContextMenu(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 sm:py-1.5 text-sm sm:text-xs text-pi-danger hover:bg-pi-danger/10 transition-colors"
            >
              <Trash2 className="w-4 h-4 sm:w-3 sm:h-3" />
              Delete
            </button>
          )}
        </div>
      )}

      {isDir && isExpanded && node.children && (
        <div role="group">
        <TreeNodes
          nodes={node.children}
          activeFile={activeFile}
          onFileSelect={onFileSelect}
          onFileDelete={onFileDelete}
          onFileRename={onFileRename}
          fileContents={fileContents}
          modifiedFiles={modifiedFiles}
          aiEditingFiles={aiEditingFiles}
          fileDiffs={fileDiffs}
          depth={depth + 1}
          forceExpand={forceExpand}
        />
        </div>
      )}
    </div>
  )
}
