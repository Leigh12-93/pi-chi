'use client'

import { useState, useRef, useEffect, useCallback, useMemo, Suspense, lazy } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  Activity, Terminal as TerminalIcon,
  Target, Cpu, Code2, Bot, BookOpen,
  BarChart3,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

import { ChatPanel } from '@/components/chat-panel'
import { GoalsPanel } from '@/components/agent/goals-panel'
import { ActivityFeed } from '@/components/agent/activity-feed'
import { VitalsPanel } from '@/components/agent/vitals-panel'
import { BrainHeader } from '@/components/agent/brain-header'
import { BrainStats } from '@/components/agent/brain-stats'
import { MoodPanel } from '@/components/agent/mood-panel'
import { LiveLogPanel } from '@/components/agent/live-log-panel'
import { AgentStatusIndicator } from '@/components/agent/agent-status'
import { CollapsibleSection } from '@/components/agent/collapsible-section'
import { BusinessesPanel } from '@/components/agent/businesses-panel'
import { PanelErrorBoundary } from '@/components/error-boundary'
import { useSystemVitals } from '@/hooks/use-system-vitals'
import { useAgentState } from '@/hooks/use-agent-state'
import { usePiTerminal } from '@/hooks/use-pi-terminal'
import { useBusinessMetrics } from '@/hooks/use-business-metrics'

// Lazy load Mind tab panels for Pi 4B performance
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

type MobileTab = 'chat' | 'goals' | 'activity' | 'vitals' | 'terminal'
type CenterTab = 'chat' | 'businesses' | 'activity' | 'mind' | 'terminal'
type MindSubTab = 'memories' | 'research' | 'growth' | 'projects' | 'skills' | 'achievements' | 'prompts'

/* ─── Mobile tab config ─────────────────────────── */

