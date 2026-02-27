'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X, Loader2, CheckCircle, XCircle, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ActionField {
  name: string
  label: string
  placeholder: string
  required?: boolean
  defaultValue?: string
}

interface ActionDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description: string
  confirmLabel: string
  confirmVariant?: 'default' | 'danger'
  fields?: ActionField[]
  onConfirm: (fieldValues: Record<string, string>) => Promise<void>
}

type DialogState = 'confirm' | 'running' | 'success' | 'error'

export function ActionDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  confirmVariant = 'default',
  fields,
  onConfirm,
}: ActionDialogProps) {
  const [state, setState] = useState<DialogState>('confirm')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')
  const [resultData, setResultData] = useState<Record<string, unknown> | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setState('confirm')
      setErrorMessage('')
      setResultData(null)
      // Initialize field defaults
      const defaults: Record<string, string> = {}
      fields?.forEach(f => {
        if (f.defaultValue) defaults[f.name] = f.defaultValue
      })
      setFieldValues(defaults)
    }
  }, [open, fields])

  // Close on Escape
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state !== 'running') onClose()
    }
    if (open) document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, state, onClose])

  const handleConfirm = useCallback(async () => {
    // Validate required fields
    if (fields) {
      for (const field of fields) {
        if (field.required && !fieldValues[field.name]?.trim()) {
          setErrorMessage(`${field.label} is required`)
          return
        }
      }
    }

    setState('running')
    setErrorMessage('')

    try {
      await onConfirm(fieldValues)
      setState('success')
    } catch (err) {
      setState('error')
      setErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }, [fields, fieldValues, onConfirm])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={e => { if (e.target === overlayRef.current && state !== 'running') onClose() }}
    >
      <div className="fixed inset-0 bg-black/50" />
      <div className="relative z-50 w-full max-w-md rounded-xl border border-forge-border bg-forge-bg p-5 shadow-xl animate-fade-in mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-forge-text">{title}</h2>
          {state !== 'running' && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Confirm state */}
        {state === 'confirm' && (
          <>
            <p className="text-xs text-forge-text-dim mb-4">{description}</p>

            {fields && fields.length > 0 && (
              <div className="space-y-3 mb-4">
                {fields.map(field => (
                  <div key={field.name}>
                    <label className="block text-[11px] font-medium text-forge-text mb-1">
                      {field.label}
                      {field.required && <span className="text-forge-danger ml-0.5">*</span>}
                    </label>
                    <input
                      type="text"
                      value={fieldValues[field.name] || ''}
                      onChange={e => setFieldValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 text-xs bg-forge-surface border border-forge-border rounded-lg text-forge-text placeholder:text-forge-text-dim/50 outline-none focus:border-forge-accent/50 transition-colors"
                    />
                  </div>
                ))}
              </div>
            )}

            {errorMessage && (
              <p className="text-[11px] text-forge-danger mb-3">{errorMessage}</p>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-forge-text-dim hover:text-forge-text hover:bg-forge-surface rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className={cn(
                  'px-4 py-1.5 text-xs font-medium rounded-lg transition-colors',
                  confirmVariant === 'danger'
                    ? 'bg-forge-danger text-white hover:bg-red-700'
                    : 'bg-forge-accent text-white hover:bg-forge-accent-hover'
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </>
        )}

        {/* Running state */}
        {state === 'running' && (
          <div className="flex flex-col items-center py-6">
            <Loader2 className="w-8 h-8 text-forge-accent animate-spin mb-3" />
            <p className="text-xs text-forge-text-dim">Working on it...</p>
          </div>
        )}

        {/* Success state */}
        {state === 'success' && (
          <div className="flex flex-col items-center py-4">
            <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
            <p className="text-xs text-forge-text font-medium mb-1">Done!</p>
            {typeof resultData?.url === 'string' && (
              <a
                href={String(resultData.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-forge-accent hover:underline mt-1"
              >
                {String(resultData.url)} <ExternalLink className="w-3 h-3" />
              </a>
            )}
            <button
              onClick={onClose}
              className="mt-4 px-4 py-1.5 text-xs font-medium text-forge-text-dim hover:text-forge-text hover:bg-forge-surface rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* Error state */}
        {state === 'error' && (
          <div className="flex flex-col items-center py-4">
            <XCircle className="w-8 h-8 text-forge-danger mb-2" />
            <p className="text-xs text-forge-text font-medium mb-1">Failed</p>
            <p className="text-[11px] text-forge-text-dim text-center max-w-sm">{errorMessage}</p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-forge-text-dim hover:text-forge-text hover:bg-forge-surface rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => setState('confirm')}
                className="px-4 py-1.5 text-xs font-medium bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  // Expose setResultData via a pattern where parent can set it
  // Actually, the parent calls onConfirm which sets its own state.
  // The dialog just shows running/success/error based on the Promise.
}

// ─── Specialized dialogs ──────────────────────────────────────

interface TaskPollingDialogProps {
  open: boolean
  onClose: () => void
  title: string
  description: string
  confirmLabel: string
  fields?: ActionField[]
  taskType: string
  projectId: string | null
  buildParams: (fieldValues: Record<string, string>) => Record<string, unknown>
  onSuccess?: (result: Record<string, unknown>) => void
}

export function TaskPollingDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  fields,
  taskType,
  projectId,
  buildParams,
  onSuccess,
}: TaskPollingDialogProps) {
  const [state, setState] = useState<DialogState>('confirm')
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({})
  const [errorMessage, setErrorMessage] = useState('')
  const [progressText, setProgressText] = useState('')
  const [resultData, setResultData] = useState<Record<string, unknown> | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (open) {
      setState('confirm')
      setErrorMessage('')
      setProgressText('')
      setResultData(null)
      const defaults: Record<string, string> = {}
      fields?.forEach(f => {
        if (f.defaultValue) defaults[f.name] = f.defaultValue
      })
      setFieldValues(defaults)
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [open, fields])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state !== 'running') onClose()
    }
    if (open) document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, state, onClose])

  const handleConfirm = useCallback(async () => {
    if (fields) {
      for (const field of fields) {
        if (field.required && !fieldValues[field.name]?.trim()) {
          setErrorMessage(`${field.label} is required`)
          return
        }
      }
    }

    setState('running')
    setErrorMessage('')

    try {
      const params = buildParams(fieldValues)
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, type: taskType, params }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || `HTTP ${res.status}`)
      }

      const { taskId } = await res.json()

      // Poll for completion
      pollRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/tasks/${taskId}`)
          if (!statusRes.ok) return

          const task = await statusRes.json()

          // Update progress text
          if (task.progress) {
            setProgressText(task.progress)
          }

          if (task.status === 'completed') {
            if (pollRef.current) clearInterval(pollRef.current)
            setResultData(task.result || {})
            setState('success')
            onSuccess?.(task.result || {})
          } else if (task.status === 'failed') {
            if (pollRef.current) clearInterval(pollRef.current)
            setState('error')
            setErrorMessage(task.error || 'Task failed')
          }
        } catch {
          // Keep polling on network errors
        }
      }, 2000)
    } catch (err) {
      setState('error')
      setErrorMessage(err instanceof Error ? err.message : String(err))
    }
  }, [fields, fieldValues, buildParams, projectId, taskType, onSuccess])

  if (!open) return null

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={e => { if (e.target === overlayRef.current && state !== 'running') onClose() }}
    >
      <div className="fixed inset-0 bg-black/50" />
      <div className="relative z-50 w-full max-w-md rounded-xl border border-forge-border bg-forge-bg p-5 shadow-xl animate-fade-in mx-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-forge-text">{title}</h2>
          {state !== 'running' && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Confirm */}
        {state === 'confirm' && (
          <>
            <p className="text-xs text-forge-text-dim mb-4">{description}</p>
            {fields && fields.length > 0 && (
              <div className="space-y-3 mb-4">
                {fields.map(field => (
                  <div key={field.name}>
                    <label className="block text-[11px] font-medium text-forge-text mb-1">
                      {field.label}
                      {field.required && <span className="text-forge-danger ml-0.5">*</span>}
                    </label>
                    <input
                      type="text"
                      value={fieldValues[field.name] || ''}
                      onChange={e => setFieldValues(prev => ({ ...prev, [field.name]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2 text-xs bg-forge-surface border border-forge-border rounded-lg text-forge-text placeholder:text-forge-text-dim/50 outline-none focus:border-forge-accent/50 transition-colors"
                    />
                  </div>
                ))}
              </div>
            )}
            {errorMessage && (
              <p className="text-[11px] text-forge-danger mb-3">{errorMessage}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-forge-text-dim hover:text-forge-text hover:bg-forge-surface rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-1.5 text-xs font-medium bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover transition-colors"
              >
                {confirmLabel}
              </button>
            </div>
          </>
        )}

        {/* Running */}
        {state === 'running' && (
          <div className="flex flex-col items-center py-6">
            <Loader2 className="w-8 h-8 text-forge-accent animate-spin mb-3" />
            <p className="text-xs text-forge-text font-medium mb-1">
              {progressText || 'Starting...'}
            </p>
            <div className="w-full max-w-xs mt-2">
              <div className="h-1 bg-forge-surface rounded-full overflow-hidden">
                <div className="h-full bg-forge-accent rounded-full animate-pulse" style={{ width: '60%' }} />
              </div>
            </div>
          </div>
        )}

        {/* Success */}
        {state === 'success' && (
          <div className="flex flex-col items-center py-4">
            <CheckCircle className="w-8 h-8 text-emerald-500 mb-2" />
            <p className="text-xs text-forge-text font-medium mb-1">Done!</p>
            {typeof resultData?.url === 'string' && (
              <a
                href={String(resultData.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[11px] text-forge-accent hover:underline mt-1"
              >
                {String(resultData.url)} <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {typeof resultData?.commitSha === 'string' && (
              <p className="text-[11px] text-forge-text-dim mt-1">
                Commit: {resultData.commitSha.slice(0, 7)}
              </p>
            )}
            {resultData?.filesCount != null && (
              <p className="text-[11px] text-forge-text-dim">
                {String(resultData.filesCount)} files pushed
              </p>
            )}
            <button
              onClick={onClose}
              className="mt-4 px-4 py-1.5 text-xs font-medium text-forge-text-dim hover:text-forge-text hover:bg-forge-surface rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        )}

        {/* Error */}
        {state === 'error' && (
          <div className="flex flex-col items-center py-4">
            <XCircle className="w-8 h-8 text-forge-danger mb-2" />
            <p className="text-xs text-forge-text font-medium mb-1">Failed</p>
            <p className="text-[11px] text-forge-text-dim text-center max-w-sm">{errorMessage}</p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={onClose}
                className="px-3 py-1.5 text-xs text-forge-text-dim hover:text-forge-text hover:bg-forge-surface rounded-lg transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => setState('confirm')}
                className="px-4 py-1.5 text-xs font-medium bg-forge-accent text-white rounded-lg hover:bg-forge-accent-hover transition-colors"
              >
                Retry
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
