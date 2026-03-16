'use client'

import { useEffect, useState, useCallback } from 'react'
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, MessageSquare, Radio, SignalHigh, SignalLow, SignalMedium, SignalZero, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import Link from 'next/link'

/* ─── Types ──────────────────────────────────────── */

interface SMSMessage {
  id: string
  direction: 'in' | 'out'
  number: string
  body: string
  timestamp: string
  source?: string
}

interface ModemStatus {
  timestamp: string
  modemStatus: string
  signalStrength: number
  simReady: boolean
  sendCount?: number
  errorCount?: number
}

interface SMSResponse {
  messages: SMSMessage[]
  modem: ModemStatus | null
}

/* ─── Helpers ────────────────────────────────────── */

function formatTimestamp(ts: string): string {
  const d = new Date(ts)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatFullTimestamp(ts: string): string {
  return new Date(ts).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

function SignalIcon({ strength }: { strength: number }) {
  if (strength >= 20) return <SignalHigh className="w-4 h-4 text-pi-success" />
  if (strength >= 12) return <SignalMedium className="w-4 h-4 text-yellow-400" />
  if (strength > 0) return <SignalLow className="w-4 h-4 text-orange-400" />
  return <SignalZero className="w-4 h-4 text-pi-danger" />
}

/* ─── Page ───────────────────────────────────────── */

export default function SMSLogPage() {
  const [data, setData] = useState<SMSResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchSMS = useCallback(async () => {
    try {
      const res = await fetch('/api/brain/sms')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: SMSResponse = await res.json()
      setData(json)
      setError(null)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial fetch + auto-refresh every 5s
  useEffect(() => {
    fetchSMS()
    const id = setInterval(fetchSMS, 5000)
    return () => clearInterval(id)
  }, [fetchSMS])

  const modem = data?.modem
  const messages = data?.messages ?? []
  const modemAge = modem ? Math.floor((Date.now() - new Date(modem.timestamp).getTime()) / 1000) : null
  const modemConnected = modem?.modemStatus === 'connected' && modemAge !== null && modemAge < 120

  return (
    <div className="min-h-screen bg-pi-bg text-pi-text">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-pi-panel/90 backdrop-blur-md border-b border-pi-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 rounded-lg text-pi-text-dim hover:text-pi-accent hover:bg-pi-accent/10 transition-all"
            aria-label="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-pi-accent" />
            <h1 className="text-lg font-bold">SMS Log</h1>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {/* Modem status */}
            {modem && (
              <div className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border',
                modemConnected
                  ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
                  : 'border-red-500/20 bg-red-500/10 text-red-400'
              )}>
                <Radio className="w-3 h-3" />
                <span>{modemConnected ? 'Connected' : 'Disconnected'}</span>
                {modem.signalStrength > 0 && (
                  <>
                    <span className="text-pi-text-dim/40">|</span>
                    <SignalIcon strength={modem.signalStrength} />
                    <span className="font-mono">{modem.signalStrength}/31</span>
                  </>
                )}
              </div>
            )}
            <button
              onClick={() => { setLoading(true); fetchSMS() }}
              className="p-1.5 rounded-lg text-pi-text-dim hover:text-pi-accent hover:bg-pi-accent/10 transition-all"
              title="Refresh"
            >
              <RefreshCw className={cn('w-4 h-4', loading && 'animate-spin')} />
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        {/* Modem stats bar */}
        {modem && (
          <div className="flex items-center gap-4 mb-6 px-3 py-2 rounded-lg bg-pi-surface/60 border border-pi-border/50 text-[11px] text-pi-text-dim">
            <span>Sent: <strong className="text-pi-text">{modem.sendCount ?? 0}</strong></span>
            <span>Errors: <strong className={cn(modem.errorCount ? 'text-pi-danger' : 'text-pi-text')}>{modem.errorCount ?? 0}</strong></span>
            <span>SIM: <strong className={cn(modem.simReady ? 'text-pi-success' : 'text-pi-danger')}>{modem.simReady ? 'Ready' : 'Not ready'}</strong></span>
            {modemAge !== null && (
              <span className="ml-auto">Last heartbeat: <strong className="text-pi-text">{modemAge < 60 ? `${modemAge}s ago` : `${Math.floor(modemAge / 60)}m ago`}</strong></span>
            )}
          </div>
        )}

        {/* Loading state */}
        {loading && !data && (
          <div className="flex items-center justify-center py-20">
            <RefreshCw className="w-6 h-6 text-pi-accent animate-spin" />
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400 mb-4">
            Failed to load SMS log: {error}
          </div>
        )}

        {/* Empty state */}
        {data && messages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-pi-text-dim">
            <MessageSquare className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">No messages yet</p>
            <p className="text-xs mt-1">SMS messages will appear here when sent or received</p>
          </div>
        )}

        {/* Message list */}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'flex mb-3',
                msg.direction === 'out' ? 'justify-end' : 'justify-start'
              )}
            >
              <div className={cn(
                'max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 border',
                msg.direction === 'out'
                  ? 'bg-pi-accent/10 border-pi-accent/20 rounded-br-md'
                  : 'bg-pi-surface border-pi-border rounded-bl-md'
              )}>
                {/* Header: direction + number */}
                <div className="flex items-center gap-2 mb-1">
                  {msg.direction === 'in' ? (
                    <ArrowDownLeft className="w-3 h-3 text-emerald-400 shrink-0" />
                  ) : (
                    <ArrowUpRight className="w-3 h-3 text-pi-accent shrink-0" />
                  )}
                  <span className="text-xs font-mono font-medium text-pi-text-dim">
                    {msg.number}
                  </span>
                  {msg.source && (
                    <span className="text-[9px] px-1.5 py-px rounded-full bg-pi-surface/80 border border-pi-border/50 text-pi-text-dim">
                      {msg.source}
                    </span>
                  )}
                </div>

                {/* Body */}
                <p className="text-sm text-pi-text leading-relaxed whitespace-pre-wrap break-words">
                  {msg.body}
                </p>

                {/* Timestamp */}
                <div className="mt-1.5 text-right">
                  <time
                    className="text-[10px] text-pi-text-dim/60"
                    title={formatFullTimestamp(msg.timestamp)}
                    dateTime={msg.timestamp}
                  >
                    {formatTimestamp(msg.timestamp)}
                  </time>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </main>
    </div>
  )
}
