'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Radio, Play, Square, Volume2, VolumeX, SkipForward,
  Clock, Sunrise,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

/* ─── Station Config ───────────────────────────── */

interface Station {
  id: string
  name: string
  freq: string
  streamUrl: string
  color: string
  logo: string
}

const STATIONS: Station[] = [
  {
    id: 'nova919',
    name: 'Nova 91.9',
    freq: '91.9 FM',
    streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/NOVA_919.mp3',
    color: 'from-red-600 to-orange-500',
    logo: '📻',
  },
  {
    id: 'triplem',
    name: 'Triple M',
    freq: '104.7 FM',
    streamUrl: 'https://legacy.scahw.com.au/5mmm_32',
    color: 'from-blue-600 to-blue-400',
    logo: '🎸',
  },
  {
    id: 'safm',
    name: 'SAFM',
    freq: '107.1 FM',
    streamUrl: 'https://playerservices.streamtheworld.com/api/livestream-redirect/SAFM.mp3',
    color: 'from-purple-600 to-pink-500',
    logo: '🎵',
  },
]

/* ─── Morning Schedule ─────────────────────────── */

const MORNING_ROTATION = ['nova919', 'triplem', 'safm', 'nova919', 'triplem']
const MORNING_START_HOUR = 7
const MORNING_START_MIN = 0
const MORNING_END_HOUR = 8
const MORNING_END_MIN = 30

const PUBLIC_HOLIDAYS_2026 = new Set([
  '2026-01-01', '2026-01-26', '2026-03-09',
  '2026-04-03', '2026-04-04', '2026-04-06',
  '2026-04-25', '2026-06-08', '2026-10-05',
  '2026-12-24', '2026-12-25', '2026-12-28',
  '2026-12-31',
])

function isWeekday(d: Date): boolean {
  const day = d.getDay()
  return day >= 1 && day <= 5
}

function isPublicHoliday(d: Date): boolean {
  const key = d.toISOString().slice(0, 10)
  return PUBLIC_HOLIDAYS_2026.has(key)
}

function getTodaysMorningStation(): Station | null {
  const now = new Date()
  if (!isWeekday(now) || isPublicHoliday(now)) return null
  const dayIndex = now.getDay() - 1
  const stationId = MORNING_ROTATION[dayIndex]
  return STATIONS.find(s => s.id === stationId) || null
}

function isMorningWindow(): boolean {
  const now = new Date()
  const mins = now.getHours() * 60 + now.getMinutes()
  const start = MORNING_START_HOUR * 60 + MORNING_START_MIN
  const end = MORNING_END_HOUR * 60 + MORNING_END_MIN
  return mins >= start && mins < end
}

/* ─── API helpers ──────────────────────────────── */

async function radioApi(action: string, data?: Record<string, unknown>) {
  try {
    if (action === 'status') {
      const res = await fetch('/api/radio')
      return res.json()
    }
    const res = await fetch('/api/radio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...data }),
    })
    return res.json()
  } catch {
    return { error: 'fetch failed' }
  }
}

/* ─── Component ────────────────────────────────── */

