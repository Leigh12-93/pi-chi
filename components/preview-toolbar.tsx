'use client'

import { useState, useMemo } from 'react'
import { Smartphone, Tablet, Monitor, Maximize2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type DevicePreset = 'mobile' | 'tablet' | 'desktop' | 'full'

interface DeviceConfig {
  preset: DevicePreset
  label: string
  Icon: typeof Smartphone
  width: number | null   // null = 100%
  height: number | null  // null = 100%
}

const DEVICE_PRESETS: DeviceConfig[] = [
  { preset: 'mobile',  label: 'Mobile',     Icon: Smartphone, width: 375,  height: 667  },
  { preset: 'tablet',  label: 'Tablet',     Icon: Tablet,     width: 768,  height: 1024 },
  { preset: 'desktop', label: 'Desktop',    Icon: Monitor,    width: 1280, height: 800  },
  { preset: 'full',    label: 'Full width',  Icon: Maximize2,  width: null, height: null },
]

export interface PreviewSize {
  width: string
  height: string
  preset: DevicePreset
  setPreset: (preset: DevicePreset) => void
}

export function usePreviewSize(initialPreset: DevicePreset = 'full'): PreviewSize {
  const [preset, setPreset] = useState<DevicePreset>(initialPreset)

  const config = useMemo(
    () => DEVICE_PRESETS.find(d => d.preset === preset) ?? DEVICE_PRESETS[3],
    [preset],
  )

  const width = config.width ? `${config.width}px` : '100%'
  const height = config.height ? `${config.height}px` : '100%'

  return { width, height, preset, setPreset }
}

interface PreviewToolbarProps {
  preset: DevicePreset
  onPresetChange: (preset: DevicePreset) => void
}

export function PreviewToolbar({ preset, onPresetChange }: PreviewToolbarProps) {
  const activeConfig = useMemo(
    () => DEVICE_PRESETS.find(d => d.preset === preset) ?? DEVICE_PRESETS[3],
    [preset],
  )

  const dimensionLabel = activeConfig.width && activeConfig.height
    ? `${activeConfig.width} \u00d7 ${activeConfig.height}`
    : 'Full'

  return (
    <div className="flex items-center gap-1 shrink-0">
      {DEVICE_PRESETS.map(({ preset: p, label, Icon }) => (
        <button
          key={p}
          onClick={() => onPresetChange(p)}
          title={label}
          aria-label={`${label} viewport`}
          aria-pressed={preset === p}
          className={cn(
            'relative p-2.5 sm:p-1.5 rounded-md transition-colors',
            preset === p
              ? 'bg-pi-accent/15 text-pi-accent'
              : 'text-pi-text-dim hover:text-pi-text hover:bg-pi-surface',
          )}
        >
          <Icon className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          {preset === p && (
            <motion.div
              layoutId="device-indicator"
              className="absolute bottom-0 left-1 right-1 h-0.5 bg-pi-accent rounded-full"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
        </button>
      ))}
      <span className="ml-1 text-[10px] text-pi-text-dim font-mono tabular-nums select-none hidden sm:inline">
        {dimensionLabel}
      </span>
    </div>
  )
}
