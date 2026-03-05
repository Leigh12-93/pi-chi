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
    // Compute stats from projects
    const total = projects.length
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

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

    setStats({
      totalProjects: total,
      totalMessages: 0, // Would need separate query
      totalDeployments: 0, // Would need separate query
      recentActivity: Object.entries(days).map(([date, count]) => ({ date, count })),
    })
    setLoading(false)
  }, [projects])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-forge-text-dim" />
      </div>
    )
  }

  const cards = [
    { label: 'Projects', value: stats.totalProjects, icon: FolderGit2, color: 'text-blue-400' },
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
          <div key={card.label} className="p-3 rounded-xl bg-forge-surface border border-forge-border">
            <div className="flex items-center gap-2 mb-1">
              <card.icon className={cn('w-4 h-4', card.color)} />
              <span className="text-[10px] text-forge-text-dim uppercase tracking-wider">{card.label}</span>
            </div>
            <p className="text-xl font-bold text-forge-text">
              {card.value}
              {card.suffix && <span className="text-xs font-normal text-forge-text-dim ml-1">{card.suffix}</span>}
            </p>
          </div>
        ))}
      </div>

      {/* Activity chart */}
      <div className="p-3 rounded-xl bg-forge-surface border border-forge-border">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-forge-accent" />
          <span className="text-[10px] text-forge-text-dim uppercase tracking-wider">Activity (7 days)</span>
        </div>
        <div className="flex items-end gap-1 h-16">
          {stats.recentActivity.map(day => (
            <div key={day.date} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full bg-forge-accent/20 rounded-t"
                style={{ height: `${Math.max(4, (day.count / maxActivity) * 100)}%` }}
              >
                <div
                  className="w-full bg-forge-accent rounded-t transition-all"
                  style={{ height: day.count > 0 ? '100%' : '0%' }}
                />
              </div>
              <span className="text-[8px] text-forge-text-dim/50">
                {new Date(day.date).toLocaleDateString('en', { weekday: 'narrow' })}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
