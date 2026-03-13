'use client'

import { Brain, Loader2, Zap, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AgentStatus } from '@/lib/agent-types'

interface AgentStatusIndicatorProps {
  status: AgentStatus
  className?: string
}

const statusConfig: Record<AgentStatus, {
  icon: typeof Brain
  label: string
  color: string
  animate?: string
}> = {
  idle: {
    icon: Brain,
    label: 'Idle',
    color: 'text-emerald-500',
  },
  thinking: {
    icon: Brain,
    label: 'Thinking...',
    color: 'text-purple-500',
    animate: 'animate-pulse',
  },
  executing: {
    icon: Zap,
    label: 'Executing',
    color: 'text-yellow-500',
    animate: 'animate-pulse',
  },
  error: {
    icon: AlertTriangle,
    label: 'Error',
    color: 'text-red-500',
  },
}

export function AgentStatusIndicator({ status, className }: AgentStatusIndicatorProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all',
      status === 'idle' && 'bg-emerald-500/5 border-emerald-500/20',
      status === 'thinking' && 'bg-purple-500/5 border-purple-500/20',
      status === 'executing' && 'bg-yellow-500/5 border-yellow-500/20',
      status === 'error' && 'bg-red-500/5 border-red-500/20',
      className,
    )}>
      {status === 'executing' ? (
        <Loader2 className={cn('w-3.5 h-3.5', config.color, 'animate-spin')} />
      ) : (
        <Icon className={cn('w-3.5 h-3.5', config.color, config.animate)} />
      )}
      <span className={cn('text-xs font-medium', config.color)}>
        {config.label}
      </span>
      {(status === 'idle' || status === 'thinking') && (
        <span className={cn(
          'w-1.5 h-1.5 rounded-full',
          status === 'idle' ? 'bg-emerald-500' : 'bg-purple-500 animate-pulse'
        )} />
      )}
    </div>
  )
}
