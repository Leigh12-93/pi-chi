'use client'

import { useState } from 'react'
import { ExternalLink, GitBranch, Globe, ChevronRight, RefreshCw, Rocket, Clock, GitCommit } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelative } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { useBusinessMetrics, type BusinessMetrics } from '@/hooks/use-business-metrics'

/* ─── Static metadata (not from API) ─────────────── */

interface BusinessMeta {
  repo: string
  framework: string
  stack: string
  database: string
  hosting: string
  description: string
}

const BUSINESS_META: Record<string, BusinessMeta> = {
  cheapskips: {
    repo: 'Leigh12-93/cheapskipbinsnearme',
    framework: 'Next.js 15',
    stack: 'React 19 + TypeScript + Tailwind v4',
    database: 'Supabase',
    hosting: 'Vercel',
    description: 'AI-powered skip bin comparison/finder with chat agent, suburb-based search, per-suburb SEO pages.',
  },
  bonkr: {
    repo: 'Leigh12-93/Bonkr',
    framework: 'Next.js 14',
    stack: 'TypeScript + Tailwind + Supabase + Stripe',
    database: 'Supabase',
    hosting: 'Vercel',
    description: 'Australian adult platform — personals/classifieds + YouTube-style video platform with 19,384 embedded videos, 65 channels.',
  },
  miniskip: {
    repo: 'Leigh12-93/miniskiphireadelaide',
    framework: 'Next.js 16',
    stack: 'React 19 + TypeScript + Tailwind v4 + Square',
    database: 'Supabase',
    hosting: 'Vercel',
    description: 'Skip bin hire booking platform — 326 suburbs, driver app, admin dashboard, automated SMS, capacity system.',
  },
  aussiesms: {
    repo: 'Leigh12-93/sms-gateway-web',
    framework: 'Next.js 16',
    stack: 'React 19 + TypeScript + Tailwind + Stripe',
    database: 'Supabase',
    hosting: 'Vercel',
    description: 'Multi-tenant SaaS SMS infrastructure — API keys, credit packages, Android phone gateways, webhooks.',
  },
  pichi: {
    repo: 'Leigh12-93/pi-chi',
    framework: 'Next.js 15',
    stack: 'React 19 + TypeScript + Tailwind v4 + Claude',
    database: 'Supabase',
    hosting: 'Vercel',
    description: 'AI-powered React website builder with self-modification superpowers.',
  },
  awb: {
    repo: 'Leigh12-93/adelaide-wheelie-bins',
    framework: 'Next.js 15',
    stack: 'React 19 + TypeScript + Tailwind + Stripe',
    database: 'Supabase',
    hosting: 'Vercel',
    description: 'Waste collection management — billing automation, customer portal, PWA.',
  },
}

/* ─── Health colors ──────────────────────────────── */

const healthColors = {
  healthy: 'bg-emerald-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  unknown: 'bg-zinc-500',
}

const healthBorderColors = {
  healthy: 'border-emerald-500/30',
  warning: 'border-amber-500/30',
  critical: 'border-red-500/30',
  unknown: 'border-zinc-500/30',
}

/* ─── Props ──────────────────────────────────────── */

interface BusinessesPanelProps {
  onSelectBusiness?: (business: BusinessMetrics) => void
  activeBusiness?: string | null
}