const mobileTabs: { id: MobileTab; icon: React.ElementType; label: string }[] = [
  { id: 'chat', icon: Bot, label: 'Chat' },
  { id: 'goals', icon: Target, label: 'Goals' },
  { id: 'activity', icon: Activity, label: 'Activity' },
  { id: 'vitals', icon: Cpu, label: 'Status' },
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

/* ─── Component ─────────────────────────────────── */

export function AgentDashboard({
  projectName, projectId, files, activeFile,
  onFileSelect, onFileChange, onFileDelete, onBulkFileUpdate,
  githubToken, pendingMessage, onPendingMessageSent,
}: AgentDashboardProps) {
  const [centerTab, setCenterTab] = useState<CenterTab>('chat')
  const [mobileTab, setMobileTab] = useState<MobileTab>('chat')
  const [mindSubTab, setMindSubTab] = useState<MindSubTab>('memories')
  const [settingsOpen, setSettingsOpen] = useState(false)
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

  // Connect chat loading state to agent status
  const handleLoadingChange = useCallback((isLoading: boolean) => {
    agent.setAgentStatus(isLoading ? 'thinking' : 'idle')
  }, [agent])

  // ── Toast notifications ─────────────────────────
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

  // ── Keyboard shortcuts ──────────────────────────
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
      {/* ─── Brain Header ─── */}
      <BrainHeader
        brainStatus={agent.brainStatus}
        brainMeta={agent.brainMeta}
        vitals={vitals}
        lastFetchedAt={agent.lastFetchedAt}
        onRefresh={agent.refresh}
        onSettingsOpen={() => setSettingsOpen(true)}
      />

      {/* ─── Settings Panel (slide-over) ─── */}
      <Suspense fallback={null}>
        <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} brainMeta={agent.brainMeta} />
      </Suspense>

      {/* ─── Conditionally render ONLY the active layout ─── */}
      {isDesktop ? (
        /* ─── DESKTOP LAYOUT (md+) ─── */
        <div className="flex flex-1 overflow-hidden">
          <PanelGroup direction="horizontal" autoSaveId="pi-agent-dashboard-v3" className="flex-1">
            {/* ─── Left: Goals ─── */}
            <Panel defaultSize={22} minSize={15} maxSize={35}>
              <GoalsPanel
                goals={agent.goals}
                onInjectGoal={agent.injectGoal}
              />
            </Panel>

            <PanelResizeHandle className="w-[3px] bg-transparent hover:bg-pi-accent/20 active:bg-pi-accent/40 transition-colors relative cursor-col-resize" />

            {/* ─── Center: Chat / Mind / Activity / Terminal ─── */}
            <Panel defaultSize={48} minSize={30}>
              <div className="h-full flex flex-col bg-pi-bg">
                {/* Tab bar */}
                <div className="flex items-center border-b border-pi-border bg-pi-panel/80 backdrop-blur-sm" role="tablist">
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
                      {/* Unread badge */}
                      {tab.badge !== undefined && tab.badge > 0 && (
                        <motion.span
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="ml-1 bg-pi-accent text-white text-[8px] font-bold px-1.5 py-px rounded-full min-w-[16px] text-center"
                        >
                          {tab.badge}
                        </motion.span>
                      )}
                      {/* Active indicator */}
                      {centerTab === tab.id && (
                        <motion.span
                          layoutId="agent-center-tab-v3"
                          className="absolute bottom-0 left-1 right-1 h-0.5 bg-pi-accent rounded-full"
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                    </button>
                  ))}

                  {/* Status indicator on the right */}
                  <div className="ml-auto pr-3">
                    <AgentStatusIndicator status={agent.agentStatus} />
                  </div>
                </div>

                {/* Tab content */}
                <div className="flex-1 overflow-hidden relative">
                  {/* Unified Chat — Pi-Chi personality + all builder tools */}
                  <div className={cn('absolute inset-0', centerTab !== 'chat' && 'hidden')}>
                    <PanelErrorBoundary name="Chat">
                      <ChatPanel
                        projectName={projectName}
                        projectId={projectId}
                        files={files}
                        onFileChange={onFileChange}
                        onFileDelete={onFileDelete}
                        onBulkFileUpdate={onBulkFileUpdate}
                        githubToken={githubToken}
                        pendingMessage={pendingMessage}
                        onPendingMessageSent={onPendingMessageSent}
                        activeFile={activeFile}
                        onLoadingChange={handleLoadingChange}
                        onFileSelect={onFileSelect}
                        brainName={agent.brainMeta?.name || 'Pi-Chi'}
                        brainStatus={agent.brainStatus}
                      />
                    </PanelErrorBoundary>
                  </div>

                  {/* Mind — sub-tabbed panel */}
                  <div className={cn('absolute inset-0 flex flex-col', centerTab !== 'mind' && 'hidden')}>
                    {/* Sub-tab bar */}
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

                    {/* Sub-tab content */}
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

            {/* ─── Right: Collapsible Vitals + Stats + Mood + Log ─── */}
            <Panel defaultSize={30} minSize={20} maxSize={40}>
              <div className="h-full overflow-y-auto bg-pi-panel border-l border-pi-border">
                <CollapsibleSection title="System Vitals" icon={Cpu} defaultOpen={true}>
                  <VitalsPanel vitals={vitals} devMode={devMode} />
                </CollapsibleSection>

                <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

                <CollapsibleSection title="Brain Stats" icon={Activity} defaultOpen={true}>
                  <BrainStats
                    brainMeta={agent.brainMeta}
                    brainStatus={agent.brainStatus}
                    goals={agent.goals}
                  />
                </CollapsibleSection>

                <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

                <CollapsibleSection title="Mood" icon={Target} defaultOpen={true}>
                  <MoodPanel mood={agent.mood || undefined} moodHistory={agent.moodHistory} />
                </CollapsibleSection>

                <div className="mx-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

                <CollapsibleSection title="Live Log" icon={TerminalIcon} defaultOpen={false}>
                  <LiveLogPanel />
                </CollapsibleSection>
              </div>
            </Panel>
          </PanelGroup>
        </div>
      ) : (
        /* ─── MOBILE LAYOUT (< md) ─── */
        <div className="flex flex-1 flex-col overflow-hidden">
          {/* Mobile content area */}
          <div className="flex-1 overflow-hidden relative bg-pi-bg">
            <AnimatePresence mode="wait">
              {/* Chat (Unified — Pi-Chi + builder tools) */}
              {mobileTab === 'chat' && (
                <motion.div
                  key="mobile-chat"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="absolute inset-0 flex flex-col"
                >
                  <ChatPanel
                    projectName={projectName}
                    projectId={projectId}
                    files={files}
                    onFileChange={onFileChange}
                    onFileDelete={onFileDelete}
                    onBulkFileUpdate={onBulkFileUpdate}
                    githubToken={githubToken}
                    pendingMessage={pendingMessage}
                    onPendingMessageSent={onPendingMessageSent}
                    activeFile={activeFile}
                    onLoadingChange={handleLoadingChange}
                    onFileSelect={onFileSelect}
                    brainName={agent.brainMeta?.name || 'Pi-Chi'}
                    brainStatus={agent.brainStatus}
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

              {/* Status — all sections, collapsible */}
              {mobileTab === 'vitals' && (
                <motion.div
                  key="mobile-vitals"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  className="absolute inset-0 overflow-y-auto pb-safe-bottom"
                >
                  <CollapsibleSection title="System Vitals" icon={Cpu} defaultOpen={true}>
                    <VitalsPanel vitals={vitals} devMode={devMode} />
                  </CollapsibleSection>

                  <div className="mx-4 my-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

                  <CollapsibleSection title="Brain Stats" icon={Activity} defaultOpen={true}>
                    <div className="px-1">
                      <BrainStats brainMeta={agent.brainMeta} brainStatus={agent.brainStatus} goals={agent.goals} />
                    </div>
                  </CollapsibleSection>

                  <div className="mx-4 my-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

                  <CollapsibleSection title="Mood" icon={Target} defaultOpen={true}>
                    <div className="px-1">
                      <MoodPanel mood={agent.mood || undefined} moodHistory={agent.moodHistory} />
                    </div>
                  </CollapsibleSection>

                  <div className="mx-4 my-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

                  <CollapsibleSection title="Memories" icon={BookOpen} defaultOpen={false} badge={agent.memories.length || undefined}>
                    <Suspense fallback={<PanelSkeleton />}>
                      <MemoriesPanel memories={agent.memories} />
                    </Suspense>
                  </CollapsibleSection>

                  <div className="mx-4 my-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

                  <CollapsibleSection title="Research" icon={BookOpen} defaultOpen={false} badge={agent.threads.length || undefined}>
                    <Suspense fallback={<PanelSkeleton />}>
                      <ResearchThreadsPanel threads={agent.threads} />
                    </Suspense>
                  </CollapsibleSection>

                  <div className="mx-4 my-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

                  <CollapsibleSection title="Growth" icon={Activity} defaultOpen={false} badge={agent.growthLog.length || undefined}>
                    <Suspense fallback={<PanelSkeleton />}>
                      <GrowthLogPanel growthLog={agent.growthLog} />
                    </Suspense>
                  </CollapsibleSection>

                  <div className="mx-4 my-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

                  <CollapsibleSection title="Projects" icon={Code2} defaultOpen={false} badge={agent.projects.length || undefined}>
                    <Suspense fallback={<PanelSkeleton />}>
                      <ProjectsPanel projects={agent.projects} />
                    </Suspense>
                  </CollapsibleSection>

                  <div className="mx-4 my-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

                  <CollapsibleSection title="Skills" icon={Cpu} defaultOpen={false} badge={agent.capabilities.length || undefined}>
                    <Suspense fallback={<PanelSkeleton />}>
                      <CapabilitiesPanel capabilities={agent.capabilities} />
                    </Suspense>
                  </CollapsibleSection>

                  <div className="mx-4 my-3 h-px bg-gradient-to-r from-transparent via-pi-border to-transparent" />

                  <CollapsibleSection title="Live Log" icon={TerminalIcon} defaultOpen={false}>
                    <LiveLogPanel />
                  </CollapsibleSection>

                  <div className="h-6" />
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
                      // Haptic feedback
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
