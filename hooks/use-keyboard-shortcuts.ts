'use client'

import { useRef, useEffect } from 'react'
import { toast } from 'sonner'

export function useKeyboardShortcuts(isLoading: boolean, stop: () => void) {
  const stoppedByUserRef = useRef(false)
  const wasLoadingRef = useRef(false)

  useEffect(() => {
    if (!isLoading) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); stoppedByUserRef.current = true; stop() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isLoading, stop])

  useEffect(() => {
    if (wasLoadingRef.current && !isLoading && stoppedByUserRef.current) {
      toast.info('Generation stopped', { duration: 2000 })
      stoppedByUserRef.current = false
    }
    wasLoadingRef.current = isLoading
  }, [isLoading])

  return { stoppedByUserRef }
}
