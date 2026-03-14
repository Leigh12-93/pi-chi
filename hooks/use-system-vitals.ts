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

/** Polling intervals in ms */
const FAST_INTERVAL = 10_000  // CPU, RAM, temp
const SLOW_INTERVAL = 60_000  // disk, network, uptime

// Linux command that outputs all vitals as JSON in one call
const VITALS_COMMAND = [
  'echo "{"',
  '"\\\"cpu\\\":$(top -bn1 | grep \'Cpu(s)\' | awk \'{print $2+$4}\' | cut -d. -f1),"',
  '"\\\"temp\\\":$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null | awk \'{printf \\"%.1f\\", $1/1000}\' || echo 0),"',
  '"\\\"ram_used\\\":$(free -m | awk \'/Mem:/{print $3}\'),"',
  '"\\\"ram_total\\\":$(free -m | awk \'/Mem:/{print $2}\'),"',
  '"\\\"disk_used\\\":$(df -BG / | awk \'NR==2{print $3}\' | tr -d \'G\'),"',
  '"\\\"disk_total\\\":$(df -BG / | awk \'NR==2{print $2}\' | tr -d \'G\'),"',
  '"\\\"uptime\\\":\\\"$(uptime -p 2>/dev/null | sed \'s/up //\' || echo \'unknown\')\\\","',
  '"\\\"ip\\\":\\\"$(hostname -I 2>/dev/null | awk \'{print $1}\' || echo \'\')\\\","',
  '"\\\"ssid\\\":\\\"$(iwgetid -r 2>/dev/null || echo \'\')\\\"}"',
].join(' ')

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
  const fastTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const slowTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const mountedRef = useRef(true)

  const fetchVitals = useCallback(async () => {
    // Don't poll when tab is hidden
    if (document.hidden) return

    try {
      const res = await fetch('/api/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: VITALS_COMMAND,
          timeout: 8000,
        }),
      })

      if (!res.ok) {
        throw new Error(`Terminal API returned ${res.status}`)
      }

      const result = await res.json()

      if (!result.success || !result.stdout) {
        // Command failed — likely Windows dev environment
        setDevMode(true)
        return
      }

      try {
        const data = JSON.parse(result.stdout.trim())
        if (!mountedRef.current) return

        setDevMode(false)
        setError(null)
        setLastUpdated(Date.now())
        setVitals(prev => ({
          cpuPercent: Number(data.cpu) || prev.cpuPercent,
          cpuTemp: Number(data.temp) || prev.cpuTemp,
          ramUsedMb: Number(data.ram_used) || prev.ramUsedMb,
          ramTotalMb: Number(data.ram_total) || prev.ramTotalMb,
          diskUsedGb: Number(data.disk_used) || prev.diskUsedGb,
          diskTotalGb: Number(data.disk_total) || prev.diskTotalGb,
          uptime: data.uptime || prev.uptime,
          wifiConnected: !!(data.ssid || data.ip),
          wifiSsid: data.ssid || undefined,
          ipAddress: data.ip || undefined,
          gpioActive: prev.gpioActive, // GPIO polled separately
        }))
      } catch {
        // JSON parse failed — dev mode
        setDevMode(true)
      }
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
    fastTimerRef.current = setInterval(fetchVitals, FAST_INTERVAL)
    slowTimerRef.current = setInterval(fetchVitals, SLOW_INTERVAL)

    // Pause/resume on visibility change
    const handleVisibility = () => {
      if (!document.hidden) {
        fetchVitals()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      mountedRef.current = false
      if (fastTimerRef.current) clearInterval(fastTimerRef.current)
      if (slowTimerRef.current) clearInterval(slowTimerRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchVitals])

  return { vitals, devMode, lastUpdated, error, refresh: fetchVitals }
}
