'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { SystemVitals } from '@/lib/agent-types'

const MOCK_VITALS: SystemVitals = {
  cpuPercent: 12,
  cpuTemp: 42.3,
  ramUsedMb: 1240,
  ramTotalMb: 4096,
  diskUsedGb: 12.4,
  diskTotalGb: 32,
  uptime: '3d 14h 22m',
  wifiConnected: true,
  wifiSsid: 'HomeNetwork',
  ipAddress: '192.168.1.42',
  gpioActive: [4, 17, 27],
}

/** Polling interval in ms */
const POLL_INTERVAL = 10_000

/** Format uptime seconds to human-readable string */
function formatUptime(seconds: number): string {
  if (seconds < 0) return 'unknown'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  parts.push(`${mins}m`)
  return parts.join(' ')
}

interface UseSystemVitalsReturn {
  vitals: SystemVitals
  devMode: boolean
  lastUpdated: number | null
  error: string | null
  refresh: () => void
}

export function useSystemVitals(): UseSystemVitalsReturn {
  const [vitals, setVitals] = useState<SystemVitals>(MOCK_VITALS)
  const [devMode, setDevMode] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  const fetchVitals = useCallback(async () => {
    // Don't poll when tab is hidden
    if (typeof document !== 'undefined' && document.hidden) return

    try {
      const res = await fetch('/api/vitals')

      if (!res.ok) {
        throw new Error(`Vitals API returned ${res.status}`)
      }

      const data = await res.json()
      if (!mountedRef.current) return

      // Check if we got real data (temp exists and cpu >= 0)
      if (data.cpu === -1 && data.memory?.used === -1) {
        // All commands failed — dev environment
        setDevMode(true)
        return
      }

      setDevMode(false)
      setError(null)
      setLastUpdated(Date.now())
      setVitals(prev => ({
        cpuPercent: data.cpu >= 0 ? Math.round(data.cpu) : prev.cpuPercent,
        cpuTemp: data.temp != null ? data.temp : prev.cpuTemp,
        ramUsedMb: data.memory?.used >= 0 ? data.memory.used : prev.ramUsedMb,
        ramTotalMb: data.memory?.total >= 0 ? data.memory.total : prev.ramTotalMb,
        diskUsedGb: data.disk?.used >= 0 ? Math.round(data.disk.used / 1024 * 10) / 10 : prev.diskUsedGb,
        diskTotalGb: data.disk?.total >= 0 ? Math.round(data.disk.total / 1024 * 10) / 10 : prev.diskTotalGb,
        uptime: data.uptime >= 0 ? formatUptime(data.uptime) : prev.uptime,
        wifiConnected: !!(data.ssid || data.ip),
        wifiSsid: data.ssid || undefined,
        ipAddress: data.ip || undefined,
        gpioActive: prev.gpioActive, // GPIO polled separately if needed
      }))
    } catch (err) {
      if (!mountedRef.current) return
      setDevMode(true)
      setError(err instanceof Error ? err.message : 'Failed to fetch vitals')
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true

    // Initial fetch
    fetchVitals()

    // Set up polling
    timerRef.current = setInterval(fetchVitals, POLL_INTERVAL)

    // Pause/resume on visibility change
    const handleVisibility = () => {
      if (!document.hidden) {
        fetchVitals()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      mountedRef.current = false
      if (timerRef.current) clearInterval(timerRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchVitals])

  return { vitals, devMode, lastUpdated, error, refresh: fetchVitals }
}
