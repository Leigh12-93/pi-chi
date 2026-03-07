'use client'

import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from 'react'
import { Loader2, CheckCircle, XCircle, ExternalLink, Copy, Check, ChevronDown, X, RefreshCw, Rocket, Globe, Clock, FileCode, Zap, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface DeployProgress {
  stage: string
  message: string
  logs: string[]
  elapsed: number
  url?: string
  framework?: string
  fileCount?: number
  autoFixAttempt?: number
  autoFixMax?: number
  fixExplanation?: string
  fixedFiles?: Record<string, string>
  errorType?: string
  targetFiles?: string[]
}

interface DeployPanelProps {
  projectId: string | null
  files: Record<string, string>
  projectName: string
  onClose: () => void
  onSuccess?: (result: Record<string, unknown>) => void
  onFix?: (error: string) => void
  onFilesFixed?: (fixedFiles: Record<string, string>) => void
}

const STAGES = [
  { key: 'upload', label: 'Uploading', icon: Zap, doneLabel: 'Uploaded' },
  { key: 'build', label: 'Building', icon: FileCode, doneLabel: 'Built' },
  { key: 'autofix', label: 'Auto-fixing', icon: Zap, doneLabel: 'Fixed' },
  { key: 'ready', label: 'Deploying', icon: Globe, doneLabel: 'Live' },
]

function formatElapsed(s: number) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

export function DeployPanel({ projectId, files, projectName, onClose, onSuccess, onFix, onFilesFixed }: DeployPanelProps) {
  const [status, setStatus] = useState<'deploying' | 'success' | 'error'>('deploying')
  const [progressText, setProgressText] = useState('')
  const [error, setError] = useState('')
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [collapsed, setCollapsed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isBuildError, setIsBuildError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [showLogs, setShowLogs] = useState(true)
  const [exiting, setExiting] = useState(false)
  const [fixedFilesApplied, setFixedFilesApplied] = useState(false)
  const [autoCollapsed, setAutoCollapsed] = useState(false) // auto-collapse on success
  const logsRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const filesRef = useRef(files)
  const onSuccessRef = useRef(onSuccess)
  const onFilesFixedRef = useRef(onFilesFixed)
  filesRef.current = files
  onSuccessRef.current = onSuccess
  onFilesFixedRef.current = onFilesFixed

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

  // Auto-collapse on success: show URL pill for 10s then fade out
  useEffect(() => {
    if (status !== 'success') return
    // Wait 2s showing full success UI, then collapse to URL pill
    const collapseTimer = setTimeout(() => {
      setAutoCollapsed(true)
    }, 2000)
    // After 12s total (2s full + 10s pill), fade out
    const fadeTimer = setTimeout(() => {
      setExiting(true)
      setTimeout(onClose, 300)
    }, 12000)
    return () => {
      clearTimeout(collapseTimer)
      clearTimeout(fadeTimer)
    }
  }, [status, onClose])

  // Sync fixed files back to workspace when auto-fix succeeds
  useEffect(() => {
    if (deployProgress?.fixedFiles && !fixedFilesApplied && Object.keys(deployProgress.fixedFiles).length > 0) {
      setFixedFilesApplied(true)
      onFilesFixedRef.current?.(deployProgress.fixedFiles)
    }
  }, [deployProgress?.fixedFiles, fixedFilesApplied])

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
    setShowLogs(false)
    setRetryCount(c => c + 1)
  }, [])

  const handleClose = useCallback(() => {
    setExiting(true)
    setTimeout(onClose, 200)
  }, [onClose])

  const currentStage = deployProgress?.stage || 'upload'
  const hasAutoFix = deployProgress?.autoFixAttempt != null || currentStage === 'autofix'
  // Only show autofix stage if it was triggered
  const visibleStages = hasAutoFix ? STAGES : STAGES.filter(s => s.key !== 'autofix')
  const stageIndex = visibleStages.findIndex(s => s.key === currentStage)
  const logs = deployProgress?.logs || []
  const stageCount = visibleStages.length
  const progressPercent = status === 'success' ? 100 : status === 'error' ? (stageIndex / stageCount) * 100 : Math.min(95, ((stageIndex / stageCount) * 100) + (elapsed % 20))

  // Auto-collapsed success URL pill — shows production URL for 10s then fades
  if (autoCollapsed && status === 'success' && result && typeof result.url === 'string') {
    return (
      <div className={cn('fixed bottom-4 right-4 left-4 sm:left-auto z-40', exiting ? 'deploy-exit' : 'deploy-enter')}>
        <div
          onClick={() => { setAutoCollapsed(false); setCollapsed(false) }}
          className="group flex items-center gap-2.5 w-full sm:w-auto px-3.5 py-2.5 rounded-full border backdrop-blur-xl shadow-lg bg-forge-bg/90 border-emerald-500/20 hover:border-emerald-500/40 transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
        >
          <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <a
            href={String(result.url)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs font-mono text-emerald-500 hover:text-emerald-400 truncate max-w-[260px] sm:max-w-[320px]"
          >
            {String(result.url).replace(/^https?:\/\//, '')}
          </a>
          <ExternalLink className="w-3 h-3 text-emerald-500/60 shrink-0" />
        </div>
      </div>
    )
  }

  // Collapsed mini indicator
  if (collapsed) {
    return (
      <div className={cn('fixed bottom-4 right-4 left-4 sm:left-auto z-40', exiting ? 'deploy-exit' : 'deploy-enter')}>
        <button
          onClick={() => setCollapsed(false)}
          className={cn(
            'group flex items-center justify-center sm:justify-start gap-2.5 w-full sm:w-auto pl-3 pr-3.5 py-2.5 sm:py-2 rounded-full border backdrop-blur-xl shadow-lg transition-all duration-200',
            'hover:scale-[1.02] active:scale-[0.98]',
            status === 'deploying' && 'bg-forge-bg/90 border-forge-accent/20 hover:border-forge-accent/40 deploy-pill-glow',
            status === 'success' && 'bg-forge-bg/90 border-emerald-500/20 hover:border-emerald-500/40',
            status === 'error' && 'bg-forge-bg/90 border-forge-danger/20 hover:border-forge-danger/40',
          )}
        >
          {status === 'deploying' && (
            <div className="relative">
              <Loader2 className="w-3.5 h-3.5 text-forge-accent animate-spin" />
              <div className="absolute inset-0 w-3.5 h-3.5 rounded-full bg-forge-accent/20 animate-ping" />
            </div>
          )}
          {status === 'success' && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
          {status === 'error' && <XCircle className="w-3.5 h-3.5 text-forge-danger" />}
          <span className={cn(
            'text-xs font-medium',
            status === 'deploying' && 'text-forge-text',
            status === 'success' && 'text-emerald-500',
            status === 'error' && 'text-forge-danger',
          )}>
            {status === 'deploying' ? `Deploying ${formatElapsed(elapsed)}` : status === 'success' ? 'Deployed' : 'Failed'}
          </span>
          <ChevronDown className="w-3 h-3 text-forge-text-dim group-hover:text-forge-text transition-colors rotate-180" />
        </button>
      </div>
    )
  }

  return (
    <div className={cn(
      'fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-40 sm:w-[440px] rounded-2xl border backdrop-blur-xl shadow-2xl flex flex-col overflow-hidden',
      'bg-forge-bg/95 border-forge-border/60',
      exiting ? 'deploy-exit' : 'deploy-enter',
      status === 'deploying' && 'deploy-glow-accent',
      status === 'success' && 'deploy-glow-success',
      status === 'error' && 'deploy-glow-error',
    )}>
      {/* Animated gradient bar at top */}
      <div className="h-[2px] w-full relative overflow-hidden bg-forge-border/30">
        <div
          className={cn(
            'absolute inset-y-0 left-0 transition-all duration-1000 ease-out rounded-full',
            status === 'deploying' && 'deploy-progress-bar',
            status === 'success' && 'bg-emerald-500',
            status === 'error' && 'bg-forge-danger',
          )}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className={cn(
            'flex items-center justify-center w-6 h-6 rounded-lg transition-colors duration-300',
            status === 'deploying' && 'bg-forge-accent/10',
            status === 'success' && 'bg-emerald-500/10',
            status === 'error' && 'bg-forge-danger/10',
          )}>
            {status === 'deploying' && <Rocket className="w-3.5 h-3.5 text-forge-accent deploy-rocket" />}
            {status === 'success' && <CheckCircle className="w-3.5 h-3.5 text-emerald-500 deploy-success-pop" />}
            {status === 'error' && <XCircle className="w-3.5 h-3.5 text-forge-danger" />}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-forge-text leading-none">
              {status === 'deploying' ? 'Deploying' : status === 'success' ? 'Deployment Complete' : 'Deployment Failed'}
            </span>
            <span className="text-[10px] text-forge-text-dim mt-0.5 leading-none">
              {status === 'deploying'
                ? deployProgress?.message || 'Starting...'
                : status === 'success'
                ? projectName
                : 'Build error encountered'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {status === 'deploying' && (
            <span className="text-[10px] text-forge-text-dim tabular-nums font-mono mr-1">{formatElapsed(elapsed)}</span>
          )}
          <button
            onClick={() => setCollapsed(true)}
            className="p-1.5 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-all duration-150"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-all duration-150"
            title="Close"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Pipeline stages */}
      <div className="px-4 pb-3">
        <div className="flex items-center gap-0">
          {visibleStages.map((s, i) => {
            const isDone = (status === 'success') || i < stageIndex || (currentStage === 'ready' && status !== 'error')
            const isCurrent = i === stageIndex && status === 'deploying'
            const isError = status === 'error' && i === stageIndex
            const isAutoFix = s.key === 'autofix'
            const Icon = s.icon
            return (
              <Fragment key={s.key}>
                <div className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all duration-300',
                  isDone && !isAutoFix && 'bg-emerald-500/8',
                  isDone && isAutoFix && 'bg-amber-500/8',
                  isCurrent && !isAutoFix && 'bg-forge-accent/8 shadow-[0_0_8px_rgba(99,102,241,0.15)]',
                  isCurrent && isAutoFix && 'bg-amber-500/8 shadow-[0_0_8px_rgba(245,158,11,0.15)]',
                  isError && 'bg-forge-danger/8 shadow-[0_0_8px_rgba(239,68,68,0.15)]',
                )}>
                  <div className={cn(
                    'flex items-center justify-center w-4.5 h-4.5 rounded-md transition-all duration-300',
                    isDone && !isAutoFix && 'text-emerald-500',
                    isDone && isAutoFix && 'text-amber-500',
                    isCurrent && !isAutoFix && 'text-forge-accent',
                    isCurrent && isAutoFix && 'text-amber-500',
                    isError && 'text-forge-danger',
                    !isDone && !isCurrent && !isError && 'text-forge-text-dim/40',
                  )}>
                    {isDone ? (
                      <CheckCircle className="w-3.5 h-3.5 animate-check-in" />
                    ) : isError ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : isCurrent ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Icon className="w-3.5 h-3.5" />
                    )}
                  </div>
                  <span className={cn(
                    'text-[11px] font-medium transition-colors duration-300',
                    isDone && !isAutoFix ? 'text-emerald-500' : isDone && isAutoFix ? 'text-amber-500' : (isCurrent || isError) ? 'text-forge-text' : 'text-forge-text-dim/50'
                  )}>
                    {isDone ? s.doneLabel : s.label}
                  </span>
                </div>
                {i < visibleStages.length - 1 && (
                  <div className="flex-1 mx-0.5">
                    <div className={cn(
                      'h-px transition-colors duration-500',
                      isDone ? 'bg-emerald-500/30' : 'bg-forge-border/50'
                    )} />
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      </div>

      {/* Auto-fix info banner */}
      {currentStage === 'autofix' && status === 'deploying' && (
        <div className="px-4 pb-2 deploy-slide-up">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-500/[0.06] border border-amber-500/15">
            <Zap className="w-3.5 h-3.5 text-amber-500 shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-medium text-amber-500/90">
                Auto-fixing build error
                {deployProgress?.autoFixAttempt && deployProgress?.autoFixMax && (
                  <span className="text-amber-500/60 ml-1">({deployProgress.autoFixAttempt}/{deployProgress.autoFixMax})</span>
                )}
              </p>
              {deployProgress?.fixExplanation && (
                <p className="text-[10px] text-amber-500/60 truncate">{deployProgress.fixExplanation}</p>
              )}
              {deployProgress?.targetFiles && deployProgress.targetFiles.length > 0 && !deployProgress?.fixExplanation && (
                <p className="text-[10px] text-amber-500/60 truncate font-mono">{deployProgress.targetFiles.join(', ')}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Build logs terminal */}
      {(logs.length > 0 || status === 'error') && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center gap-1.5 text-[10px] text-forge-text-dim hover:text-forge-text transition-colors mb-1.5 group"
          >
            <ChevronDown className={cn('w-3 h-3 transition-transform duration-200', showLogs && 'rotate-180')} />
            <span>Build Output</span>
            {logs.length > 0 && <span className="text-forge-text-dim/50">{logs.length} lines</span>}
          </button>

          {showLogs && (
            <div
              ref={logsRef}
              className="deploy-terminal rounded-xl p-3 max-h-[180px] overflow-y-auto font-mono text-[10px] leading-[18px] deploy-slide-down"
            >
              {logs.map((line, i) => (
                <div key={i} className={cn(
                  'whitespace-pre-wrap break-all',
                  (line.includes('Error') || line.includes('error') || line.includes('FAIL') || line.includes('failed'))
                    ? 'text-red-400'
                    : line.startsWith('▸')
                    ? 'text-sky-400'
                    : (line.includes('warn') || line.includes('Warning'))
                    ? 'text-amber-400'
                    : line.includes('Ready') || line.includes('success') || line.includes('Complete')
                    ? 'text-emerald-400'
                    : 'text-zinc-400'
                )}>
                  {line || '\u00A0'}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Deploying — waiting state */}
      {logs.length === 0 && status === 'deploying' && (
        <div className="px-4 pb-4">
          <div className="flex items-center gap-3 py-3 justify-center">
            <div className="flex gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-forge-accent deploy-dot" style={{ animationDelay: '0ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-forge-accent deploy-dot" style={{ animationDelay: '150ms' }} />
              <div className="w-1.5 h-1.5 rounded-full bg-forge-accent deploy-dot" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-forge-text-dim">{deployProgress?.message || 'Preparing deployment...'}</span>
          </div>
        </div>
      )}

      {/* Success result */}
      {status === 'success' && result && (
        <div className="px-4 pb-4 deploy-slide-up">
          {typeof result.url === 'string' && (
            <div className="group relative rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] p-3 mb-2.5 hover:border-emerald-500/25 transition-all duration-200">
              <div className="flex items-center gap-2 mb-1.5">
                <Globe className="w-3.5 h-3.5 text-emerald-500" />
                <span className="text-[10px] font-medium text-emerald-500/80 uppercase tracking-wider">Production URL</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-forge-text font-mono truncate flex-1">{result.url}</span>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(String(result.url))
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  className={cn(
                    'p-1.5 rounded-lg transition-all duration-150 shrink-0',
                    copied
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : 'text-forge-text-dim hover:text-forge-text hover:bg-forge-surface'
                  )}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <a
                  href={String(result.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500 text-white text-[11px] font-medium hover:bg-emerald-600 transition-all duration-150 shrink-0"
                >
                  Visit
                  <ArrowUpRight className="w-3 h-3" />
                </a>
              </div>
            </div>
          )}
          {typeof result.autoFixed === 'boolean' && result.autoFixed && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-amber-500/[0.06] border border-amber-500/15 mb-2">
              <Zap className="w-3 h-3 text-amber-500" />
              <span className="text-[10px] text-amber-500/80">
                {typeof result.fixExplanation === 'string' ? result.fixExplanation : 'Build errors auto-fixed'}
              </span>
            </div>
          )}
          <div className="flex items-center gap-4 text-[10px] text-forge-text-dim">
            {typeof result.framework === 'string' && (
              <div className="flex items-center gap-1">
                <FileCode className="w-3 h-3" />
                <span>{result.framework}</span>
              </div>
            )}
            {typeof result.fileCount === 'number' && (
              <div className="flex items-center gap-1">
                <span>{result.fileCount} files</span>
              </div>
            )}
            {typeof result.duration === 'number' && (
              <div className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                <span>{result.duration}s</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="px-4 pb-4 deploy-slide-up">
          <div className="rounded-xl border border-forge-danger/15 bg-forge-danger/[0.03] p-3 mb-3">
            <pre className="text-[10px] text-forge-danger font-mono whitespace-pre-wrap break-words leading-relaxed max-h-[100px] overflow-y-auto">
              {error}
            </pre>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={handleRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-forge-text-dim hover:text-forge-text rounded-lg border border-forge-border hover:border-forge-border-bright transition-all duration-150"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
            {onFix && isBuildError && (
              <button
                onClick={() => { onFix(error); handleClose() }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover transition-all duration-150"
              >
                <Zap className="w-3 h-3" />
                Fix with AI
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
