'use client'

import {
  Cpu, Thermometer, Wifi, WifiOff,
  Activity, HardDrive, MemoryStick,
  Clock,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import type { SystemVitals, TempReading } from '@/lib/agent-types'
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
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={4}
        className="text-pi-border/30"
      />
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

/* ─── Temperature sparkline ─────────────────────── */

function TempSparkline({ history, height = 48 }: { history: TempReading[]; height?: number }) {
  if (history.length < 2) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-[9px] text-pi-text-dim">
        Collecting data...
      </div>
    )
  }

  const width = 200
  const pad = 2
  // Compute range across both CPU and GPU temps
  const allTemps = history.flatMap(r => [r.cpu, r.gpu].filter(t => t > 0))
  const minT = Math.floor(Math.min(...allTemps) - 2)
  const maxT = Math.ceil(Math.max(...allTemps) + 2)
  const range = maxT - minT || 1

  const toX = (i: number) => pad + (i / (history.length - 1)) * (width - pad * 2)
  const toY = (t: number) => pad + (1 - (t - minT) / range) * (height - pad * 2)

  // Build SVG paths for CPU and GPU
  const cpuPath = history.map((r, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(r.cpu).toFixed(1)}`).join(' ')
  const gpuPoints = history.filter(r => r.gpu > 0)
  const gpuPath = gpuPoints.length >= 2
    ? history.filter(r => r.gpu > 0).map((r, i) => {
        const idx = history.indexOf(r)
        return `${i === 0 ? 'M' : 'L'}${toX(idx).toFixed(1)},${toY(r.gpu).toFixed(1)}`
      }).join(' ')
    : null

  // Fill gradient under CPU line
  const cpuFill = cpuPath + ` L${toX(history.length - 1).toFixed(1)},${height - pad} L${toX(0).toFixed(1)},${height - pad} Z`

  // Current temps (last reading)
  const last = history[history.length - 1]
  const cpuColor = last.cpu > 70 ? '#ef4444' : last.cpu > 55 ? '#f97316' : '#22c55e'
  const gpuColor = '#8b5cf6'

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="overflow-visible">
      {/* Y-axis labels */}
      <text x={width - 1} y={pad + 4} textAnchor="end" className="fill-pi-text-dim" style={{ fontSize: 7 }}>{maxT}°</text>
      <text x={width - 1} y={height - pad} textAnchor="end" className="fill-pi-text-dim" style={{ fontSize: 7 }}>{minT}°</text>

      {/* CPU fill gradient */}
      <defs>
        <linearGradient id="cpuTempGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={cpuColor} stopOpacity={0.15} />
          <stop offset="100%" stopColor={cpuColor} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={cpuFill} fill="url(#cpuTempGrad)" />

      {/* CPU line */}
      <path d={cpuPath} fill="none" stroke={cpuColor} strokeWidth={1.5} strokeLinejoin="round" />

      {/* GPU line */}
      {gpuPath && (
        <path d={gpuPath} fill="none" stroke={gpuColor} strokeWidth={1.5} strokeLinejoin="round" strokeDasharray="3,2" />
      )}

      {/* Current value dots */}
      <circle cx={toX(history.length - 1)} cy={toY(last.cpu)} r={2.5} fill={cpuColor}>
        <animate attributeName="r" values="2.5;3.5;2.5" dur="2s" repeatCount="indefinite" />
      </circle>
      {last.gpu > 0 && (
        <circle cx={toX(history.length - 1)} cy={toY(last.gpu)} r={2} fill={gpuColor}>
          <animate attributeName="r" values="2;3;2" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  )
}

/* ─── Temp stats helper ─────────────────────────── */

function getTempStats(history: TempReading[]) {
  if (history.length === 0) return { minCpu: 0, maxCpu: 0, avgCpu: 0, minGpu: 0, maxGpu: 0, avgGpu: 0 }
  const cpuTemps = history.map(r => r.cpu).filter(t => t > 0)
  const gpuTemps = history.map(r => r.gpu).filter(t => t > 0)
  return {
    minCpu: cpuTemps.length ? Math.min(...cpuTemps) : 0,
    maxCpu: cpuTemps.length ? Math.max(...cpuTemps) : 0,
    avgCpu: cpuTemps.length ? cpuTemps.reduce((a, b) => a + b, 0) / cpuTemps.length : 0,
    minGpu: gpuTemps.length ? Math.min(...gpuTemps) : 0,
    maxGpu: gpuTemps.length ? Math.max(...gpuTemps) : 0,
    avgGpu: gpuTemps.length ? gpuTemps.reduce((a, b) => a + b, 0) / gpuTemps.length : 0,
  }
}

function tempColor(t: number): string {
  return t > 70 ? '#ef4444' : t > 55 ? '#f97316' : '#22c55e'
}

/* ─── Component ─────────────────────────────────── */

export function VitalsPanel({ vitals, devMode }: VitalsPanelProps) {
  const cpuColor = vitals.cpuPercent > 80 ? '#ef4444' : vitals.cpuPercent > 50 ? '#f59e0b' : '#22c55e'
  const stats = getTempStats(vitals.tempHistory)

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
              <p className="text-[11px] font-medium text-pi-text">
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

        {/* ── Live Temperature Section ─────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-lg border border-pi-border/50 bg-pi-surface/50 overflow-hidden"
        >
          {/* Temp header with current values */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-pi-border/30">
            <div className="flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-orange-500" />
              <span className="text-[10px] font-bold text-pi-text uppercase tracking-wider">Temperature</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tempColor(vitals.cpuTemp) }} />
                <span className="text-[10px] font-mono font-bold text-pi-text">CPU {vitals.cpuTemp.toFixed(1)}°C</span>
              </div>
              {vitals.gpuTemp > 0 && (
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                  <span className="text-[10px] font-mono font-bold text-pi-text">GPU {vitals.gpuTemp.toFixed(1)}°C</span>
                </div>
              )}
            </div>
          </div>

          {/* Sparkline chart */}
          <div className="px-2 py-1.5">
            <TempSparkline history={vitals.tempHistory} height={52} />
          </div>

          {/* Min / Avg / Max stats */}
          {vitals.tempHistory.length > 1 && (
            <div className="grid grid-cols-3 border-t border-pi-border/30">
              <div className="px-2 py-1.5 text-center border-r border-pi-border/30">
                <p className="text-[8px] text-pi-text-dim uppercase tracking-wider">Min</p>
                <p className="text-[11px] font-mono font-bold text-blue-400">{stats.minCpu.toFixed(1)}°</p>
              </div>
              <div className="px-2 py-1.5 text-center border-r border-pi-border/30">
                <p className="text-[8px] text-pi-text-dim uppercase tracking-wider">Avg</p>
                <p className="text-[11px] font-mono font-bold text-pi-text">{stats.avgCpu.toFixed(1)}°</p>
              </div>
              <div className="px-2 py-1.5 text-center">
                <p className="text-[8px] text-pi-text-dim uppercase tracking-wider">Max</p>
                <p className="text-[11px] font-mono font-bold" style={{ color: tempColor(stats.maxCpu) }}>{stats.maxCpu.toFixed(1)}°</p>
              </div>
            </div>
          )}
        </motion.div>

        {/* CPU gauge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="p-3 rounded-lg bg-pi-surface/50 border border-pi-border/50 flex items-center gap-3"
        >
          <GaugeRing value={vitals.cpuPercent} max={100} color={cpuColor} size={52} />
          <div>
            <div className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-pi-text-dim" />
              <span className="text-[10px] text-pi-text-dim font-medium">CPU</span>
            </div>
            <span className="text-lg font-bold text-pi-text font-mono leading-none">{vitals.cpuPercent}%</span>
          </div>
        </motion.div>

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
