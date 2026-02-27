'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, FolderOpen, Folder } from 'lucide-react'
import { cn, getFileIcon } from '@/lib/utils'
import type { FileNode } from '@/lib/types'

interface FileTreeProps {
  files: FileNode[]
  activeFile: string | null
  onFileSelect: (path: string) => void
}

export function FileTree({ files, activeFile, onFileSelect }: FileTreeProps) {
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
          <TreeNodes nodes={files} activeFile={activeFile} onFileSelect={onFileSelect} depth={0} />
        )}
      </div>
    </div>
  )
}

function TreeNodes({
  nodes, activeFile, onFileSelect, depth,
}: {
  nodes: FileNode[]
  activeFile: string | null
  onFileSelect: (path: string) => void
  depth: number
}) {
  return (
    <>
      {nodes.map(node => (
        <TreeItem key={node.path} node={node} activeFile={activeFile} onFileSelect={onFileSelect} depth={depth} />
      ))}
    </>
  )
}

function TreeItem({
  node, activeFile, onFileSelect, depth,
}: {
  node: FileNode
  activeFile: string | null
  onFileSelect: (path: string) => void
  depth: number
}) {
  const [expanded, setExpanded] = useState(depth < 2)
  const isDir = node.type === 'directory'
  const isActive = activeFile === node.path

  return (
    <div>
      <button
        onClick={() => {
          if (isDir) {
            setExpanded(!expanded)
          } else {
            onFileSelect(node.path)
          }
        }}
        className={cn(
          'flex items-center gap-1 w-full text-left px-2 py-[3px] text-[12px] hover:bg-forge-surface/80 transition-colors',
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
        <span className="truncate ml-1">{node.name}</span>
      </button>

      {isDir && expanded && node.children && (
        <TreeNodes nodes={node.children} activeFile={activeFile} onFileSelect={onFileSelect} depth={depth + 1} />
      )}
    </div>
  )
}
