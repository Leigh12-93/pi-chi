import { useState, useEffect, useRef, useCallback } from 'react'
import { hashFileMapDeep } from '@/lib/utils'

type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

/**
 * Auto-save with debounce, retry logic, hash comparison, and localStorage fallback.
 * Also handles sessionStorage persistence of the active project reference.
 */
export function useProjectPersistence(
  projectId: string | null,
  projectName: string | null,
  files: Record<string, string>,
  activeFile: string | null,
  initialHash?: string,
) {
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const lastSavedHash = useRef<string>(initialHash || '')
  const savingRef = useRef(false)
  const saveRetriesRef = useRef(0)
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle')
  const [autoSaveError, setAutoSaveError] = useState(false)

  /** Update the initial hash when a project is loaded/restored */
  const setLastSavedHash = useCallback((hash: string) => {
    lastSavedHash.current = hash
  }, [])

  // Auto-save when files change (debounced 5 seconds, with save lock)
  useEffect(() => {
    if (!projectId || Object.keys(files).length === 0) return

    const hash = hashFileMapDeep(files)
    if (hash === lastSavedHash.current) return

    setSaveStatus('pending')
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    if (retryTimer.current) clearTimeout(retryTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      if (savingRef.current) return
      savingRef.current = true
      abortRef.current?.abort()
      abortRef.current = new AbortController()
      setSaveStatus('saving')
      try {
        const res = await fetch(`/api/projects/${projectId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files }),
          signal: abortRef.current.signal,
        })
        if (res.ok) {
          lastSavedHash.current = hash
          setAutoSaveError(false)
          setSaveStatus('saved')
          saveRetriesRef.current = 0
          setTimeout(() => setSaveStatus('idle'), 2000)
        } else {
          throw new Error(`HTTP ${res.status}`)
        }
      } catch {
        if (saveRetriesRef.current < 3) {
          saveRetriesRef.current++
          savingRef.current = false
          retryTimer.current = setTimeout(async () => {
            savingRef.current = true
            try {
              abortRef.current?.abort()
              abortRef.current = new AbortController()
              const retryRes = await fetch(`/api/projects/${projectId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ files }),
                signal: abortRef.current.signal,
              })
              if (retryRes.ok) {
                lastSavedHash.current = hash
                setAutoSaveError(false)
                setSaveStatus('saved')
                saveRetriesRef.current = 0
                setTimeout(() => setSaveStatus('idle'), 2000)
              } else {
                setAutoSaveError(true)
                setSaveStatus('error')
              }
            } catch {
              setAutoSaveError(true)
            } finally {
              savingRef.current = false
            }
          }, 2000 * saveRetriesRef.current)
          return
        }
        setAutoSaveError(true)
        setSaveStatus('error')
        // Backup to localStorage as safety net
        try { localStorage.setItem(`pi-unsaved-${projectId}`, JSON.stringify(files)) } catch (e) { console.warn('[pi:localStorage] Failed to backup unsaved files:', e) }
      } finally {
        savingRef.current = false
      }
    }, 5000)

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      if (retryTimer.current) clearTimeout(retryTimer.current)
    }
  }, [files, projectId])

  // Manual save — cancels pending auto-save, saves immediately, updates hash
  const handleManualSave = useCallback(async () => {
    if (!projectId || Object.keys(files).length === 0) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    if (savingRef.current) return
    savingRef.current = true
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    setSaveStatus('saving')
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
        signal: abortRef.current.signal,
      })
      if (res.ok) {
        lastSavedHash.current = hashFileMapDeep(files)
        setAutoSaveError(false)
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus('idle'), 2000)
      } else {
        setAutoSaveError(true)
        setSaveStatus('error')
      }
    } catch {
      setAutoSaveError(true)
      setSaveStatus('error')
    } finally {
      savingRef.current = false
    }
  }, [projectId, files])

  // Persist active project to sessionStorage + push history state
  useEffect(() => {
    try {
      if (projectName) {
        sessionStorage.setItem('pi_active_project', JSON.stringify({ id: projectId, name: projectName, activeFile }))
        if (!window.history.state?.piProject) {
          window.history.pushState({ piProject: true }, '', window.location.href)
        }
      } else {
        sessionStorage.removeItem('pi_active_project')
      }
    } catch { /* sessionStorage unavailable (private browsing) — non-fatal */ }
  }, [projectId, projectName, activeFile])

  return {
    saveStatus,
    autoSaveError,
    handleManualSave,
    setLastSavedHash,
    lastSavedHash,
  }
}
