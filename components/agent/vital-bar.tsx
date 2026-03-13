'use client'

import { cn } from '@/lib/utils'

interface VitalBarProps {
  label: string
  value: number
  max: number
  unit: string
  color: string
}

export function VitalBar({ label, value, max, unit, color }: VitalBarProps) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-pi-text-dim">{label}</span>
        <span className="text-pi-text font-mono">{value}{unit} / {max}{unit}</span>
      </div>
      <div className="h-1.5 bg-pi-surface rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
