'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CodeEditor } from '@/components/code-editor'
import { FileTree } from '@/components/file-tree'
import { buildTreeFromMap } from '@/lib/virtual-fs'
import { Hammer, Loader2, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'

interface SharedProject {
  name: string
  description: string
  framework: string
  files: Record<string, string>
  githubUsername: string
}

export default function SharedProjectPage() {
  const params = useParams()
  const token = params.token as string
  const [project, setProject] = useState<SharedProject | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const [viewTab, setViewTab] = useState<'code' | 'preview'>('code')

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/shared/${token}`)
        if (!res.ok) {
          setError(res.status === 404 ? 'Project not found or link expired' : 'Failed to load project')
          return
        }
        const data = await res.json()
        setProject(data)

        // Auto-select main file
        const files = Object.keys(data.files || {})
        const main = files.find(f => f === 'app/page.tsx')
          || files.find(f => f === 'src/App.tsx')
          || files.find(f => f.endsWith('.tsx'))
          || files[0]
        if (main) setActiveFile(main)
      } catch {
        setError('Network error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-forge-bg flex items-center justify-center">
        <div className="flex items-center gap-3 text-forge-text-dim">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading shared project...</span>
        </div>
      </div>
    )
  }

  if (error || !project) {
    return (
      <div className="min-h-screen bg-forge-bg flex items-center justify-center">
        <div className="text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <p className="text-sm text-forge-text">{error || 'Project not found'}</p>
        </div>
      </div>
    )
  }

  const fileTree = buildTreeFromMap(project.files)

  return (
    <div className="h-screen flex flex-col bg-forge-bg">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-forge-border bg-forge-panel">
        <Hammer className="w-4 h-4 text-forge-accent" />
        <span className="text-sm font-medium text-forge-text">{project.name}</span>
        <span className="text-xs text-forge-text-dim">by {project.githubUsername}</span>
        <span className="ml-auto text-[10px] text-forge-text-dim/50 bg-forge-surface px-2 py-0.5 rounded">
          Read-only
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={20} minSize={15}>
            <div className="h-full overflow-auto bg-forge-panel border-r border-forge-border">
              <FileTree
                files={fileTree}
                activeFile={activeFile}
                onFileSelect={setActiveFile}
                onFileDelete={() => {}}
                onFileRename={() => {}}
                onFileCreate={() => {}}
                fileContents={project.files}
                modifiedFiles={new Set()}
              />
            </div>
          </Panel>
          <PanelResizeHandle />
          <Panel defaultSize={80} minSize={40}>
            <div className="h-full flex flex-col">
              <div className="flex items-center border-b border-forge-border bg-forge-panel">
                {(['code', 'preview'] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setViewTab(tab)}
                    className={cn(
                      'relative px-4 py-2 text-xs font-medium transition-colors',
                      viewTab === tab ? 'text-forge-accent bg-forge-surface' : 'text-forge-text-dim hover:text-forge-text',
                    )}
                  >
                    {tab === 'code' ? 'Code' : 'Preview'}
                    {viewTab === tab && <span className="absolute bottom-0 left-1 right-1 h-0.5 bg-forge-accent rounded-full" />}
                  </button>
                ))}
                {activeFile && (
                  <span className="ml-3 text-xs text-forge-text-dim font-mono">{activeFile}</span>
                )}
              </div>
              <div className="flex-1 overflow-hidden">
                <CodeEditor
                  path={activeFile}
                  content={activeFile ? project.files[activeFile] || '' : ''}
                  onSave={() => {}}
                  onChange={() => {}}
                  readOnly
                />
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
    </div>
  )
}
