'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, X, CheckCircle, AlertTriangle, Info, Rocket } from 'lucide-react'
import { cn, formatRelative } from '@/lib/utils'

export interface Notification {
  id: string
  type: 'success' | 'error' | 'info' | 'deploy'
  title: string
  description?: string
  timestamp: number
  read: boolean
}

interface NotificationCenterProps {
  notifications: Notification[]
  onMarkAllRead: () => void
  onDismiss: (id: string) => void
}

const ICON_MAP = {
  success: { Icon: CheckCircle, color: 'text-emerald-500' },
  error: { Icon: AlertTriangle, color: 'text-red-500' },
  info: { Icon: Info, color: 'text-blue-500' },
  deploy: { Icon: Rocket, color: 'text-purple-500' },
}

export function NotificationCenter({ notifications, onMarkAllRead, onDismiss }: NotificationCenterProps) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const [bellRing, setBellRing] = useState(false)
  const prevUnreadRef = useRef(0)

  const unreadCount = notifications.filter(n => !n.read).length

  // Trigger bell ring animation when new unread notifications arrive
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setBellRing(true)
      const timer = setTimeout(() => setBellRing(false), 600)
      return () => clearTimeout(timer)
    }
    prevUnreadRef.current = unreadCount
  }, [unreadCount])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(prev => !prev); if (!open) onMarkAllRead() }}
        className="relative p-2 sm:p-1.5 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors"
        title="Notifications"
        aria-label="Notifications"
      >
        <Bell className={cn('w-3.5 h-3.5', bellRing && 'animate-bell-ring')} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 text-[8px] font-bold text-white bg-forge-accent rounded-full flex items-center justify-center animate-pulse-dot">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-72 bg-forge-bg border border-forge-border rounded-xl shadow-xl overflow-hidden animate-fade-in-up z-50">
          <div className="flex items-center justify-between px-3 py-2 border-b border-forge-border">
            <span className="text-xs font-medium text-forge-text">Notifications</span>
            {notifications.length > 0 && (
              <button onClick={onMarkAllRead} className="text-[10px] text-forge-text-dim hover:text-forge-accent transition-colors">
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-64 overflow-y-auto scroll-fade-bottom" role="log" aria-label="Notification history">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-forge-text-dim">
                No notifications yet
              </div>
            ) : (
              notifications.slice(0, 20).map((notif, idx) => {
                const { Icon, color } = ICON_MAP[notif.type]
                return (
                  <div
                    key={notif.id}
                    className={cn(
                      'flex items-start gap-2 px-3 py-2 border-b border-forge-border/50 last:border-0 hover:bg-forge-surface/50 transition-all hover:-translate-y-px animate-fade-in-up',
                      !notif.read && 'bg-forge-accent/5',
                    )}
                    style={{ animationDelay: `${idx * 30}ms` }}
                  >
                    <Icon className={cn('w-3.5 h-3.5 mt-0.5 shrink-0', color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-forge-text truncate">{notif.title}</p>
                      {notif.description && (
                        <p className="text-[10px] text-forge-text-dim truncate">{notif.description}</p>
                      )}
                      <span className="text-[9px] text-forge-text-dim/60">
                        {formatRelative(notif.timestamp)}
                      </span>
                    </div>
                    <button
                      onClick={() => onDismiss(notif.id)}
                      className="p-0.5 rounded text-forge-text-dim/50 hover:text-forge-text-dim transition-colors shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

