'use client'

import { useState, useEffect } from 'react'
import { BarChart3, FolderGit2, MessageSquare, Rocket, Clock, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface UsageDashboardProps {
  projects: { id: string; name: string; updated_at: string; created_at: string }[]
}

export function UsageDashboard({ projects }: UsageDashboardProps) {
  const [stats, setStats] = useState({
    totalProjects: 0,
    totalMessages: 0,
    totalDeployments: 0,
    recentActivity: [] as { date: string; count: number }[],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const total = projects.length
    const now = new Date()

    // Activity by day (last 7 days)
    const days: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000)
      days[date.toISOString().split('T')[0]] = 0
    }
    for (const p of projects) {
      const date = new Date(p.updated_at).toISOString().split('T')[0]
      if (date in days) days[date]++
    }

    // Fetch real message + deployment counts
    const fetchCounts = async () => {
      let messages = 0
      let deployments = 0

      try {
        const res = await fetch('/api/db/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: `SELECT
              (SELECT count(*) FROM pi_chat_messages WHERE role = 'user') as message_count,
              (SELECT count(*) FROM pi_deployments) as deployment_count`,
          }),
        })
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data) && data.length > 0) {
            messages = parseInt(data[0].message_count) || 0
            deployments = parseInt(data[0].deployment_count) || 0
          }
        }
      } catch {
        // Fall back to 0 if query fails
      }

      setStats({
        totalProjects: total,
        totalMessages: messages,
        totalDeployments: deployments,
        recentActivity: Object.entries(days).map(([date, count]) => ({ date, count })),
      })
      setLoading(false)
    }

    fetchCounts()
  }, [projects])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-pi-text-dim" />
      </div>
    )
  }

  const cards = [
    { label: 'Projects', value: stats.totalProjects, icon: FolderGit2, color: 'text-blue-400' },
    { label: 'Messages', value: stats.totalMessages, icon: MessageSquare, color: 'text-purple-400' },
    { label: 'Deploys', value: stats.totalDeployments, icon: Rocket, color: 'text-orange-400' },
    { label: 'Recent', value: projects.filter(p => {
      const d = new Date(p.updated_at)
      return d.getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
    }).length, icon: Clock, color: 'text-green-400', suffix: 'this week' },
  ]

  const maxActivity = Math.max(1, ...stats.recentActivity.map(a => a.count))

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map(card => (
          <div key={card.label} className="p-3 rounded-xl bg-pi-surface border border-pi-border">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={cn('w-4 h-4', card.color)} />
              <span className="text-[10px] text-pi-text-dim uppercase tracking-wider">{card.label}</span>
            </div>
            <p className="text-xl font-bold text-pi-text">
              {card.value}
              {card.suffix && <span className="text-xs font-normal text-pi-text-dim ml-1">{card.suffix}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Activity chart */}
      <div className="p-3 rounded-xl bg-pi-surface border border-pi-border">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-pi-accent" />
          <span className="text-[10px] text-pi-text-dim uppercase tracking-wider">Activity (7 days)</span>
        </div>
        <div className="flex items-end gap-1 h-16">
          {stats.recentActivity.map(day => (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-pi-accent/20 rounded-t"
                style={{ height: `${Math.max(4, (day.count / maxActivity) * 100)}%` }}
              >
                <div
                  className="w-full bg-pi-accent rounded-t transition-all"
                  style={{ height: day.count > 0 ? '100%' : '0%' }}
                />
              </div>
              <span className="text-[8px] text-pi-text-dim/50">
                {new Date(day.date).toLocaleDateString('en', { weekday: 'narrow' })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
