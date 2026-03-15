'use client'

import {
  Cpu, Thermometer, Wifi, WifiOff,
  Activity, HardDrive, MemoryStick,
  Clock,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { SystemVitals } from '@/lib/agent-types'
import { VitalBar } from './vital-bar'

/* ─── Props ─────────────────────────────────────── */

interface VitalsPanelProps {
  vitals: SystemVitals
  devMode?: boolean
}

/* ─── GPIO pin labels (BCM function names) ─────── */

const gpioLabels: Record<number, string> = {
  1: '3V3', 2: '5V', 3: 'SDA1', 4: '5V', 5: 'SCL1', 6: 'GND',
  7: 'GPIO4', 8: 'TXD', 9: 'GND', 10: 'RXD', 11: 'GPIO17', 12: 'PWM0',
  13: 'GPIO27', 14: 'GND', 15: 'GPIO22', 16: 'GPIO23', 17: '3V3', 18: 'GPIO24',
  19: 'SPI0_MOSI', 20: 'GND', 21: 'SPI0_MISO', 22: 'GPIO25', 23: 'SPI0_SCLK', 24: 'SPI0_CE0',
  25: 'GND', 26: 'SPI0_CE1', 27: 'ID_SD', 28: 'ID_SC', 29: 'GPIO5', 30: 'GND',
  31: 'GPIO6', 32: 'PWM0', 33: 'PWM1', 34: 'GND', 35: 'SPI1_MISO', 36: 'GPIO16',
  37: 'GPIO26', 38: 'SPI1_MOSI', 39: 'GND', 40: 'SPI1_SCLK',
}

/* ─── Gauge ring ────────────────────────────────── */

function GaugeRing({ value, max, color, size = 64 }: { value: number; max: number; color: string; size?: number }) {
  const pct = Math.min((value / max) * 100, 100)
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (pct / 100) * circumference

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background ring */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        className="text-pi-border/30"
      />
      {/* Value ring */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
    </svg>
  )
}

/* ─── Component ─────────────────────────────────── */

export function VitalsPanel({ vitals, devMode }: VitalsPanelProps) {
  const cpuColor = vitals.cpuPercent > 80 ? '#ef4444' : vitals.cpuPercent > 50 ? '#f59e0b' : '#22c55e'
  const tempColor = vitals.cpuTemp > 70 ? '#ef4444' : vitals.cpuTemp > 55 ? '#f97316' : '#22c55e'

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-pi-border">
        <Cpu className="w-3.5 h-3.5 text-pi-accent" />
        <span className="text-xs font-bold text-pi-text">System Vitals</span>
        {devMode && (
          <span className="text-[9px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded-full ml-auto font-medium border border-yellow-500/20">
            Dev Mode
          </span>
        )}
      </div>

      <div className="p-3 space-y-3">
        {/* Connection */}
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            'flex items-center justify-between p-2.5 rounded-lg border transition-all',
            vitals.wifiConnected
              ? 'bg-emerald-500/5 border-emerald-500/20'
              : 'bg-red-500/5 border-red-500/20'
          )}
        >
          <div className="flex items-center gap-2">
            {vitals.wifiConnected
              ? <Wifi className="w-4 h-4 text-emerald-500" />
              : <WifiOff className="w-4 h-4 text-red-500" />
            }
            <div>
              <p className="text-[11px] font-medium text-pi-text truncate max-w-[150px]">
                {vitals.wifiConnected ? vitals.wifiSsid : 'Disconnected'}
              </p>
              <p className="text-[10px] text-pi-text-dim font-mono">{vitals.ipAddress}</p>
            </div>
          </div>
          <span className={cn(
            'text-[9px] px-2 py-0.5 rounded-full font-semibold border',
            vitals.wifiConnected
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
              : 'bg-red-500/10 text-red-500 border-red-500/20'
          )}>
            {vitals.wifiConnected ? 'Online' : 'Offline'}
          </span>
        </motion.div>

        {/* CPU + Temp gauges */}
        <div className="grid grid-cols-2 gap-2">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="p-3 rounded-lg bg-pi-surface/50 border border-pi-border/50 flex flex-col items-center"
          >
            <div className="relative">
              <GaugeRing value={vitals.cpuPercent} max={100} color={cpuColor} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-base font-bold text-pi-text font-mono leading-none">{vitals.cpuPercent}%</span>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <Cpu className="w-3 h-3 text-pi-text-dim" />
              <span className="text-[10px] text-pi-text-dim font-medium">CPU</span>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15 }}
            className="p-3 rounded-lg bg-pi-surface/50 border border-pi-border/50 flex flex-col items-center"
          >
            <div className="relative">
              <GaugeRing value={vitals.cpuTemp} max={85} color={tempColor} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-base font-bold text-pi-text font-mono leading-none">{vitals.cpuTemp}°</span>
              </div>
            </div>
            <div className="flex items-center gap-1 mt-1.5">
              <Thermometer className="w-3 h-3 text-pi-text-dim" />
              <span className="text-[10px] text-pi-text-dim font-medium">Temp</span>
            </div>
          </motion.div>
        </div>

        {/* RAM + Disk bars */}
        <div className="space-y-2.5">
          <VitalBar label="RAM" value={vitals.ramUsedMb} max={vitals.ramTotalMb} unit="MB" color="bg-purple-500" icon={MemoryStick} />
          <VitalBar label="Disk" value={vitals.diskUsedGb} max={vitals.diskTotalGb} unit="GB" color="bg-blue-500" icon={HardDrive} />
        </div>

        {/* Uptime */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="flex items-center justify-between p-2 rounded-lg bg-pi-surface/30 border border-pi-border/30"
        >
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3 text-pi-text-dim" />
            <span className="text-[10px] text-pi-text-dim">Uptime</span>
          </div>
          <span className="text-[10px] font-mono text-pi-text font-semibold">{vitals.uptime}</span>
        </motion.div>

        {/* GPIO Status */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Activity className="w-3 h-3 text-orange-500" />
            <span className="text-[10px] font-bold text-pi-text uppercase tracking-wider">GPIO Pins</span>
          </div>
          <div className="grid grid-cols-10 gap-0.5">
            {Array.from({ length: 40 }, (_, i) => i + 1).map(pin => {
              const isActive = vitals.gpioActive.includes(pin)
              const label = gpioLabels[pin] || `Pin ${pin}`
              return (
                <motion.div
                  key={pin}
                  initial={false}
                  animate={isActive ? {
                    boxShadow: ['0 0 0 0 rgba(16,185,129,0)', '0 0 6px 2px rgba(16,185,129,0.3)', '0 0 0 0 rgba(16,185,129,0)'],
                  } : {}}
                  transition={{ duration: 2, repeat: Infinity }}
                  title={`${label} (Pin ${pin})${isActive ? ' — Active' : ''}`}
                  className={cn(
                    'aspect-square rounded text-[7px] font-mono flex items-center justify-center border transition-all',
                    isActive
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500 font-bold'
                      : 'bg-pi-surface/30 border-pi-border/30 text-pi-text-dim/20'
                  )}
                >
                  {pin}
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
