'use client'

import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import {
  ChevronRight, ChevronDown, FolderOpen, Folder,
  MoreHorizontal, Trash2, Edit3, Copy, FileText,
  Search, X, FilePlus, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FileNode } from '@/lib/types'
import { toast } from 'sonner'

// ─── File type color indicators (VS Code / GitHub style) ───────
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

// ─── Interfaces ────────────────────────────────────────────────
interface FileTreeProps {
  files: FileNode[]
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileDelete?: (path: string) => void
  onFileRename?: (oldPath: string, newPath: string) => void
  onFileCreate?: (path: string) => void
  fileContents?: Record<string, string>
  modifiedFiles?: Set<string>
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

// ─── FileTree ──────────────────────────────────────────────────
export function FileTree({
  files, activeFile, onFileSelect, onFileDelete, onFileRename, onFileCreate, fileContents, modifiedFiles,
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
    <div className="h-full bg-forge-panel border-r border-forge-border flex flex-col" data-file-tree>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 sm:py-2 border-b border-forge-border shrink-0">
        <span className="text-xs sm:text-[10px] uppercase tracking-wider text-forge-text-dim font-semibold">
          Files
        </span>
        <div className="flex items-center gap-0.5">
          {onFileCreate && (
            <button
              onClick={() => { setShowNewFile(prev => !prev); if (showNewFile) setNewFilePath('') }}
              className={cn(
                'p-2 sm:p-1 rounded transition-colors',
                showNewFile ? 'text-forge-accent bg-forge-accent/10' : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface',
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
              showSearch ? 'text-forge-accent bg-forge-accent/10' : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface',
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
        <div className="px-2 py-1.5 border-b border-forge-border animate-fade-in">
          <div className="relative">
            <FilePlus className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-forge-accent" />
            <input
              ref={newFileRef}
              value={newFilePath}
              onChange={e => setNewFilePath(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreateFile()
                if (e.key === 'Escape') { setShowNewFile(false); setNewFilePath('') }
              }}
              placeholder="path/to/file.tsx"
              className="w-full pl-7 pr-7 py-2 sm:py-1 text-xs sm:text-[11px] bg-forge-surface border border-forge-accent/50 rounded-md text-forge-text outline-none focus:border-forge-accent focus:ring-2 focus:ring-forge-accent/20 placeholder:text-forge-text-dim/50"
            />
            {newFilePath && (
              <button
                onClick={handleCreateFile}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-forge-accent hover:text-forge-accent-hover"
                title="Create file (Enter)"
              >
                <Check className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Search input */}
      {showSearch && (
        <div className="px-2 py-1.5 border-b border-forge-border animate-fade-in">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-forge-text-dim" />
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') { setShowSearch(false); setSearchQuery('') } }}
              placeholder="Filter files..."
              className="w-full pl-7 pr-7 py-2 sm:py-1 text-xs sm:text-[11px] bg-forge-surface border border-forge-border rounded-md text-forge-text outline-none focus:border-forge-accent/50 placeholder:text-forge-text-dim/50"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-forge-text-dim hover:text-forge-text"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto py-1">
        {files.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full px-4 py-8">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-forge-accent/10 to-purple-500/10 flex items-center justify-center mb-3">
              <FileText className="w-5 h-5 text-forge-accent/50" />
            </div>
            <p className="text-xs font-medium text-forge-text-dim text-center">No files yet</p>
            <p className="text-[10px] text-forge-text-dim/60 text-center mt-1 max-w-[180px]">
              Describe what you want to build in the chat to get started
            </p>
            {onFileCreate && (
              <button
                onClick={() => setShowNewFile(true)}
                className="mt-3 flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-forge-accent hover:bg-forge-accent/10 rounded-lg transition-colors"
              >
                <FilePlus className="w-3 h-3" />
                Create a file
              </button>
            )}
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="px-3 py-6 text-center text-forge-text-dim text-[11px]">
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
            depth={0}
            forceExpand={!!searchQuery}
          />
        )}
      </div>
    </div>
  )
}

// ─── Tree node list ────────────────────────────────────────────
function TreeNodes({
  nodes, activeFile, onFileSelect, onFileDelete, onFileRename, fileContents, modifiedFiles, depth, forceExpand,
}: {
  nodes: FileNode[]
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileDelete?: (path: string) => void
  onFileRename?: (oldPath: string, newPath: string) => void
  fileContents?: Record<string, string>
  modifiedFiles?: Set<string>
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
          depth={depth}
          forceExpand={forceExpand}
        />
      ))}
    </>
  )
}

// ─── Single tree item ──────────────────────────────────────────
function TreeItem({
  node, activeFile, onFileSelect, onFileDelete, onFileRename, fileContents, modifiedFiles, depth, forceExpand,
}: {
  node: FileNode
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileDelete?: (path: string) => void
  onFileRename?: (oldPath: string, newPath: string) => void
  fileContents?: Record<string, string>
  modifiedFiles?: Set<string>
  depth: number
  forceExpand?: boolean
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const isExpanded = forceExpand || expanded
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState(node.name)
  const [copied, setCopied] = useState(false)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const isDir = node.type === 'directory'
  const isActive = activeFile === node.path
  const isModified = !isDir && modifiedFiles?.has(node.path)

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
      const newPath = node.path.replace(node.name, newName)
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
      setTimeout(() => setCopied(false), 2000)
      toast.success('Copied to clipboard', { description: node.name, duration: 1500 })
    }).catch(() => {})
    setShowContextMenu(false)
  }

  return (
    <div className="relative">
      <div className="flex items-center group">
        <button
          onClick={() => {
            if (isDir) setExpanded(!expanded)
            else onFileSelect(node.path)
          }}
          className={cn(
            'flex items-center gap-1.5 sm:gap-1 flex-1 text-left px-2 py-2 sm:py-[5px] text-xs sm:text-[12px] hover:bg-forge-surface/80 transition-colors min-h-[36px] sm:min-h-0',
            isActive && !isDir && 'bg-forge-accent/10 text-forge-accent',
            !isActive && 'text-forge-text-dim hover:text-forge-text',
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isDir ? (
            <>
              {isExpanded ? (
                <ChevronDown className="w-3 h-3 shrink-0 text-forge-text-dim transition-transform" />
              ) : (
                <ChevronRight className="w-3 h-3 shrink-0 text-forge-text-dim transition-transform" />
              )}
              {isExpanded ? (
                <FolderOpen className="w-3.5 h-3.5 shrink-0 text-amber-500" />
              ) : (
                <Folder className="w-3.5 h-3.5 shrink-0 text-amber-400" />
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
              className="ml-1 bg-forge-surface border border-forge-accent rounded px-1 py-0 text-[12px] text-forge-text outline-none focus:ring-2 focus:ring-forge-accent/30 flex-1 min-w-0"
            />
          ) : (
            <span className={cn('truncate ml-1', isModified && 'text-amber-500 dark:text-amber-400')} title={node.path}>
              {node.name}
            </span>
            {isModified && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 ml-auto mr-1" title="Modified" />
            )}
          )}
        </button>

        {/* Context menu trigger */}
        {!isDir && (onFileDelete || onFileRename || fileContents) && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowContextMenu(!showContextMenu)
            }}
            className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100 p-2 sm:p-1 hover:bg-forge-surface rounded transition-all mr-1"
            aria-label="File options"
            title="More options"
          >
            <MoreHorizontal className="w-4 h-4 sm:w-3 sm:h-3 text-forge-text-dim" />
          </button>
        )}
      </div>

      {/* Context menu */}
      {showContextMenu && !isDir && (
        <div
          ref={contextMenuRef}
          className="absolute right-2 top-6 z-50 bg-forge-panel border border-forge-border rounded-lg shadow-lg py-1 min-w-[140px] animate-scale-in"
        >
          {onFileRename && (
            <button
              onClick={() => {
                setIsRenaming(true)
                setShowContextMenu(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-2.5 sm:py-1.5 text-sm sm:text-xs text-forge-text hover:bg-forge-surface transition-colors"
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
            className="flex items-center gap-2 w-full px-3 py-2.5 sm:py-1.5 text-sm sm:text-xs text-forge-text hover:bg-forge-surface transition-colors"
          >
            <Copy className="w-4 h-4 sm:w-3 sm:h-3" />
            Copy path
          </button>
          {fileContents && fileContents[node.path] !== undefined && (
            <button
              onClick={handleCopyContents}
              className="flex items-center gap-2 w-full px-3 py-2.5 sm:py-1.5 text-sm sm:text-xs text-forge-text hover:bg-forge-surface transition-colors"
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
              className="flex items-center gap-2 w-full px-3 py-2.5 sm:py-1.5 text-sm sm:text-xs text-forge-danger hover:bg-forge-danger/10 transition-colors"
            >
              <Trash2 className="w-4 h-4 sm:w-3 sm:h-3" />
              Delete
            </button>
          )}
        </div>
      )}

      {isDir && isExpanded && node.children && (
        <TreeNodes
          nodes={node.children}
          activeFile={activeFile}
          onFileSelect={onFileSelect}
          onFileDelete={onFileDelete}
          onFileRename={onFileRename}
          fileContents={fileContents}
          modifiedFiles={modifiedFiles}
          depth={depth + 1}
          forceExpand={forceExpand}
        />
      )}
    </div>
  )
}
