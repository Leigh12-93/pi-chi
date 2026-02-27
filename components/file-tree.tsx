'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronRight, ChevronDown, FolderOpen, Folder, MoreHorizontal, Trash2, Edit3, Copy, FileText } from 'lucide-react'
import { cn, getFileIcon } from '@/lib/utils'
import type { FileNode } from '@/lib/types'

interface FileTreeProps {
  files: FileNode[]
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileDelete?: (path: string) => void
  onFileRename?: (oldPath: string, newPath: string) => void
}

export function FileTree({ files, activeFile, onFileSelect, onFileDelete, onFileRename }: FileTreeProps) {
  return (
    <div className="h-full bg-forge-panel border-r border-forge-border flex flex-col">
      <div className="px-3 py-2.5 border-b border-forge-border shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-forge-text-dim font-semibold">
          Files
        </span>
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {files.length === 0 ? (
          <div className="px-3 py-8 text-center text-forge-text-dim text-xs">
            No files yet. Start a conversation to create your project.
          </div>
        ) : (
          <TreeNodes 
            nodes={files} 
            activeFile={activeFile} 
            onFileSelect={onFileSelect} 
            onFileDelete={onFileDelete}
            onFileRename={onFileRename}
            depth={0} 
          />
        )}
      </div>
    </div>
  )
}

function TreeNodes({
  nodes, activeFile, onFileSelect, onFileDelete, onFileRename, depth,
}: {
  nodes: FileNode[]
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileDelete?: (path: string) => void
  onFileRename?: (oldPath: string, newPath: string) => void
  depth: number
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
          depth={depth} 
        />
      ))}
    </>
  )
}

function TreeItem({
  node, activeFile, onFileSelect, onFileDelete, onFileRename, depth,
}: {
  node: FileNode
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileDelete?: (path: string) => void
  onFileRename?: (oldPath: string, newPath: string) => void
  depth: number
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState(node.name)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const isDir = node.type === 'directory'
  const isActive = activeFile === node.path

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
    if (e.key === 'Enter') {
      handleRename()
    } else if (e.key === 'Escape') {
      setIsRenaming(false)
      setNewName(node.name)
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center group">
        <button
          onClick={() => {
            if (isDir) {
              setExpanded(!expanded)
            } else {
              onFileSelect(node.path)
            }
          }}
          className={cn(
            'flex items-center gap-1 flex-1 text-left px-2 py-[3px] text-[12px] hover:bg-forge-surface/80 transition-colors',
            isActive && !isDir && 'bg-forge-accent/10 text-forge-accent',
            !isActive && 'text-forge-text-dim hover:text-forge-text',
          )}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {isDir ? (
            <>
              {expanded ? (
                <ChevronDown className="w-3 h-3 shrink-0 text-forge-text-dim" />
              ) : (
                <ChevronRight className="w-3 h-3 shrink-0 text-forge-text-dim" />
              )}
              {expanded ? (
                <FolderOpen className="w-3.5 h-3.5 shrink-0 text-yellow-500/70" />
              ) : (
                <Folder className="w-3.5 h-3.5 shrink-0 text-yellow-500/50" />
              )}
            </>
          ) : (
            <>
              <span className="w-3 shrink-0" />
              <span className="text-[11px] shrink-0">{getFileIcon(node.name)}</span>
            </>
          )}
          
          {isRenaming ? (
            <input
              ref={inputRef}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onBlur={handleRename}
              onKeyDown={handleKeyDown}
              className="ml-1 bg-forge-surface border border-forge-accent rounded px-1 py-0 text-[12px] text-forge-text outline-none flex-1 min-w-0"
            />
          ) : (
            <span className="truncate ml-1">{node.name}</span>
          )}
        </button>

        {/* Context menu trigger */}
        {!isDir && (onFileDelete || onFileRename) && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowContextMenu(!showContextMenu)
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-forge-surface rounded transition-all mr-1"
          >
            <MoreHorizontal className="w-3 h-3 text-forge-text-dim" />
          </button>
        )}
      </div>

      {/* Context menu */}
      {showContextMenu && !isDir && (
        <div
          ref={contextMenuRef}
          className="absolute right-2 top-6 z-50 bg-forge-panel border border-forge-border rounded-lg shadow-lg py-1 min-w-[120px]"
        >
          {onFileRename && (
            <button
              onClick={() => {
                setIsRenaming(true)
                setShowContextMenu(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-forge-text hover:bg-forge-surface transition-colors"
            >
              <Edit3 className="w-3 h-3" />
              Rename
            </button>
          )}
          <button
            onClick={() => {
              navigator.clipboard.writeText(node.path)
              setShowContextMenu(false)
            }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-forge-text hover:bg-forge-surface transition-colors"
          >
            <Copy className="w-3 h-3" />
            Copy path
          </button>
          {onFileDelete && (
            <button
              onClick={() => {
                onFileDelete(node.path)
                setShowContextMenu(false)
              }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-forge-danger hover:bg-forge-danger/10 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Delete
            </button>
          )}
        </div>
      )}

      {isDir && expanded && node.children && (
        <TreeNodes 
          nodes={node.children} 
          activeFile={activeFile} 
          onFileSelect={onFileSelect}
          onFileDelete={onFileDelete}
          onFileRename={onFileRename}
          depth={depth + 1} 
        />
      )}
    </div>
  )
}
