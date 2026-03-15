'use client'

import {
  Target, Briefcase, Radar, AlertTriangle, Heart, Cpu,
  Activity,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DashboardSummary } from '@/lib/brain/domain-types'
import type { SystemVitals } from '@/lib/agent-types'
import type { MoodState } from '@/lib/brain/brain-types'
import type { MoodSnapshot } from '@/hooks/use-agent-state'
import { CurrentMissionCard } from './current-mission-card'
import { PortfolioSummary } from './portfolio-summary'
import { OpportunityRadar } from './opportunity-radar'
import { AttentionPanel } from './attention-panel'
import { MoodPanel } from './mood-panel'
import { VitalsPanel } from './vitals-panel'
import { CollapsibleSection } from './collapsible-section'
import { ActivityFeed } from './activity-feed'
import type { ActivityEntry } from '@/lib/agent-types'

interface ContextRailProps {
  summary: DashboardSummary
  vitals?: SystemVitals | null
  devMode?: boolean
  mood?: MoodState | null
  moodHistory: MoodSnapshot[]
  activity: ActivityEntry[]
  agentStatus: 'idle' | 'thinking' | 'executing' | 'error'
  onOpenDrawer?: (_section: string) => void
  className?: string
}

export function ContextRail({
  summary, vitals, devMode, mood, moodHistory,
  activity, agentStatus, className,
}: ContextRailProps) {
  return (
    <div className={cn('h-full overflow-y-auto bg-pi-panel border-l border-pi-border', className)}>
      {/* Active Mission */}
      <CollapsibleSection title="Mission" icon={Target} defaultOpen={true}>
        <CurrentMissionCard mission={summary.currentMission} nowDoing={summary.nowDoing} />
      </CollapsibleSection>

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

      {/* Portfolio */}
      <CollapsibleSection title="Portfolio" icon={Briefcase} defaultOpen={true}>
        <PortfolioSummary
          topBusiness={summary.topBusiness}
          portfolioValue={summary.portfolioValue}
          portfolioTarget={summary.portfolioTarget}
        />
      </CollapsibleSection>

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

      {/* Opportunities */}
      <CollapsibleSection title="Opportunities" icon={Radar} defaultOpen={true}>
        <OpportunityRadar topOpportunity={summary.topOpportunity} />
      </CollapsibleSection>

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

      {/* Mood / Energy */}
      <CollapsibleSection title="Mood" icon={Heart} defaultOpen={true}>
        <MoodPanel mood={mood || undefined} moodHistory={moodHistory} />
      </CollapsibleSection>

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

      {/* System Vitals */}
      {vitals && (
        <CollapsibleSection title="Vitals" icon={Cpu} defaultOpen={false}>
          <VitalsPanel vitals={vitals} devMode={devMode} />
        </CollapsibleSection>
      )}

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

      {/* Recent Activity */}
      <CollapsibleSection title="Recent Actions" icon={Activity} defaultOpen={false}>
        <div className="max-h-[200px] overflow-y-auto">
          <ActivityFeed entries={activity.slice(-10)} agentStatus={agentStatus} />
        </div>
      </CollapsibleSection>

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

      {/* Attention */}
      {summary.attentionNeeded.length > 0 && (
        <>
          <CollapsibleSection title="Attention" icon={AlertTriangle} defaultOpen={true}>
            <AttentionPanel items={summary.attentionNeeded} />
          </CollapsibleSection>
          <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />
        </>
      )}

      <div className="h-4" />
    </div>
  )
}
