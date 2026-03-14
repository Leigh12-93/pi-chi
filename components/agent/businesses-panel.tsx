'use client'

import { useState } from 'react'
import { ExternalLink, GitBranch, Globe, Server, ChevronRight, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'

export interface ManagedBusiness {
  id: string
  name: string
  repo: string
  domain: string
  framework: string
  stack: string
  database: string
  hosting: string
  description: string
  status: 'active' | 'development' | 'planned'
  trainingDoc?: string
}

const BUSINESSES: ManagedBusiness[] = [
  {
    id: 'cheapskips',
    name: 'CheapSkipBinsNearMe',
    repo: 'Leigh12-93/cheapskipbinsnearme',
    domain: 'cheapskipbinsnearme.com.au',
    framework: 'Next.js 15',
    stack: 'React 19 + TypeScript + Tailwind v4',
    database: 'Supabase',
    hosting: 'Vercel',
    description: 'AI-powered skip bin comparison/finder with chat agent, suburb-based search, per-suburb SEO pages.',
    status: 'development',
    trainingDoc: '/mnt/usb/cheapskipbinsnearme/',
  },
  {
    id: 'bonkr',
    name: 'Bonkr',
    repo: 'Leigh12-93/Bonkr',
    domain: 'bonkr.com.au',
    framework: 'Next.js 14',
    stack: 'TypeScript + Tailwind + Supabase + Stripe',
    database: 'Supabase (unsqcfflbedqclgkuknq)',
    hosting: 'Vercel',
    description: 'Australian adult platform — personals/classifieds + YouTube-style video platform with 19,384 embedded videos, 65 channels. ExoClick + Stripe monetization.',
    status: 'active',
    trainingDoc: '/mnt/usb/bonkr/bonkr-pi-training.md',
  },
  {
    id: 'miniskip',
    name: 'MiniSkip Hire Adelaide',
    repo: 'Leigh12-93/miniskiphireadelaide',
    domain: 'miniskiphireadelaide.com.au',
    framework: 'Next.js 16',
    stack: 'React 19 + TypeScript + Tailwind v4 + Square',
    database: 'Supabase (cxljsqwkpdagfvpcohsb)',
    hosting: 'Vercel',
    description: 'Skip bin hire booking platform — 326 suburbs, driver app, admin dashboard, automated SMS (extension upsell, collection reminders), capacity system.',
    status: 'active',
    trainingDoc: '/mnt/usb/miniskip/miniskip-pi-training.md',
  },
  {
    id: 'aussiesms',
    name: 'AussieSMS Gateway',
    repo: 'Leigh12-93/sms-gateway-web',
    domain: 'aussiesms.vercel.app',
    framework: 'Next.js 16',
    stack: 'React 19 + TypeScript + Tailwind + Stripe',
    database: 'Supabase (koghrdiduiuicaysvwci)',
    hosting: 'Vercel',
    description: 'Multi-tenant SaaS SMS infrastructure — API keys, credit packages, Android phone gateways, webhooks, scheduling, bulk send.',
    status: 'active',
    trainingDoc: '/mnt/usb/aussiesms/aussiesms-pi-training.md',
  },
]

const statusColors = {
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  development: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  planned: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
}

interface BusinessesPanelProps {
  onSelectBusiness?: (business: ManagedBusiness) => void
  activeBusiness?: string | null
}

export function BusinessesPanel({ onSelectBusiness, activeBusiness }: BusinessesPanelProps) {
  const [expanded, setExpanded] = useState<string | null>(null)

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-pi-text uppercase tracking-wider">Managed Businesses</h3>
          <span className="text-[10px] text-pi-text-dim bg-pi-surface px-2 py-0.5 rounded-full">
            {BUSINESSES.length} active
          </span>
        </div>

        {BUSINESSES.map((biz) => {
          const isExpanded = expanded === biz.id
          const isActive = activeBusiness === biz.id

          return (
            <motion.div
              key={biz.id}
              layout
              className={cn(
                'rounded-lg border transition-all cursor-pointer',
                isActive
                  ? 'border-pi-accent/40 bg-pi-accent/5'
                  : 'border-pi-border bg-pi-surface/50 hover:border-pi-border/80 hover:bg-pi-surface/80'
              )}
            >
              {/* Header */}
              <button
                onClick={() => setExpanded(isExpanded ? null : biz.id)}
                className="w-full flex items-center gap-3 p-3 text-left"
              >
                <div className={cn(
                  'w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                  isActive ? 'bg-pi-accent/20 text-pi-accent' : 'bg-pi-surface text-pi-text-dim'
                )}>
                  {biz.name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-pi-text truncate">{biz.name}</span>
                    <span className={cn('text-[9px] px-1.5 py-px rounded-full border font-medium', statusColors[biz.status])}>
                      {biz.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Globe className="w-2.5 h-2.5 text-pi-text-dim/50" />
                    <span className="text-[10px] text-pi-text-dim truncate">{biz.domain}</span>
                  </div>
                </div>
                <ChevronRight className={cn(
                  'w-3.5 h-3.5 text-pi-text-dim/50 transition-transform',
                  isExpanded && 'rotate-90'
                )} />
              </button>

              {/* Expanded details */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-3 space-y-2 border-t border-pi-border/50 pt-2">
                      <p className="text-[10px] text-pi-text-dim leading-relaxed">{biz.description}</p>

                      <div className="grid grid-cols-2 gap-1.5">
                        <InfoChip icon={Server} label="Stack" value={biz.framework} />
                        <InfoChip icon={GitBranch} label="Repo" value={biz.repo.split('/')[1]} />
                        <InfoChip icon={Activity} label="DB" value={biz.database.split(' ')[0]} />
                        <InfoChip icon={Globe} label="Host" value={biz.hosting} />
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
                        <a
                          href={`https://github.com/${biz.repo}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1 text-[10px] text-pi-text-dim hover:text-pi-accent px-2 py-1.5 rounded-md bg-pi-surface border border-pi-border hover:border-pi-accent/30 transition-all"
                        >
                          <GitBranch className="w-3 h-3" />
                          Repo
                        </a>
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

function InfoChip({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-pi-bg/50 rounded px-2 py-1">
      <Icon className="w-2.5 h-2.5 text-pi-text-dim/50 shrink-0" />
      <span className="text-[9px] text-pi-text-dim truncate">
        <span className="text-pi-text-dim/50">{label}:</span> {value}
      </span>
    </div>
  )
}
