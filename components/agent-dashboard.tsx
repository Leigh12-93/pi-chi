'use client'

import { useState, useRef, useEffect, useMemo, Suspense, lazy } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  Activity, Terminal as TerminalIcon,
  Target, Bot, BookOpen,
  BarChart3, X,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import { BrainChat } from '@/components/agent/brain-chat'
import { GoalsPanel } from '@/components/agent/goals-panel'
import { ActivityFeed } from '@/components/agent/activity-feed'
import { BrainHeader } from '@/components/agent/brain-header'
import { UnifiedOpsPanel } from '@/components/agent/unified-ops-panel'
import { DisplayModeBanner } from '@/components/agent/display-mode-banner'
import { AgentStatusIndicator } from '@/components/agent/agent-status'
import { BusinessesPanel } from '@/components/agent/businesses-panel'
import { MoodPanel } from '@/components/agent/mood-panel'
import { VitalsPanel } from '@/components/agent/vitals-panel'
import { CurrentMissionCard } from '@/components/agent/current-mission-card'
import { WorkQueueCard } from '@/components/agent/work-queue-card'
import { PanelErrorBoundary } from '@/components/error-boundary'
import { useSystemVitals } from '@/hooks/use-system-vitals'
import { useAgentState } from '@/hooks/use-agent-state'
import { usePiTerminal } from '@/hooks/use-pi-terminal'
import { useBusinessMetrics } from '@/hooks/use-business-metrics'
import type { BusinessMetrics } from '@/hooks/use-business-metrics'
import type { SystemVitals } from '@/lib/agent-types'
import type { BusinessProfile, DashboardSummary } from '@/lib/brain/domain-types'

// Lazy load panels for Pi 4B performance
const MemoriesPanel = lazy(() => import('@/components/agent/memories-panel').then(m => ({ default: m.MemoriesPanel })))
const ResearchThreadsPanel = lazy(() => import('@/components/agent/research-threads-panel').then(m => ({ default: m.ResearchThreadsPanel })))
const GrowthLogPanel = lazy(() => import('@/components/agent/growth-log-panel').then(m => ({ default: m.GrowthLogPanel })))
const ProjectsPanel = lazy(() => import('@/components/agent/projects-panel').then(m => ({ default: m.ProjectsPanel })))
const CapabilitiesPanel = lazy(() => import('@/components/agent/capabilities-panel').then(m => ({ default: m.CapabilitiesPanel })))
const AchievementsPanel = lazy(() => import('@/components/agent/achievements-panel').then(m => ({ default: m.AchievementsPanel })))
const PromptViewer = lazy(() => import('@/components/agent/prompt-viewer').then(m => ({ default: m.PromptViewer })))
const SettingsPanel = lazy(() => import('@/components/agent/settings-panel').then(m => ({ default: m.SettingsPanel })))

/* ─── Props ─────────────────────────────────────── */

interface AgentDashboardProps {
  projectName: string
  projectId: string | null
  files: Record<string, string>
  activeFile: string | null
  onFileSelect: (path: string) => void
  onFileChange: (path: string, content: string) => void
  onFileDelete: (path: string) => void
  onBulkFileUpdate: (files: Record<string, string>) => void
  githubToken?: string
  pendingMessage?: string | null
  onPendingMessageSent?: () => void
}

/* ─── Tab types ─────────────────────────────────── */

type MobileTab = 'chat' | 'context' | 'goals' | 'activity' | 'terminal'
type CenterTab = 'chat' | 'businesses' | 'activity' | 'mind' | 'terminal'
type MindSubTab = 'memories' | 'research' | 'growth' | 'projects' | 'skills' | 'achievements' | 'prompts'
type DrawerSection = 'memories' | 'research' | 'growth' | 'projects' | 'skills' | 'achievements' | 'prompts' | 'mission' | 'mood' | 'vitals' | 'queue' | 'mind' | null

/* ─── Mobile tab config ─────────────────────────── */

const mobileTabs: { id: MobileTab; icon: React.ElementType; label: string }[] = [
  { id: 'chat', icon: Bot, label: 'Chat' },
  { id: 'context', icon: Target, label: 'Status' },
  { id: 'goals', icon: Target, label: 'Goals' },
  { id: 'activity', icon: Activity, label: 'Activity' },
  { id: 'terminal', icon: TerminalIcon, label: 'Terminal' },
]

