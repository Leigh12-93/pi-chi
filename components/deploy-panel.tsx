'use client'

import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from 'react'
import { Loader2, CheckCircle, XCircle, ExternalLink, Copy, Check, ChevronDown, ChevronUp, X, RefreshCw, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DeployProgress {
  stage: string
  message: string
  logs: string[]
  elapsed: number
  url?: string
  framework?: string
  fileCount?: number
}

interface DeployPanelProps {
  projectId: string | null
  files: Record<string, string>
  projectName: string
  onClose: () => void
  onSuccess?: (result: Record<string, unknown>) => void
  onFix?: (error: string) => void
}

const STAGES = [
  { key: 'upload', label: 'Upload' },
  { key: 'build', label: 'Build' },
  { key: 'ready', label: 'Deploy' },
]

export function DeployPanel({ projectId, files, projectName, onClose, onSuccess, onFix }: DeployPanelProps) {
  const [status, setStatus] = useState<'deploying' | 'success' | 'error'>('deploying')
  const [progressText, setProgressText] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isBuildError, setIsBuildError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const logsRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const filesRef = useRef(files)
  const onSuccessRef = useRef(onSuccess)
  filesRef.current = files
  onSuccessRef.current = onSuccess

  const deployProgress = useMemo<DeployProgress | null>(() => {
    if (!progressText) return null
    try { return JSON.parse(progressText) } catch { return null }
  }, [progressText])

  // Elapsed timer
  useEffect(() => {
    if (status === 'deploying') {
      setElapsed(0)
      timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000)
    } else {
      if (timerRef.current) clearInterval(timerRef.current)
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [status])

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [progressText])

  // Start deploy on mount or retry
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current)
    if (timerRef.current) clearInterval(timerRef.current)

    const currentFiles = filesRef.current

    const start = async () => {
      try {
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            type: 'deploy',
            params: { projectName, files: currentFiles },
          }),
        })

        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error || `HTTP ${res.status}`)
        }

        const { taskId } = await res.json()
        const pollStart = Date.now()

        pollRef.current = setInterval(async () => {
          if (Date.now() - pollStart > 5 * 60 * 1000) {
            if (pollRef.current) clearInterval(pollRef.current)
            setStatus('error')
            setError('Deployment timed out. Check Vercel dashboard.')
            return
          }

          try {
            const statusRes = await fetch(`/api/tasks/${taskId}`)
            if (!statusRes.ok) return
            const task = await statusRes.json()

            if (task.progress) setProgressText(task.progress)

            if (task.status === 'completed') {
              if (pollRef.current) clearInterval(pollRef.current)
              setResult(task.result || {})
              setStatus('success')
              onSuccessRef.current?.(task.result || {})
            } else if (task.status === 'failed') {
              if (pollRef.current) clearInterval(pollRef.current)
              setIsBuildError(true)
              setStatus('error')
              setError(task.error || 'Deployment failed')
            }
          } catch { /* keep polling */ }
        }, 2000)
      } catch (err) {
        setIsBuildError(false)
        setStatus('error')
        setError(err instanceof Error ? err.message : String(err))
      }
    }

    start()

    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      if (timerRef.current) clearInterval(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryCount, projectId, projectName])

  const handleRetry = useCallback(() => {
    setStatus('deploying')
    setError('')
    setProgressText('')
    setResult(null)
    setIsBuildError(false)
    setCopied(false)
    setRetryCount(c => c + 1)
  }, [])

  const currentStage = deployProgress?.stage || 'upload'
  const stageIndex = STAGES.findIndex(s => s.key === currentStage)
  const logs = deployProgress?.logs || []

  // Collapsed indicator
  if (collapsed) {
    return (
      <div className="fixed bottom-4 right-4 z-40">
        <button
          onClick={() => setCollapsed(false)}
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg border shadow-lg text-xs font-medium transition-all',
            status === 'deploying' && 'bg-forge-bg border-forge-accent/30 text-forge-text hover:border-forge-accent/50',
            status === 'success' && 'bg-forge-bg border-emerald-500/30 text-emerald-500 hover:border-emerald-500/50',
            status === 'error' && 'bg-forge-bg border-forge-danger/30 text-forge-danger hover:border-forge-danger/50',
          )}
        >
          {status === 'deploying' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
          {status === 'success' && <CheckCircle className="w-3.5 h-3.5" />}
          {status === 'error' && <XCircle className="w-3.5 h-3.5" />}
          <span>
            {status === 'deploying' ? `Deploying... ${elapsed}s` : status === 'success' ? 'Deployed!' : 'Deploy failed'}
          </span>
          <ChevronUp className="w-3 h-3 text-forge-text-dim" />
        </button>
      </div>
    )
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 w-[420px] max-h-[70vh] rounded-xl border border-forge-border bg-forge-bg shadow-2xl flex flex-col animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-forge-border shrink-0">
        <div className="flex items-center gap-2">
          <Rocket className="w-3.5 h-3.5 text-forge-accent" />
          <span className="text-xs font-semibold text-forge-text">Deploy to Vercel</span>
          {status === 'deploying' && (
            <span className="text-[10px] text-forge-text-dim tabular-nums">{elapsed}s</span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setCollapsed(true)}
            className="p-1 rounded text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
            title="Minimize"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="p-3 overflow-y-auto flex-1 min-h-0">
        {/* Pipeline stages */}
        <div className="flex items-center gap-1 mb-3">
          {STAGES.map((s, i) => {
            const isDone = (status === 'success') || i < stageIndex || currentStage === 'ready'
            const isCurrent = i === stageIndex && currentStage !== 'ready' && status === 'deploying'
            const isError = status === 'error' && i === stageIndex
            return (
              <Fragment key={s.key}>
                <div className="flex items-center gap-1">
                  {isDone ? (
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                  ) : isError ? (
                    <XCircle className="w-3.5 h-3.5 text-forge-danger" />
                  ) : isCurrent ? (
                    <Loader2 className="w-3.5 h-3.5 text-forge-accent animate-spin" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border border-forge-border" />
                  )}
                  <span className={cn(
                    'text-[11px] font-medium',
                    isDone ? 'text-emerald-500' : (isCurrent || isError) ? 'text-forge-text' : 'text-forge-text-dim'
                  )}>
                    {s.label}
                  </span>
                </div>
                {i < STAGES.length - 1 && (
                  <div className={cn('flex-1 h-px', isDone ? 'bg-emerald-500/40' : 'bg-forge-border')} />
                )}
              </Fragment>
            )
          })}
        </div>

        {/* Build logs terminal */}
        {logs.length > 0 && (
          <div
            ref={logsRef}
            className="bg-[#0d1117] rounded-lg p-2.5 max-h-[200px] overflow-y-auto font-mono text-[10px] leading-4 border border-white/5 mb-2"
          >
            {logs.map((line, i) => (
              <div key={i} className={cn(
                'whitespace-pre-wrap break-all',
                (line.includes('Error') || line.includes('error') || line.includes('FAIL') || line.includes('failed'))
                  ? 'text-red-400'
                  : line.startsWith('▸')
                  ? 'text-blue-400'
                  : (line.includes('warn') || line.includes('Warning'))
                  ? 'text-yellow-400'
                  : 'text-gray-400'
              )}>
                {line || '\u00A0'}
              </div>
            ))}
          </div>
        )}

        {/* No logs yet */}
        {logs.length === 0 && status === 'deploying' && (
          <div className="flex items-center gap-2 py-6 justify-center">
            <Loader2 className="w-4 h-4 text-forge-accent animate-spin" />
            <span className="text-xs text-forge-text-dim">{deployProgress?.message || 'Starting deployment...'}</span>
          </div>
        )}

        {/* Status message under logs */}
        {logs.length > 0 && status === 'deploying' && deployProgress?.message && (
          <p className="text-[10px] text-forge-text-dim mb-2">{deployProgress.message}</p>
        )}

        {/* Success result */}
        {status === 'success' && result && (
          <div className="space-y-2 mt-1">
            {typeof result.url === 'string' && (
              <div className="flex items-center gap-1.5 px-2.5 py-2 bg-forge-surface rounded-lg border border-forge-border">
                <span className="text-[11px] text-forge-text font-mono truncate flex-1">{result.url}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(String(result.url))
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className="p-1 text-forge-text-dim hover:text-forge-text rounded transition-colors shrink-0"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                </button>
                <a
                  href={String(result.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-1 text-forge-text-dim hover:text-forge-accent rounded transition-colors shrink-0"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
            <div className="flex items-center gap-3 text-[10px] text-forge-text-dim">
              {typeof result.framework === 'string' && <span>{result.framework}</span>}
              {typeof result.fileCount === 'number' && <span>{result.fileCount} files</span>}
              {typeof result.duration === 'number' && <span>{result.duration}s</span>}
            </div>
          </div>
        )}

        {/* Error */}
        {status === 'error' && (
          <div className="space-y-2 mt-1">
            <div className="bg-forge-surface rounded-lg p-2.5 max-h-[120px] overflow-y-auto border border-forge-border">
              <pre className="text-[10px] text-forge-danger font-mono whitespace-pre-wrap break-words leading-relaxed">
                {error}
              </pre>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleRetry}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-forge-text-dim hover:text-forge-text hover:bg-forge-surface rounded-lg transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Retry
              </button>
              {onFix && isBuildError && (
                <button
                  onClick={() => { onFix(error); onClose() }}
                  className="px-3 py-1.5 text-[11px] font-medium bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover transition-colors"
                >
                  Fix with AI
                </button>
              )}
            </div>
          </div>
        )}

        {/* URL preview during build */}
        {deployProgress?.url && status === 'deploying' && (
          <p className="text-[10px] text-forge-accent/60 font-mono truncate mt-1">{deployProgress.url}</p>
        )}
      </div>
    </div>
  )
}
