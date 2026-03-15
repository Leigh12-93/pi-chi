'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { BusinessMetrics } from '@/app/api/businesses/route'

const POLL_INTERVAL = 30_000 // 30 seconds

export { type BusinessMetrics }

interface UseBusinessMetricsReturn {
  businesses: BusinessMetrics[]
  loading: boolean
  error: string | null
  refresh: () => void
}

export function useBusinessMetrics(): UseBusinessMetricsReturn {
  const [businesses, setBusinesses] = useState<BusinessMetrics[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)
  const initialFetchDone = useRef(false)

  const fetchMetrics = useCallback(async () => {
    // Don't poll when tab is hidden
    if (document.hidden) return

    try {
      const res = await fetch('/api/businesses', {
        signal: AbortSignal.timeout(15_000),
      })

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`)
      }

      const data: BusinessMetrics[] = await res.json()

      if (!mountedRef.current) return

      setBusinesses(data)
      setError(null)
    } catch (err) {
      if (!mountedRef.current) return
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics')
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        initialFetchDone.current = true
      }
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    // Initial fetch
    fetchMetrics()

    // Set up polling
    timerRef.current = setInterval(fetchMetrics, POLL_INTERVAL)

    // Pause/resume on visibility change
    const handleVisibility = () => {
      if (!document.hidden && initialFetchDone.current) {
        fetchMetrics()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      mountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchMetrics])

  return { businesses, loading, error, refresh: fetchMetrics }
}