/* ─── Mind sub-tab config ───────────────────────── */

const mindSubTabs: { id: MindSubTab; label: string }[] = [
  { id: 'memories', label: 'Memories' },
  { id: 'research', label: 'Research' },
  { id: 'growth', label: 'Growth' },
  { id: 'projects', label: 'Projects' },
  { id: 'skills', label: 'Skills' },
  { id: 'achievements', label: 'Achievements' },
  { id: 'prompts', label: 'Prompts' },
]

/* ─── Lazy loading fallback ─────────────────────── */

function PanelSkeleton() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-2 text-pi-text-dim">
        <div className="w-6 h-6 border-2 border-pi-accent/30 border-t-pi-accent rounded-full animate-spin" />
        <span className="text-[10px]">Loading...</span>
      </div>
    </div>
  )
}

/* ─── useMediaQuery ────────────────────────────── */

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    const mql = window.matchMedia(query)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}

/* ─── Deep Inspection Drawer ──────────────────── */

function DeepDrawer({ section, onClose, agent, vitals, devMode, onNavigate }: {
  section: DrawerSection
  onClose: () => void
  agent: ReturnType<typeof useAgentState>
  vitals?: SystemVitals | null
  devMode?: boolean
  onNavigate?: (s: DrawerSection) => void
}) {
  if (!section) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex justify-end"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 400, damping: 35 }}
          className="w-full max-w-md h-full bg-pi-panel border-l border-pi-border shadow-2xl overflow-y-auto"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-pi-border sticky top-0 bg-pi-panel/95 backdrop-blur-sm z-10">
            <h2 className="text-sm font-bold text-pi-text capitalize">{section}</h2>
            <button onClick={onClose} className="p-1.5 rounded-lg text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-1">
            <Suspense fallback={<PanelSkeleton />}>
              {section === 'memories' && <MemoriesPanel memories={agent.memories} />}
              {section === 'research' && <ResearchThreadsPanel threads={agent.threads} />}
              {section === 'growth' && <GrowthLogPanel growthLog={agent.growthLog} />}
              {section === 'projects' && <ProjectsPanel projects={agent.projects} />}
              {section === 'skills' && <CapabilitiesPanel capabilities={agent.capabilities} />}
              {section === 'achievements' && <AchievementsPanel achievements={agent.achievements} brainMeta={agent.brainMeta} />}
              {section === 'prompts' && <PromptViewer promptOverrides={agent.promptOverrides} promptEvolutions={agent.promptEvolutions} />}
              {section === 'mission' && (
                <CurrentMissionCard
                  mission={agent.summary.currentMission}
                  nowDoing={agent.summary.nowDoing}
                  cyclePhase={agent.summary.cyclePhase}
                  lastEventLabel={agent.summary.lastEventLabel}
                  autonomyReason={agent.summary.autonomyReason}
                  nextUp={agent.summary.nextUp}
                />
              )}
              {section === 'mood' && <MoodPanel mood={agent.mood || undefined} moodHistory={agent.moodHistory} />}
              {section === 'vitals' && vitals && <VitalsPanel vitals={vitals} devMode={devMode} />}
              {section === 'queue' && <WorkQueueCard items={agent.summary.workQueue} />}
              {section === 'mind' && (
                <div className="grid grid-cols-2 gap-2 p-3">
                  {(['memories', 'research', 'growth', 'projects', 'skills', 'achievements', 'prompts'] as const).map(s => (
                    <button
                      key={s}
                      onClick={() => onNavigate?.(s)}
                      className="flex items-center gap-2 rounded-lg border border-pi-border bg-pi-surface/40 px-2.5 py-2 text-left text-[11px] text-pi-text-dim transition-all hover:border-pi-accent/30 hover:bg-pi-surface hover:text-pi-text capitalize"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </Suspense>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

/* ─── Component ─────────────────────────────────── */

export function AgentDashboard(_props: AgentDashboardProps) {
  const [centerTab, setCenterTab] = useState<CenterTab>('chat')
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')
  const [mindSubTab, setMindSubTab] = useState<MindSubTab>('memories')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [drawerSection, setDrawerSection] = useState<DrawerSection>(null)
  const prevBrainStatusRef = useRef<string>('')

  // Hooks
  const { vitals, devMode } = useSystemVitals()
  const agent = useAgentState()
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const terminal = usePiTerminal({
    isVisible: isDesktop ? centerTab === 'terminal' : mobileTab === 'terminal',
  })
  const { businesses: bizMetrics } = useBusinessMetrics()

  // Unread brain messages count for badge
  const unreadBrainMessages = useMemo(
    () => agent.chatMessages.filter(m => m.from === 'brain' && !m.read).length,
    [agent.chatMessages]
  )

  // Count of businesses with warning or critical health
  const bizAlertCount = useMemo(
    () => bizMetrics.filter(b => b.health === 'warning' || b.health === 'critical').length,
    [bizMetrics]
  )

  const dashboardSummary = useMemo(
    () => enhanceSummaryWithBusinessMetrics(agent.summary, bizMetrics),
    [agent.summary, bizMetrics]
  )

  // Brain status drives agent status indicator
  useEffect(() => {
    agent.setAgentStatus(agent.brainStatus === 'running' ? 'thinking' : 'idle')
  }, [agent.brainStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Toast notifications
  useEffect(() => {
    const newStatus = agent.brainStatus
    const oldStatus = prevBrainStatusRef.current
    if (oldStatus && oldStatus !== newStatus) {
      if (newStatus === 'sleeping' && oldStatus === 'running') {
        toast('Brain entering sleep', { description: 'Waiting for next wake cycle' })
      } else if (newStatus === 'running' && oldStatus === 'sleeping') {
        toast('Brain is awake', { description: 'Starting new thought cycle' })
      }
    }
    prevBrainStatusRef.current = newStatus
  }, [agent.brainStatus])

  // Keyboard shortcuts (Ctrl+N for tabs)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const tabs: CenterTab[] = ['chat', 'businesses', 'activity', 'mind', 'terminal']
        const num = parseInt(e.key)
        if (num >= 1 && num <= tabs.length) {
          e.preventDefault()
          setCenterTab(tabs[num - 1])
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Kiosk / CEC remote keyboard navigation
  useEffect(() => {
    const tabs: CenterTab[] = ['chat', 'businesses', 'activity', 'mind', 'terminal']

    function isInputFocused(): boolean {
      const el = document.activeElement
      if (!el) return false
      const tag = el.tagName.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return true
      if ((el as HTMLElement).isContentEditable) return true
      if (el.closest('.xterm')) return true
      return false
    }

    function handleKioskKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.altKey || e.metaKey) return
      if (isInputFocused()) return

      switch (e.key) {
        case 'ArrowRight':
        case 'PageUp': {
          e.preventDefault()
          setCenterTab(prev => {
            const idx = tabs.indexOf(prev)
            return tabs[(idx + 1) % tabs.length]
          })
          break
        }
        case 'ArrowLeft':
        case 'PageDown': {
          e.preventDefault()
          setCenterTab(prev => {
            const idx = tabs.indexOf(prev)
            return tabs[(idx - 1 + tabs.length) % tabs.length]
          })
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const panel = document.querySelector('[data-panel-content="active"]')
            || document.querySelector('.overflow-y-auto')
          if (panel) panel.scrollBy({ top: -120, behavior: 'smooth' })
          break
        }
        case 'ArrowDown': {
          e.preventDefault()
          const panel = document.querySelector('[data-panel-content="active"]')
            || document.querySelector('.overflow-y-auto')
          if (panel) panel.scrollBy({ top: 120, behavior: 'smooth' })
          break
        }
        case 'Escape': {
          if (settingsOpen) { e.preventDefault(); setSettingsOpen(false) }
          if (drawerSection) { e.preventDefault(); setDrawerSection(null) }
          break
        }
        case 'r': {
          e.preventDefault()
          agent.refresh()
          toast('Refreshing dashboard data...')
          break
        }
      }
    }

    window.addEventListener('keydown', handleKioskKeyDown)
    return () => window.removeEventListener('keydown', handleKioskKeyDown)
  }, [settingsOpen, drawerSection, agent])

  /* ─── Center tab config ───────────────────────── */

  const centerTabs: { id: CenterTab; icon: React.ElementType; label: string; badge?: number }[] = [
    { id: 'chat', icon: Bot, label: 'Pi-Chi' },
    { id: 'businesses', icon: BarChart3, label: 'Businesses', badge: bizAlertCount },
    { id: 'activity', icon: Activity, label: 'Activity' },
    { id: 'mind', icon: BookOpen, label: 'Mind' },
    { id: 'terminal', icon: TerminalIcon, label: 'Terminal' },
  ]

  /* ─── Render ──────────────────────────────────── */

  return (
    <div className="h-full flex flex-col overflow-hidden bg-pi-bg">
      {/* ─── Hero Band ─── */}
      <BrainHeader
        brainStatus={agent.brainStatus}
        brainMeta={agent.brainMeta}
        vitals={vitals}
        lastFetchedAt={agent.lastFetchedAt}
        summary={dashboardSummary}
        onRefresh={agent.refresh}
        onSettingsOpen={() => setSettingsOpen(true)}
      />
      <DisplayModeBanner displayMode={dashboardSummary.displayMode} />

      {/* ─── Settings Panel (slide-over) ─── */}
      <Suspense fallback={null}>
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} brainMeta={agent.brainMeta} />
      </Suspense>

      {/* ─── Deep Inspection Drawer ─── */}
      <DeepDrawer
        section={drawerSection}
        onClose={() => setDrawerSection(null)}
        agent={agent}
        vitals={vitals}
        devMode={devMode}
        onNavigate={(s) => setDrawerSection(s)}
      />

      {/* ─── Conditionally render ONLY the active layout ─── */}
      {isDesktop ? (
        /* ─── DESKTOP LAYOUT: Live Stage (65%) + Context Rail (35%) ─── */
        <div className="flex flex-1 overflow-hidden">
          <PanelGroup direction="horizontal" autoSaveId="pi-agent-dashboard-v4" className="flex-1">
            {/* ─── Live Stage: Chat + tabbed panels ─── */}
            <Panel defaultSize={65} minSize={45}>
              <div className="h-full flex flex-col bg-pi-bg dashboard-stage-shell">
                {/* Tab bar */}
                <div className="flex items-center border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm dashboard-stage-tabs" role="tablist">
                  {centerTabs.map((tab, i) => (
                    <button
                      key={tab.id}
                      role="tab"
                      aria-selected={centerTab === tab.id}
                      onClick={() => setCenterTab(tab.id)}
                      className={cn(
                        'relative flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all duration-150',
                        centerTab === tab.id
                          ? 'text-pi-accent'
                          : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface/50'
                      )}
                      title={`Ctrl+${i + 1}`}
                    >
                      <tab.icon className="w-3.5 h-3.5" />
                      {tab.label}
                      {tab.badge !== undefined && tab.badge > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="ml-1 bg-pi-accent text-white text-[8px] font-bold px-1.5 py-px rounded-full min-w-[16px] text-center"
                        >
                          {tab.badge}
                        </motion.span>
                      )}
                      {centerTab === tab.id && (
                        <motion.span
                          layoutId="agent-center-tab-v4"
                          className="absolute bottom-0 left-1 right-1 h-0.5 bg-pi-accent rounded-full"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                    </button>
                  ))}

                  <div className="ml-auto pr-3">
                    <AgentStatusIndicator status={agent.agentStatus} />
                  </div>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-hidden relative">
                  {/* Pi-Chi Chat */}
                  <div className={cn('absolute inset-0', centerTab !== 'chat' && 'hidden')}>
                    <PanelErrorBoundary name="Chat">
                      <BrainChat
                        chatMessages={agent.chatMessages}
                        brainStatus={agent.brainStatus}
                        brainName={agent.brainMeta?.name || 'Pi-Chi'}
                        onSendMessage={agent.injectMessage}
                        onMarkRead={agent.markChatRead}
                        onClearChat={agent.clearChat}
                      />
                    </PanelErrorBoundary>
                  </div>

                  {/* Mind — sub-tabbed panel */}
                  <div className={cn('absolute inset-0 flex flex-col', centerTab !== 'mind' && 'hidden')}>
                    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-pi-border/50 bg-pi-panel/50">
                      {mindSubTabs.map(st => (
                        <button
                          key={st.id}
                          onClick={() => setMindSubTab(st.id)}
                          className={cn(
                            'text-[10px] px-3 py-1 rounded-full font-medium transition-all',
                            mindSubTab === st.id
                              ? 'bg-pi-accent/10 text-pi-accent border border-pi-accent/30'
                              : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface border border-transparent'
                          )}
                        >
                          {st.label}
                        </button>
                      ))}
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <PanelErrorBoundary name="Mind">
                        <Suspense fallback={<PanelSkeleton />}>
                          {mindSubTab === 'memories' && <MemoriesPanel memories={agent.memories} />}
                          {mindSubTab === 'research' && <ResearchThreadsPanel threads={agent.threads} />}
                          {mindSubTab === 'growth' && <GrowthLogPanel growthLog={agent.growthLog} />}
                          {mindSubTab === 'projects' && <ProjectsPanel projects={agent.projects} />}
                          {mindSubTab === 'skills' && <CapabilitiesPanel capabilities={agent.capabilities} />}
                          {mindSubTab === 'achievements' && <AchievementsPanel achievements={agent.achievements} brainMeta={agent.brainMeta} />}
                          {mindSubTab === 'prompts' && <PromptViewer promptOverrides={agent.promptOverrides} promptEvolutions={agent.promptEvolutions} />}
                        </Suspense>
                      </PanelErrorBoundary>
                    </div>
                  </div>

                  {/* Activity */}
                  <div className={cn('absolute inset-0', centerTab !== 'activity' && 'hidden')}>
                    <PanelErrorBoundary name="Activity">
                      <ActivityFeed entries={agent.activity} agentStatus={agent.agentStatus} />
                    </PanelErrorBoundary>
                  </div>

                  {/* Businesses */}
                  <div className={cn('absolute inset-0', centerTab !== 'businesses' && 'hidden')}>
                    <PanelErrorBoundary name="Businesses">
                      <BusinessesPanel />
                    </PanelErrorBoundary>
                  </div>

                  {/* Terminal */}
                  {centerTab === 'terminal' && (
                    <PanelErrorBoundary name="Terminal">
                      <div className="absolute inset-0 bg-[#0a0a0f]">
                        <div ref={terminal.containerRef} className="h-full p-1" />
                      </div>
                    </PanelErrorBoundary>
                  )}
                </div>
              </div>
            </Panel>

            <PanelResizeHandle className="w-[3px] bg-transparent hover:bg-pi-accent/20 active:bg-pi-accent/40 transition-colors relative cursor-col-resize" />

            {/* ─── Unified Ops Panel ─── */}
            <Panel defaultSize={35} minSize={22} maxSize={45}>
              <PanelErrorBoundary name="Ops Panel">
                <UnifiedOpsPanel
                  summary={dashboardSummary}
                  vitals={vitals}
                  devMode={devMode}
                  mood={agent.mood}
                  moodHistory={agent.moodHistory}
                  activity={agent.activity}
                  agentStatus={agent.agentStatus}
                  brainStatus={agent.brainStatus}
                  onOpenDrawer={(section) => setDrawerSection(section as DrawerSection)}
                />
              </PanelErrorBoundary>
            </Panel>
          </PanelGroup>
        </div>
      ) : (
        /* ─── MOBILE LAYOUT (< md) ─── */
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden relative bg-pi-bg">
            <AnimatePresence mode="wait">
              {/* Pi-Chi Chat */}
              {mobileTab === 'chat' && (
                <motion.div
                  key="mobile-chat"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="absolute inset-0 flex flex-col"
                >
                  <BrainChat
                    chatMessages={agent.chatMessages}
                    brainStatus={agent.brainStatus}
                    brainName={agent.brainMeta?.name || 'Pi-Chi'}
                    onSendMessage={agent.injectMessage}
                    onMarkRead={agent.markChatRead}
                    onClearChat={agent.clearChat}
                  />
                </motion.div>
              )}

              {/* Ops Panel (mobile) */}
              {mobileTab === 'context' && (
                <motion.div
                  key="mobile-context"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="absolute inset-0"
                >
                  <UnifiedOpsPanel
                    summary={dashboardSummary}
                    vitals={vitals}
                    devMode={devMode}
                    mood={agent.mood}
                    moodHistory={agent.moodHistory}
                    activity={agent.activity}
                    agentStatus={agent.agentStatus}
                    brainStatus={agent.brainStatus}
                    onOpenDrawer={(section) => setDrawerSection(section as DrawerSection)}
                  />
                </motion.div>
              )}

              {/* Goals */}
              {mobileTab === 'goals' && (
                <motion.div
                  key="mobile-goals"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="absolute inset-0 overflow-y-auto"
                >
                  <div className="px-2 py-3">
                    <GoalsPanel goals={agent.goals} onInjectGoal={agent.injectGoal} />
                  </div>
                </motion.div>
              )}

              {/* Activity */}
              {mobileTab === 'activity' && (
                <motion.div
                  key="mobile-activity"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="absolute inset-0 overflow-y-auto"
                >
                  <div className="px-2 py-3">
                    <ActivityFeed entries={agent.activity} agentStatus={agent.agentStatus} />
                  </div>
                </motion.div>
              )}

              {/* Terminal */}
              {mobileTab === 'terminal' && (
                <motion.div
                  key="mobile-terminal"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="absolute inset-0 bg-[#0a0a0f] flex flex-col"
                >
                  <div ref={terminal.containerRef} className="flex-1 p-2" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ─── Mobile bottom tab bar ─── */}
          <div className="border-t border-pi-border bg-pi-panel/95 backdrop-blur-md supports-[padding-bottom:env(safe-area-inset-bottom)]:pb-[env(safe-area-inset-bottom)]" role="tablist">
            <div className="flex items-center justify-around px-3 py-2">
              {mobileTabs.map(tab => {
                const isActive = mobileTab === tab.id
                const badge = tab.id === 'chat' ? unreadBrainMessages : 0
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => {
                      setMobileTab(tab.id)
                      if ('vibrate' in navigator) navigator.vibrate(10)
                    }}
                    className={cn(
                      'relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all min-w-[60px] min-h-[48px] touch-manipulation',
                      isActive
                        ? 'text-pi-accent bg-pi-accent/10'
                        : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-hover/50 active:bg-pi-hover/70'
                    )}
                  >
                    <div className="relative">
                      <tab.icon className={cn('w-5 h-5 transition-all', isActive && 'scale-110 drop-shadow-sm')} />
                      {badge > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute -top-1.5 -right-1.5 bg-pi-accent text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-md"
                        >
                          {badge > 9 ? '9+' : badge}
                        </motion.span>
                      )}
                    </div>
                    <span className={cn(
                      'text-[10px] font-medium leading-tight',
                      isActive && 'font-semibold'
                    )}>{tab.label}</span>
                    {isActive && (
                      <motion.span
                        layoutId="mobile-tab-indicator"
                        className="absolute -bottom-0.5 w-6 h-0.5 bg-pi-accent rounded-full shadow-sm"
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                      />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function enhanceSummaryWithBusinessMetrics(
  summary: DashboardSummary,
  businesses: BusinessMetrics[]
): DashboardSummary {
  if (businesses.length === 0) return summary

  const scoredBusinesses = businesses.map(mapBusinessMetricsToProfile)
  const topBusiness = [...scoredBusinesses].sort((a, b) => b.priorityScore - a.priorityScore)[0] ?? null
  const attentionNeeded = [...summary.attentionNeeded]
  const healthyCount = scoredBusinesses.filter(biz => biz.health === 'healthy').length
  const warningCount = scoredBusinesses.filter(biz => biz.health === 'warning').length
  const criticalCount = scoredBusinesses.filter(biz => biz.health === 'critical').length

  for (const biz of scoredBusinesses) {
    if (biz.health === 'critical') {
      attentionNeeded.push({
        id: `biz-${biz.id}-critical`,
        level: 'critical',
        message: `${biz.name} needs attention`,
      })
    } else if (biz.health === 'warning') {
      attentionNeeded.push({
        id: `biz-${biz.id}-warning`,
        level: 'warn',
        message: `${biz.name} has gone stale`,
      })
    }
  }

  if (healthyCount >= 3) {
    attentionNeeded.push({
      id: 'portfolio-health-tailwind',
      level: 'info',
      message: `${healthyCount} businesses are currently healthy — lean into growth loops`,
    })
  }
  if (criticalCount >= 2) {
    attentionNeeded.push({
      id: 'portfolio-risk-cluster',
      level: 'critical',
      message: `${criticalCount} businesses are in critical health — stabilize before expanding`,
    })
  } else if (warningCount >= 2) {
    attentionNeeded.push({
      id: 'portfolio-warning-cluster',
      level: 'warn',
      message: `${warningCount} businesses are drifting stale — refresh deployment and delivery cadence`,
    })
  }

  return {
    ...summary,
    topBusiness,
    attentionNeeded: dedupeAttention(attentionNeeded),
  }
}

function mapBusinessMetricsToProfile(biz: BusinessMetrics): BusinessProfile {
  const deployAgeDays = biz.lastDeployAt
    ? (Date.now() - new Date(biz.lastDeployAt).getTime()) / 86_400_000
    : null
  const commitAgeDays = biz.lastCommitAt
    ? (Date.now() - new Date(biz.lastCommitAt).getTime()) / 86_400_000
    : null

  const momentum = biz.health === 'healthy'
    ? 20
    : biz.health === 'warning'
      ? -10
      : biz.health === 'critical'
        ? -35
        : 0

  return {
    id: biz.id,
    name: biz.name,
    stage: biz.health === 'critical' ? 'declining' : biz.health === 'healthy' ? 'growing' : 'launched',
    health: biz.health,
    momentum,
    activeInitiatives: [],
    lastAction: biz.lastCommitMessage || biz.deployStatus || 'No recent action',
    lastActionAt: biz.lastCommitAt || biz.lastDeployAt || new Date(0).toISOString(),
    nextMilestone: deriveNextMilestone(biz, deployAgeDays, commitAgeDays),
    riskFlags: deriveRiskFlags(biz, deployAgeDays, commitAgeDays),
    opportunityScore: biz.health === 'healthy' ? 65 : 35,
    priorityScore: getPriorityScore(biz, deployAgeDays, commitAgeDays),
  }
}

function deriveRiskFlags(
  biz: BusinessMetrics,
  deployAgeDays: number | null,
  commitAgeDays: number | null
): string[] {
  const flags: string[] = []
  if (biz.health === 'critical') flags.push('Critical health')
  if (biz.deployStatus === 'ERROR' || biz.deployStatus === 'CANCELED') flags.push('Deploy failed')
  if (deployAgeDays !== null && deployAgeDays > 30) flags.push('No deploy in 30d')
  if (commitAgeDays !== null && commitAgeDays > 14) flags.push('No commits in 14d')
  return flags
}

function deriveNextMilestone(
  biz: BusinessMetrics,
  deployAgeDays: number | null,
  commitAgeDays: number | null
): string {
  if (biz.health === 'critical') return 'Stabilize deployment health'
  if (deployAgeDays !== null && deployAgeDays > 14) return 'Ship a fresh production deploy'
  if (commitAgeDays !== null && commitAgeDays > 7) return 'Advance the next code change'
  return 'Monitor growth and reliability'
}

function getPriorityScore(
  biz: BusinessMetrics,
  deployAgeDays: number | null,
  commitAgeDays: number | null
): number {
  let score = 40
  if (biz.health === 'critical') score += 40
  if (biz.health === 'warning') score += 20
  if (deployAgeDays !== null) score += Math.min(20, Math.floor(deployAgeDays))
  if (commitAgeDays !== null) score += Math.min(15, Math.floor(commitAgeDays / 2))
  return score
}

function dedupeAttention(items: DashboardSummary['attentionNeeded']): DashboardSummary['attentionNeeded'] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}