export function BusinessesPanel({ onSelectBusiness, activeBusiness }: BusinessesPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [deploying, setDeploying] = useState<string | null>(null)
  const { businesses, loading, error, refresh } = useBusinessMetrics()

  const handleDeploy = async (bizId: string) => {
    setDeploying(bizId)
    try {
      const res = await fetch('/api/businesses/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: bizId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        console.error('Deploy failed:', data.error || res.statusText)
      }
      // Refresh metrics after triggering deploy
      setTimeout(refresh, 3000)
    } catch (err) {
      console.error('Deploy error:', err)
    } finally {
      setDeploying(null)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-pi-text uppercase tracking-wider">Managed Businesses</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="text-pi-text-dim hover:text-pi-accent transition-colors p-1 rounded hover:bg-pi-surface"
              title="Refresh metrics"
            >
              <RefreshCw className="w-3 h-3" />
            </button>
            <span className="text-[10px] text-pi-text-dim bg-pi-surface px-2 py-0.5 rounded-full">
              {loading ? '...' : `${businesses.length} tracked`}
            </span>
          </div>
        </div>

        {/* Error state */}
        {error && !loading && businesses.length === 0 && (
          <div className="text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
            Failed to load metrics: {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && businesses.length === 0 && (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-lg border border-pi-border bg-pi-surface/50 p-3 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-pi-surface" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-24 bg-pi-surface rounded" />
                    <div className="h-2 w-32 bg-pi-surface/50 rounded" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Business cards */}
        {businesses.map((biz) => {
          const isExpanded = expanded === biz.id
          const isActive = activeBusiness === biz.id
          const meta = BUSINESS_META[biz.id]
          const isDeploying = deploying === biz.id

          return (
            <motion.div
              key={biz.id}
              layout
              className={cn(
                'rounded-lg border transition-all cursor-pointer',
                isActive
                  ? 'border-pi-accent/40 bg-pi-accent/5'
                  : cn('bg-pi-surface/50 hover:border-pi-border/80 hover:bg-pi-surface/80', healthBorderColors[biz.health])
              )}
            >
              {/* Header */}
              <button
                onClick={() => setExpanded(isExpanded ? null : biz.id)}
                className="w-full flex items-center gap-3 p-3 text-left"
              >
                {/* Health dot + initial */}
                <div className="relative">
                  <div className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                    isActive ? 'bg-pi-accent/20 text-pi-accent' : 'bg-pi-surface text-pi-text-dim'
                  )}>
                    {biz.name[0]}
                  </div>
                  <span
                    className={cn(
                      'absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-pi-bg',
                      healthColors[biz.health],
                    )}
                    title={biz.health}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-pi-text truncate">{biz.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="flex items-center gap-1">
                      <Globe className="w-2.5 h-2.5 text-pi-text-dim/50" />
                      <span className="text-[10px] text-pi-text-dim truncate">{biz.domain}</span>
                    </div>
                    {biz.lastDeployAt && (
                      <div className="flex items-center gap-0.5">
                        <Clock className="w-2 h-2 text-pi-text-dim/40" />
                        <span className="text-[9px] text-pi-text-dim/60">{formatRelative(biz.lastDeployAt)}</span>
                      </div>
                    )}
                  </div>
                  {biz.lastCommitMessage && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <GitCommit className="w-2 h-2 text-pi-text-dim/40 shrink-0" />
                      <span className="text-[9px] text-pi-text-dim/50 truncate max-w-[180px]">
                        {biz.lastCommitMessage}
                      </span>
                    </div>
                  )}
                </div>
                <ChevronRight className={cn(
                  'w-3.5 h-3.5 text-pi-text-dim/50 transition-transform',
                  isExpanded && 'rotate-90'
                )} />
              </button>

              {/* Expanded details */}
              <AnimatePresence>
                {isExpanded && meta && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 space-y-2 border-t border-pi-border/50 pt-2">
                      <p className="text-[10px] text-pi-text-dim leading-relaxed">{meta.description}</p>

                      {/* Deploy & commit info */}
                      <div className="flex items-center gap-3 text-[9px] text-pi-text-dim/70">
                        {biz.lastDeployAt && (
                          <span>Deploy: {formatRelative(biz.lastDeployAt)} ({biz.deployStatus || 'unknown'})</span>
                        )}
                        {biz.lastCommitAt && (
                          <span>Commit: {formatRelative(biz.lastCommitAt)}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <InfoChip label="Stack" value={meta.framework} />
                        <InfoChip label="Repo" value={meta.repo.split('/')[1]} />
                        <InfoChip label="DB" value={meta.database} />
                        <InfoChip label="Host" value={meta.hosting} />
                      </div>

                      <div className="flex gap-2 pt-1">
                        {onSelectBusiness && (
                          <button
                            onClick={(e) => { e.stopPropagation(); onSelectBusiness(biz) }}
                            className={cn(
                              'flex-1 text-[10px] font-medium py-1.5 rounded-md transition-all',
                              isActive
                                ? 'bg-pi-accent/20 text-pi-accent border border-pi-accent/30'
                                : 'bg-pi-surface hover:bg-pi-accent/10 text-pi-text-dim hover:text-pi-accent border border-pi-border'
                            )}
                          >
                            {isActive ? 'Active' : 'Switch to'}
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeploy(biz.id) }}
                          disabled={isDeploying}
                          className={cn(
                            'flex items-center gap-1 text-[10px] text-pi-text-dim px-2 py-1.5 rounded-md bg-pi-surface border border-pi-border transition-all',
                            isDeploying
                              ? 'opacity-50 cursor-not-allowed'
                              : 'hover:text-pi-accent hover:border-pi-accent/30'
                          )}
                          title="Trigger Vercel deploy"
                        >
                          <Rocket className={cn('w-3 h-3', isDeploying && 'animate-pulse')} />
                          {isDeploying ? 'Deploying...' : 'Deploy'}
                        </button>
                        <a
                          href={`https://${biz.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-[10px] text-pi-text-dim hover:text-pi-accent px-2 py-1.5 rounded-md bg-pi-surface border border-pi-border hover:border-pi-accent/30 transition-all"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Visit
                        </a>
                        {meta.repo && (
                          <a
                            href={`https://github.com/${meta.repo}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="flex items-center gap-1 text-[10px] text-pi-text-dim hover:text-pi-accent px-2 py-1.5 rounded-md bg-pi-surface border border-pi-border hover:border-pi-accent/30 transition-all"
                          >
                            <GitBranch className="w-3 h-3" />
                            Repo
                          </a>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-pi-bg/50 rounded px-2 py-1">
      <span className="text-[9px] text-pi-text-dim truncate">
        <span className="text-pi-text-dim/50">{label}:</span> {value}
      </span>
    </div>
  )
}
