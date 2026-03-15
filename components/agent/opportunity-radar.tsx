'use client'

import { Radar } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { Opportunity } from '@/lib/brain/domain-types'

interface OpportunityRadarProps {
  topOpportunity: Opportunity | null
  opportunityCount: number
}

const stageLabels: Record<Opportunity['stage'], string> = {
  signal: 'Signal',
  idea: 'Idea',
  research: 'Research',
  validation: 'Validation',
  candidate: 'Candidate',
  incubation: 'Incubation',
  launched: 'Launched',
  discarded: 'Discarded',
}

const stageColors: Record<Opportunity['stage'], string> = {
  signal: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  idea: 'text-purple-400 bg-purple-500/10 border-purple-500/20',
  research: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  validation: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  candidate: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
  incubation: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  launched: 'text-green-400 bg-green-500/10 border-green-500/20',
  discarded: 'text-red-400 bg-red-500/10 border-red-500/20',
}

export function OpportunityRadar({ topOpportunity, opportunityCount }: OpportunityRadarProps) {
  if (!topOpportunity) {
    return (
      <div className="px-3 py-3">
        <div className="flex items-center gap-2 text-pi-text-dim alive-panel rounded-lg border border-pi-border/40 bg-pi-surface/30 px-2.5 py-2">
          <Radar className="w-4 h-4 opacity-50 animate-pulse" />
          <p className="text-[11px] italic">Scanning for opportunities...</p>
        </div>
      </div>
    )
  }

  const freshnessHours = Math.max(0, Math.floor((Date.now() - new Date(topOpportunity.updatedAt).getTime()) / 3_600_000))

  return (
    <div className="px-3 py-3">
      <div className="bg-pi-surface/50 rounded-lg px-2.5 py-2 border border-pi-border/50 alive-panel">
        <div className="flex items-center justify-between mb-1">
          <span className={cn(
            'text-[9px] px-1.5 py-px rounded-full font-semibold border',
            stageColors[topOpportunity.stage]
          )}>
            {stageLabels[topOpportunity.stage]}
          </span>
          <span className="text-[10px] font-mono text-pi-text-dim">
            {topOpportunity.confidence}% conf
          </span>
        </div>
        <p className="text-[11px] font-semibold text-pi-text leading-tight mt-1">
          {topOpportunity.title}
        </p>
        {topOpportunity.description && (
          <p className="text-[10px] text-pi-text-dim mt-1 line-clamp-2 leading-snug">
            {topOpportunity.description}
          </p>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="text-[9px] text-pi-text-dim">
            Source: {topOpportunity.source}
          </span>
          <span className="text-[9px] text-pi-text-dim/80">
            {opportunityCount} tracked
          </span>
        </div>
        <p className="mt-1 text-[9px] text-pi-text-dim/80">
          {freshnessHours < 1 ? 'Updated this hour' : `Updated ${freshnessHours}h ago`}
        </p>
      </div>
    </div>
  )
}
