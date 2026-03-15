'use client'

import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { BusinessProfile } from '@/lib/brain/domain-types'

interface PortfolioSummaryProps {
  topBusiness: BusinessProfile | null
  portfolioValue: number | null
  portfolioTarget: number
}

function formatCurrency(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`
  return `$${val.toFixed(0)}`
}

const healthDots: Record<BusinessProfile['health'], string> = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  unknown: 'bg-gray-500',
}

export function PortfolioSummary({ topBusiness, portfolioValue, portfolioTarget }: PortfolioSummaryProps) {
  const progress = portfolioValue !== null && portfolioTarget > 0
    ? Math.min(100, (portfolioValue / portfolioTarget) * 100)
    : null
  const recentlyActive = topBusiness ? Date.now() - new Date(topBusiness.lastActionAt).getTime() < 86_400_000 : false

  return (
    <div className="px-3 py-3 space-y-3">
      {/* Portfolio progress to $1M */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-pi-text-dim font-medium">Annual Run Rate</span>
          {portfolioValue !== null ? (
            <span className="text-[11px] font-mono font-semibold text-pi-text">
              {formatCurrency(portfolioValue)} <span className="text-pi-text-dim">/ {formatCurrency(portfolioTarget)}</span>
            </span>
          ) : (
            <span className="text-[10px] text-pi-text-dim italic">No revenue signal yet</span>
          )}
        </div>
        <div className={cn('portfolio-bar', progress !== null && progress > 0 && 'is-live')}>
          <div className="portfolio-bar-fill" style={{ width: `${progress ?? 0}%` }} />
        </div>
        <p className="text-[9px] text-pi-text-dim mt-1">
          {progress !== null ? `${progress.toFixed(1)}% to target` : 'Connect a real ARR signal before showing progress'}
        </p>
      </div>

      {/* Top business */}
      {topBusiness && (
        <div className={cn('bg-pi-surface/50 rounded-lg px-2.5 py-2 border border-pi-border/50', recentlyActive && 'alive-panel')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className={cn('w-2 h-2 rounded-full', healthDots[topBusiness.health], recentlyActive && 'animate-pulse')} />
              <span className="text-[11px] font-semibold text-pi-text">{topBusiness.name}</span>
            </div>
            <div className="flex items-center gap-0.5">
              {topBusiness.momentum > 10 && <TrendingUp className="w-3 h-3 text-emerald-500" />}
              {topBusiness.momentum < -10 && <TrendingDown className="w-3 h-3 text-red-500" />}
              {topBusiness.momentum >= -10 && topBusiness.momentum <= 10 && <Minus className="w-3 h-3 text-pi-text-dim" />}
              <span className={cn(
                'text-[10px] font-mono font-semibold',
                topBusiness.momentum > 0 ? 'text-emerald-500' : topBusiness.momentum < 0 ? 'text-red-400' : 'text-pi-text-dim'
              )}>
                {topBusiness.momentum > 0 ? '+' : ''}{topBusiness.momentum}
              </span>
            </div>
          </div>
          {topBusiness.nextMilestone && (
            <p className="text-[10px] text-pi-text-dim mt-1 truncate">
              Next: {topBusiness.nextMilestone}
            </p>
          )}
          <p className="mt-1 text-[9px] text-pi-text-dim/80">
            {recentlyActive ? 'Updated in the last 24h' : 'Awaiting fresh portfolio movement'}
          </p>
          {topBusiness.riskFlags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {topBusiness.riskFlags.slice(0, 3).map((flag, i) => (
                <span key={i} className="text-[8px] px-1.5 py-px rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  {flag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {!topBusiness && (
        <p className="text-[11px] text-pi-text-dim italic">No businesses tracked yet</p>
      )}
    </div>
  )
}
