'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  ArrowLeft, FileText, FolderOpen, Play, Loader2,
  ChevronRight, Star, Code2, BookOpen, Beaker,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { OutputViewer } from './output-viewer'
import type { ProjectManifest, ProjectOutput } from '@/lib/brain/brain-types'

interface ProjectDetailProps {
  project: ProjectManifest
  onBack: () => void
}

type DetailTab = 'overview' | 'files' | 'outputs' | 'run'

interface FileEntry {
  path: string
  size: number
  isDir: boolean
}

const categoryIcons: Record<string, React.ElementType> = {
  code: Code2,
  creative: BookOpen,
  research: Beaker,
  hardware: Play,
  tool: FileText,
  experiment: Beaker,
}

export function ProjectDetail({ project, onBack }: ProjectDetailProps) {
  const [tab, setTab] = useState<DetailTab>('overview')
  const [files, setFiles] = useState<FileEntry[]>([])
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [fileContent, setFileContent] = useState<string | null>(null)
  const [fileLoading, setFileLoading] = useState(false)
  const [runOutput, setRunOutput] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [outputContents, setOutputContents] = useState<Record<string, string | null>>({})
  const [loadingOutputs, setLoadingOutputs] = useState<Set<string>>(new Set())

  // Fetch file listing
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/brain/projects?id=${project.id}`)
        if (res.ok) {
          const data = await res.json()
          setFiles(data.files || [])
        }
      } catch { /* ignore */ }
    }
    load()
  }, [project.id])

  // Fetch file content
  const loadFile = useCallback(async (path: string) => {
    setSelectedFile(path)
    setFileLoading(true)
    try {
      const res = await fetch(`/api/brain/projects/${project.id}/files?path=${encodeURIComponent(path)}`)
      if (res.ok) {
        const data = await res.json()
        setFileContent(data.content)
      } else {
        setFileContent(null)
      }
    } catch {
      setFileContent(null)
    }
    setFileLoading(false)
  }, [project.id])

  // Fetch output content
  const loadOutput = useCallback(async (output: ProjectOutput) => {
    if (outputContents[output.path] !== undefined) return
    setLoadingOutputs(prev => new Set(prev).add(output.path))
    try {
      const res = await fetch(`/api/brain/projects/${project.id}/files?path=${encodeURIComponent(output.path)}`)
      if (res.ok) {
        const data = await res.json()
        setOutputContents(prev => ({ ...prev, [output.path]: data.content }))
      } else {
        setOutputContents(prev => ({ ...prev, [output.path]: null }))
      }
    } catch {
      setOutputContents(prev => ({ ...prev, [output.path]: null }))
    }
    setLoadingOutputs(prev => {
      const next = new Set(prev)
      next.delete(output.path)
      return next
    })
  }, [project.id, outputContents])

  // Run project
  const handleRun = useCallback(async () => {
    if (!project.runCommand || running) return
    setRunning(true)
    setRunOutput(null)
    try {
      const res = await fetch('/api/brain/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'run', id: project.id }),
      })
      const data = await res.json()
      setRunOutput(data.output || data.error || 'No output')
    } catch (err) {
      setRunOutput(`Error: ${err instanceof Error ? err.message : 'unknown'}`)
    }
    setRunning(false)
  }, [project.id, project.runCommand, running])

  const CategoryIcon = categoryIcons[project.category] || FileText
  const outputs = project.outputs || []
  const tabs: { id: DetailTab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'files', label: 'Files', count: files.filter(f => !f.isDir).length },
    { id: 'outputs', label: 'Outputs', count: outputs.length },
    ...(project.runCommand ? [{ id: 'run' as DetailTab, label: 'Run' }] : []),
  ]

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm">
        <button onClick={onBack} className="p-1 rounded hover:bg-pi-surface transition-colors" title="Back">
          <ArrowLeft className="w-3.5 h-3.5 text-pi-text-dim" />
        </button>
        <CategoryIcon className="w-4 h-4 text-pi-accent" />
        <span className="text-xs font-bold text-pi-text truncate">{project.name}</span>
        <span className={cn(
          'text-[8px] px-1.5 py-px rounded-full font-medium border capitalize ml-1',
          project.status === 'showcase' ? 'bg-purple-500/10 text-purple-500 border-purple-500/20' :
          project.status === 'running' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
          project.status === 'building' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
          'bg-gray-500/10 text-gray-500 border-gray-500/20'
        )}>
          {project.status}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 border-b border-pi-border/50 bg-pi-panel/50">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'text-[10px] px-3 py-1 rounded-full font-medium transition-all',
              tab === t.id
                ? 'bg-pi-accent/10 text-pi-accent border border-pi-accent/30'
                : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface border border-transparent'
            )}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1 text-[8px] opacity-60">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Overview */}
        {tab === 'overview' && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-pi-text leading-relaxed">{project.description}</p>

            {project.goalId && (
              <div className="text-[10px] text-pi-text-dim">
                Linked to goal: <span className="font-mono text-pi-accent">{project.goalId.slice(0, 8)}</span>
              </div>
            )}

            {project.tags && project.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {project.tags.map(tag => (
                  <span key={tag} className="text-[9px] px-2 py-0.5 rounded-full bg-pi-surface border border-pi-border text-pi-text-dim">
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="bg-pi-surface/50 rounded-lg p-2 border border-pi-border/50">
                <span className="text-pi-text-dim">Category</span>
                <p className="text-pi-text font-medium capitalize">{project.category}</p>
              </div>
              <div className="bg-pi-surface/50 rounded-lg p-2 border border-pi-border/50">
                <span className="text-pi-text-dim">Created</span>
                <p className="text-pi-text font-medium">{new Date(project.createdAt).toLocaleDateString()}</p>
              </div>
              {project.entrypoint && (
                <div className="bg-pi-surface/50 rounded-lg p-2 border border-pi-border/50">
                  <span className="text-pi-text-dim">Entrypoint</span>
                  <p className="text-pi-text font-mono">{project.entrypoint}</p>
                </div>
              )}
              <div className="bg-pi-surface/50 rounded-lg p-2 border border-pi-border/50">
                <span className="text-pi-text-dim">Outputs</span>
                <p className="text-pi-text font-medium">{outputs.length}</p>
              </div>
            </div>

            {/* Featured outputs preview */}
            {outputs.filter(o => o.featured).length > 0 && (
              <div>
                <h4 className="text-[10px] font-bold text-pi-text uppercase tracking-wider mb-2">Featured</h4>
                {outputs.filter(o => o.featured).map(output => (
                  <button
                    key={output.path}
                    onClick={() => { setTab('outputs'); loadOutput(output) }}
                    className="w-full flex items-center gap-2 p-2 rounded-lg bg-pi-accent/5 border border-pi-accent/20 hover:bg-pi-accent/10 transition-colors text-left"
                  >
                    <Star className="w-3 h-3 text-pi-accent shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-pi-text truncate">{output.title}</p>
                      <p className="text-[9px] text-pi-text-dim">{output.type}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Files */}
        {tab === 'files' && (
          <div className="flex h-full">
            {/* File tree */}
            <div className="w-48 border-r border-pi-border/50 overflow-y-auto">
              {files.length === 0 ? (
                <p className="text-[10px] text-pi-text-dim text-center py-4">No files</p>
              ) : (
                <div className="py-1">
                  {files.filter(f => !f.isDir).map(file => (
                    <button
                      key={file.path}
                      onClick={() => loadFile(file.path)}
                      className={cn(
                        'w-full text-left px-3 py-1 text-[10px] font-mono truncate hover:bg-pi-surface transition-colors',
                        selectedFile === file.path ? 'text-pi-accent bg-pi-accent/5' : 'text-pi-text-dim'
                      )}
                      title={file.path}
                    >
                      <ChevronRight className="w-2 h-2 inline mr-1 opacity-30" />
                      {file.path}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* File viewer */}
            <div className="flex-1 overflow-auto">
              {!selectedFile ? (
                <div className="flex items-center justify-center h-full text-pi-text-dim text-[10px]">
                  Select a file to view
                </div>
              ) : fileLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-4 h-4 text-pi-accent animate-spin" />
                </div>
              ) : fileContent !== null ? (
                <pre className="p-3 text-[10px] font-mono text-pi-text leading-relaxed whitespace-pre-wrap overflow-x-auto">
                  {fileContent}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-full text-pi-text-dim text-[10px]">
                  Could not read file
                </div>
              )}
            </div>
          </div>
        )}

        {/* Outputs */}
        {tab === 'outputs' && (
          <div className="p-3 space-y-3">
            {outputs.length === 0 ? (
              <div className="text-center py-8 text-pi-text-dim text-xs">No outputs yet</div>
            ) : (
              outputs.map(output => (
                <div key={output.path} className="border border-pi-border rounded-lg overflow-hidden bg-pi-surface/30">
                  <button
                    onClick={() => loadOutput(output)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-pi-surface/50 transition-colors text-left"
                  >
                    {output.featured && <Star className="w-3 h-3 text-yellow-500 shrink-0" />}
                    <FolderOpen className="w-3 h-3 text-pi-text-dim shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-pi-text truncate">{output.title}</p>
                      {output.description && (
                        <p className="text-[9px] text-pi-text-dim truncate">{output.description}</p>
                      )}
                    </div>
                    <span className="text-[8px] px-1.5 py-px rounded-full bg-pi-surface border border-pi-border text-pi-text-dim capitalize">
                      {output.type}
                    </span>
                  </button>

                  <AnimatePresence>
                    {outputContents[output.path] !== undefined && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-pi-border/50 overflow-hidden"
                      >
                        <OutputViewer
                          output={output}
                          content={outputContents[output.path]}
                          loading={loadingOutputs.has(output.path)}
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))
            )}
          </div>
        )}

        {/* Run */}
        {tab === 'run' && project.runCommand && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <code className="text-[10px] font-mono text-pi-text-dim bg-pi-surface px-2 py-1 rounded flex-1">
                {project.runCommand}
              </code>
              <button
                onClick={handleRun}
                disabled={running}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-medium transition-all',
                  running
                    ? 'bg-pi-surface text-pi-text-dim cursor-not-allowed'
                    : 'bg-pi-accent text-white hover:bg-pi-accent-hover'
                )}
              >
                {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                {running ? 'Running...' : 'Run'}
              </button>
            </div>

            {runOutput !== null && (
              <motion.pre
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-3 text-[10px] font-mono text-pi-text leading-relaxed bg-[#0d0d14] rounded-lg border border-pi-border overflow-x-auto whitespace-pre-wrap max-h-[400px] overflow-y-auto"
              >
                {runOutput}
              </motion.pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