export function RadioPanel() {
  const [activeStation, setActiveStation] = useState<Station | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [volume, setVolume] = useState(86) // MPD volume 0-100
  const [isMuted, setIsMuted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [autoPlayTriggered, setAutoPlayTriggered] = useState(false)
  const prevVolumeRef = useRef(86)

  // Poll MPD status every 5s to stay in sync
  useEffect(() => {
    const poll = async () => {
      const status = await radioApi('status')
      if (status.playing !== undefined) {
        setIsPlaying(status.playing)
        if (!status.playing) setActiveStation(null)
        if (status.volume !== undefined) setVolume(status.volume)
      }
    }
    poll()
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [])

  const playStation = useCallback(async (station: Station) => {
    if (activeStation?.id === station.id && isPlaying) {
      // Stop if same station
      setLoading(true)
      await radioApi('stop')
      setIsPlaying(false)
      setActiveStation(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setActiveStation(station)
    await radioApi('play', { url: station.streamUrl })
    setIsPlaying(true)
    setLoading(false)
  }, [activeStation, isPlaying])

  const stop = useCallback(async () => {
    setLoading(true)
    await radioApi('stop')
    setIsPlaying(false)
    setActiveStation(null)
    setLoading(false)
  }, [])

  const nextStation = useCallback(() => {
    const currentIdx = activeStation ? STATIONS.findIndex(s => s.id === activeStation.id) : -1
    const next = STATIONS[(currentIdx + 1) % STATIONS.length]
    playStation(next)
  }, [activeStation, playStation])

  const handleVolumeChange = useCallback(async (v: number) => {
    setVolume(v)
    setIsMuted(false)
    await radioApi('volume', { volume: v })
  }, [])

  const toggleMute = useCallback(async () => {
    if (isMuted) {
      setIsMuted(false)
      await radioApi('volume', { volume: prevVolumeRef.current })
      setVolume(prevVolumeRef.current)
    } else {
      prevVolumeRef.current = volume
      setIsMuted(true)
      await radioApi('volume', { volume: 0 })
    }
  }, [isMuted, volume])

  // Morning auto-play
  useEffect(() => {
    const check = () => {
      if (autoPlayTriggered || isPlaying) return
      if (!isMorningWindow()) return
      const station = getTodaysMorningStation()
      if (!station) return
      setAutoPlayTriggered(true)
      playStation(station)
    }
    check()
    const interval = setInterval(check, 30_000)
    return () => clearInterval(interval)
  }, [autoPlayTriggered, isPlaying, playStation])

  // Auto-stop at 8:30
  useEffect(() => {
    if (!autoPlayTriggered || !isPlaying) return
    const checkEnd = setInterval(() => {
      if (!isMorningWindow()) {
        stop()
        setAutoPlayTriggered(false)
      }
    }, 30_000)
    return () => clearInterval(checkEnd)
  }, [autoPlayTriggered, isPlaying, stop])

  // Reset at midnight
  useEffect(() => {
    const reset = setInterval(() => {
      const now = new Date()
      if (now.getHours() === 0 && now.getMinutes() === 0) setAutoPlayTriggered(false)
    }, 60_000)
    return () => clearInterval(reset)
  }, [])

  const morningStation = getTodaysMorningStation()
  const inMorningWindow = isMorningWindow()

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm px-4 py-2.5">
        <div className="flex items-center gap-2">
          <Radio className="w-3.5 h-3.5 text-pi-accent" />
          <span className="text-xs font-bold text-pi-text">Adelaide Radio</span>
          <span className="text-[9px] text-pi-text-dim/50 font-mono">via Pi speaker</span>
        </div>
        {isPlaying && activeStation && (
          <div className="flex items-center gap-1.5">
            <motion.span
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 rounded-full bg-red-500"
            />
            <span className="text-[10px] text-pi-text-dim">Live</span>
          </div>
        )}
      </div>

      {/* Morning schedule banner */}
      {morningStation && (
        <div className={cn(
          'px-4 py-2 border-b border-pi-border/50 flex items-center gap-2',
          inMorningWindow ? 'bg-amber-500/10' : 'bg-pi-surface/30'
        )}>
          <Sunrise className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <div className="min-w-0">
            <p className="text-[10px] text-pi-text-dim">
              {inMorningWindow ? 'Morning radio active' : 'Morning schedule'}
            </p>
            <p className="text-[11px] text-pi-text font-medium truncate">
              {morningStation.name} · {MORNING_START_HOUR}:{String(MORNING_START_MIN).padStart(2, '0')}–{MORNING_END_HOUR}:{String(MORNING_END_MIN).padStart(2, '0')}
            </p>
          </div>
          {inMorningWindow && isPlaying && activeStation?.id === morningStation.id && (
            <span className="ml-auto text-[9px] text-amber-400 font-medium shrink-0">AUTO</span>
          )}
        </div>
      )}

      {/* Station cards */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {STATIONS.map(station => {
          const isActive = activeStation?.id === station.id
          const isCurrentlyPlaying = isActive && isPlaying

          return (
            <motion.button
              key={station.id}
              whileTap={{ scale: 0.98 }}
              onClick={() => playStation(station)}
              disabled={loading}
              className={cn(
                'w-full rounded-xl border p-3 text-left transition-all',
                loading && 'opacity-60 pointer-events-none',
                isCurrentlyPlaying
                  ? 'border-pi-accent/40 bg-pi-accent/5 shadow-lg shadow-pi-accent/5'
                  : 'border-pi-border bg-pi-surface/30 hover:border-pi-border/80 hover:bg-pi-surface/50'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn(
                  'w-12 h-12 rounded-lg flex items-center justify-center text-2xl bg-gradient-to-br shrink-0',
                  station.color
                )}>
                  {station.logo}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-pi-text">{station.name}</span>
                    <span className="text-[10px] text-pi-text-dim font-mono">{station.freq}</span>
                  </div>

                  {isCurrentlyPlaying && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex items-center gap-1.5 mt-1"
                    >
                      <div className="flex items-end gap-px h-3">
                        {[0, 1, 2, 3].map(i => (
                          <motion.div
                            key={i}
                            animate={{ height: ['40%', '100%', '60%', '100%', '40%'] }}
                            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
                            className="w-[3px] bg-pi-accent rounded-full"
                          />
                        ))}
                      </div>
                      <span className="text-[10px] text-pi-accent font-medium">Now playing</span>
                    </motion.div>
                  )}
                </div>

                <div className={cn(
                  'w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all',
                  isCurrentlyPlaying
                    ? 'bg-pi-accent text-white'
                    : 'bg-pi-surface border border-pi-border text-pi-text-dim hover:text-pi-text'
                )}>
                  {isCurrentlyPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-4 h-4 ml-0.5" />}
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Transport bar — always visible when playing */}
      {activeStation && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="shrink-0 border-t border-pi-border bg-pi-panel/95 backdrop-blur-sm px-4 py-2.5"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-pi-text font-medium truncate">{activeStation.name}</p>
              <p className="text-[9px] text-pi-text-dim">{activeStation.freq} · Pi speaker</p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={nextStation}
                className="p-1.5 rounded-lg text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-all"
                title="Next station"
              >
                <SkipForward className="w-4 h-4" />
              </button>
              <button
                onClick={() => isPlaying ? stop() : activeStation && playStation(activeStation)}
                className="p-2 rounded-full bg-pi-accent text-white hover:bg-pi-accent-hover transition-all"
              >
                {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-4 h-4 ml-0.5" />}
              </button>
            </div>

            <div className="flex items-center gap-1.5 w-24 shrink-0">
              <button
                onClick={toggleMute}
                className="p-1 rounded text-pi-text-dim hover:text-pi-text transition-all"
              >
                {isMuted || volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={isMuted ? 0 : volume}
                onChange={e => handleVolumeChange(parseInt(e.target.value))}
                className="flex-1 h-1 accent-pi-accent cursor-pointer"
              />
            </div>
          </div>

          {morningStation && (
            <div className="flex items-center gap-1.5 mt-1.5 pt-1.5 border-t border-pi-border/30">
              <Clock className="w-3 h-3 text-pi-text-dim/40" />
              <span className="text-[9px] text-pi-text-dim/60">
                Weekday mornings {MORNING_START_HOUR}:{String(MORNING_START_MIN).padStart(2, '0')}–{MORNING_END_HOUR}:{String(MORNING_END_MIN).padStart(2, '0')} · Today: {morningStation.name}
              </span>
            </div>
          )}
        </motion.div>
      )}
    </div>
  )
}
