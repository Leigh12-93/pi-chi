'use client'

import {
  Cpu, Thermometer, Wifi, WifiOff,
  Activity, Brain,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SystemVitals, Goal, ActivityEntry } from '@/lib/agent-types'
import { VitalBar } from './vital-bar'

interface VitalsPanelProps {
  vitals: SystemVitals
  goals: Goal[]
  activity: ActivityEntry[]
  devMode?: boolean
}

export function VitalsPanel({ vitals, goals, activity, devMode }: VitalsPanelProps) {
  return (
    <div className="h-full flex flex-col bg-pi-panel border-l border-pi-border">
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-pi-border">
        <Cpu className="w-3.5 h-3.5 text-cyan-500" />
        <span className="text-xs font-semibold text-pi-text">System Vitals</span>
        {devMode && (
          <span className="text-[9px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded-full ml-auto">
            Dev Mode
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Connection */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-pi-surface border border-pi-border">
          <div className="flex items-center gap-2">
            {vitals.wifiConnected
              ? <Wifi className="w-4 h-4 text-emerald-500" />
              : <WifiOff className="w-4 h-4 text-red-500" />
            }
            <div>
              <p className="text-[11px] font-medium text-pi-text">
                {vitals.wifiConnected ? vitals.wifiSsid : 'Disconnected'}
              </p>
              <p className="text-[10px] text-pi-text-dim">{vitals.ipAddress}</p>
            </div>
          </div>
          <span className={cn(
            'text-[10px] px-2 py-0.5 rounded-full font-medium',
            vitals.wifiConnected
              ? 'bg-emerald-500/10 text-emerald-500'
              : 'bg-red-500/10 text-red-500'
          )}>
            {vitals.wifiConnected ? 'Online' : 'Offline'}
          </span>
        </div>

        {/* CPU + Temp */}
        <div className="grid grid-cols-2 gap-2">
          <div className="p-2.5 rounded-lg bg-pi-surface border border-pi-border text-center">
            <Cpu className="w-4 h-4 text-cyan-500 mx-auto mb-1" />
            <p className="text-lg font-bold text-pi-text font-mono">{vitals.cpuPercent}%</p>
            <p className="text-[10px] text-pi-text-dim">CPU Usage</p>
          </div>
          <div className="p-2.5 rounded-lg bg-pi-surface border border-pi-border text-center">
            <Thermometer className={cn(
              'w-4 h-4 mx-auto mb-1',
              vitals.cpuTemp > 70 ? 'text-red-500' :
              vitals.cpuTemp > 55 ? 'text-orange-500' :
              'text-emerald-500'
            )} />
            <p className="text-lg font-bold text-pi-text font-mono">{vitals.cpuTemp}°</p>
            <p className="text-[10px] text-pi-text-dim">Temperature</p>
          </div>
        </div>

        {/* RAM + Disk bars */}
        <div className="space-y-3">
          <VitalBar label="RAM" value={vitals.ramUsedMb} max={vitals.ramTotalMb} unit="MB" color="bg-purple-500" />
          <VitalBar label="Disk" value={vitals.diskUsedGb} max={vitals.diskTotalGb} unit="GB" color="bg-blue-500" />
        </div>

        {/* Uptime */}
        <div className="flex items-center justify-between p-2.5 rounded-lg bg-pi-surface border border-pi-border">
          <span className="text-[11px] text-pi-text-dim">Uptime</span>
          <span className="text-[11px] font-mono text-pi-text font-medium">{vitals.uptime}</span>
        </div>

        {/* GPIO Status */}
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Activity className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-[11px] font-semibold text-pi-text">GPIO Pins</span>
          </div>
          <div className="grid grid-cols-8 gap-1">
            {Array.from({ length: 40 }, (_, i) => i + 1).map(pin => {
              const isActive = vitals.gpioActive.includes(pin)
              return (
                <div
                  key={pin}
                  title={`GPIO ${pin}${isActive ? ' (active)' : ''}`}
                  className={cn(
                    'w-full aspect-square rounded text-[8px] font-mono flex items-center justify-center border transition-all',
                    isActive
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.3)]'
                      : 'bg-pi-surface border-pi-border/50 text-pi-text-dim/30'
                  )}
                >
                  {pin}
                </div>
              )
            })}
          </div>
        </div>

        {/* Agent Brain Summary */}
        <div className="p-2.5 rounded-lg bg-gradient-to-br from-pi-accent/5 to-purple-500/5 border border-pi-accent/20">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-pi-accent" />
            <span className="text-[11px] font-semibold text-pi-text">Agent Brain</span>
          </div>
          <div className="space-y-1.5 text-[10px]">
            <div className="flex justify-between">
              <span className="text-pi-text-dim">Mode</span>
              <span className="text-emerald-500 font-medium">Autonomous</span>
            </div>
            <div className="flex justify-between">
              <span className="text-pi-text-dim">Active goals</span>
              <span className="text-pi-text font-mono">{goals.filter(g => g.status === 'active').length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-pi-text-dim">Decisions today</span>
              <span className="text-pi-text font-mono">{activity.filter(a => a.type === 'decision').length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-pi-text-dim">GPIO interactions</span>
              <span className="text-pi-text font-mono">{activity.filter(a => a.type === 'gpio').length}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
