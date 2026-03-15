'use client'

import {
  Target, Briefcase, Radar, AlertTriangle, Heart, Cpu,
  Activity, BookOpen, FlaskConical, Trophy, FolderKanban, BrainCircuit, FileText,
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
import { WorkQueueCard } from './work-queue-card'
import { AutomationTimeline } from './automation-timeline'
import { CycleSummaryCard } from './cycle-summary-card'
import { RecentCyclesList } from './recent-cycles-list'
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
  activity, agentStatus, onOpenDrawer, className,
}: ContextRailProps) {
  return (
    <div className={cn('h-full overflow-y-auto bg-pi-panel border-l border-pi-border alive-panel context-rail-shell', className)}>
      {/* Active Mission */}
      <CollapsibleSection title="Mission" icon={Target} defaultOpen={true}>
        <CurrentMissionCard
          mission={summary.currentMission}
          nowDoing={summary.nowDoing}
          cyclePhase={summary.cyclePhase}
          lastEventLabel={summary.lastEventLabel}
          autonomyReason={summary.autonomyReason}
          nextUp={summary.nextUp}
        />
      </CollapsibleSection>

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

      <CollapsibleSection title="Queue" icon={Target} defaultOpen={true} badge={summary.workQueue.length}>
        <WorkQueueCard items={summary.workQueue} />
      </CollapsibleSection>

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

      <CollapsibleSection title="Background Loop" icon={Activity} defaultOpen={true} badge={summary.backgroundEvents.length}>
        <AutomationTimeline events={summary.backgroundEvents} />
      </CollapsibleSection>

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

      <CollapsibleSection title="Last Cycle" icon={Activity} defaultOpen={true}>
        <CycleSummaryCard cycle={summary.lastCycle} />
      </CollapsibleSection>

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

      <CollapsibleSection title="Cycle History" icon={Activity} defaultOpen={false} badge={summary.recentCycles.length}>
        <RecentCyclesList cycles={summary.recentCycles} />
      </CollapsibleSection>

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

      {/* Portfolio */}
      <CollapsibleSection title="Portfolio" icon={Briefcase} defaultOpen={true}>
        <PortfolioSummary
          topBusiness={summary.topBusiness}
          portfolioValue={summary.portfolioValue}
          portfolioTarget={summary.portfolioTarget}
          topStretchGoal={summary.topStretchGoal}
        />
      </CollapsibleSection>

      <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

      {/* Opportunities */}
      <CollapsibleSection title="Opportunities" icon={Radar} defaultOpen={true}>
        <OpportunityRadar topOpportunity={summary.topOpportunity} opportunityCount={summary.opportunityCount} />
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

      {onOpenDrawer && (
        <>
          <CollapsibleSection title="Deep Mind" icon={BookOpen} defaultOpen={false}>
            <div className="grid grid-cols-2 gap-2 px-3 py-3">
              <DrawerButton label="Memories" icon={BookOpen} onClick={() => onOpenDrawer('memories')} />
              <DrawerButton label="Research" icon={BrainCircuit} onClick={() => onOpenDrawer('research')} />
              <DrawerButton label="Growth" icon={FlaskConical} onClick={() => onOpenDrawer('growth')} />
              <DrawerButton label="Projects" icon={FolderKanban} onClick={() => onOpenDrawer('projects')} />
              <DrawerButton label="Skills" icon={Cpu} onClick={() => onOpenDrawer('skills')} />
              <DrawerButton label="Awards" icon={Trophy} onClick={() => onOpenDrawer('achievements')} />
              <DrawerButton label="Prompts" icon={FileText} onClick={() => onOpenDrawer('prompts')} />
            </div>
          </CollapsibleSection>

          <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />
        </>
      )}

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

function DrawerButton({
  label,
  icon: Icon,
  onClick,
}: {
  label: string
  icon: React.ElementType
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg border border-pi-border bg-pi-surface/40 px-2.5 py-2 text-left text-[11px] text-pi-text-dim transition-all hover:border-pi-accent/30 hover:bg-pi-surface hover:text-pi-text"
    >
      <Icon className="h-3.5 w-3.5 text-pi-accent" />
      <span>{label}</span>
    </button>
  )
}
