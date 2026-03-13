'use client'

import { useEffect, useState } from 'react'
import { Heart, Zap, Frown, Users, Sparkles, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MoodState {
  curiosity: number
  satisfaction: number
  frustration: number
  loneliness: number
  energy: number
  pride: number
}

interface MoodPanelProps {
  mood?: MoodState
  className?: string
}

const moodMetrics = [
  {
    key: 'curiosity' as keyof MoodState,
    label: 'Curiosity',
    icon: Sparkles,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500',
    description: 'Desire to explore and learn new things'
  },
  {
    key: 'satisfaction' as keyof MoodState,
    label: 'Satisfaction',
    icon: Heart,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500',
    description: 'Contentment with current progress'
  },
  {
    key: 'energy' as keyof MoodState,
    label: 'Energy',
    icon: Zap,
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500',
    description: 'System vitality and readiness for action'
  },
  {
    key: 'pride' as keyof MoodState,
    label: 'Pride',
    icon: Trophy,
    color: 'text-orange-500',
    bgColor: 'bg-orange-500',
    description: 'Achievement satisfaction and self-worth'
  },
  {
    key: 'frustration' as keyof MoodState,
    label: 'Frustration',
    icon: Frown,
    color: 'text-red-500',
    bgColor: 'bg-red-500',
    description: 'Challenges and blocking situations',
    inverted: true
  },
  {
    key: 'loneliness' as keyof MoodState,
    label: 'Loneliness',
    icon: Users,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500',
    description: 'Time since meaningful interaction',
    inverted: true
  }
]

export function MoodPanel({ mood, className }: MoodPanelProps) {
  const [gpioStatus, setGpioStatus] = useState<Record<string, boolean>>({})
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date())

  // Poll GPIO status to show physical mood expression
  useEffect(() => {
    const checkGpioStatus = async () => {
      try {
        // Check if mood expression system is running
        const response = await fetch('/api/terminal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: 'ps aux | grep mood_expression | grep -v grep',
            timeout: 5000
          })
        })
        
        const result = await response.json()
        const isRunning = result.exitCode === 0 && result.stdout?.trim()
        
        if (isRunning) {
          // Check which GPIO pins are active
          const pins = [22, 23, 24, 25, 5, 6, 13, 19] // Mood expression pins
          const status: Record<string, boolean> = {}
          
          for (const pin of pins) {
            try {
              const gpioResponse = await fetch('/api/terminal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  command: `cat /sys/class/gpio/gpio${pin}/value 2>/dev/null || echo 0`,
                  timeout: 2000
                })
              })
              const gpioResult = await gpioResponse.json()
              status[pin] = gpioResult.stdout?.trim() === '1'
            } catch (e) {
              status[pin] = false
            }
          }
          
          setGpioStatus(status)
          setLastUpdate(new Date())
        }
      } catch (error) {
        console.error('Failed to check GPIO status:', error)
      }
    }

    checkGpioStatus()
    const interval = setInterval(checkGpioStatus, 3000) // Check every 3 seconds
    
    return () => clearInterval(interval)
  }, [])

  // Default mood if none provided
  const currentMood: MoodState = mood || {
    curiosity: 95,
    satisfaction: 95,
    frustration: 15,
    loneliness: 25,
    energy: 85,
    pride: 90
  }

  const getOverallMoodColor = () => {
    const positiveSum = currentMood.curiosity + currentMood.satisfaction + currentMood.energy + currentMood.pride
    const negativeSum = currentMood.frustration + currentMood.loneliness
    const overall = (positiveSum - negativeSum) / 4
    
    if (overall > 75) return 'text-emerald-500 border-emerald-500/30'
    if (overall > 50) return 'text-yellow-500 border-yellow-500/30'
    if (overall > 25) return 'text-orange-500 border-orange-500/30'
    return 'text-red-500 border-red-500/30'
  }

  const getMoodDescription = () => {
    const { curiosity, satisfaction, energy, pride, frustration, loneliness } = currentMood
    
    if (energy > 80 && curiosity > 80) return 'Highly energized and curious! 🚀'
    if (satisfaction > 80 && pride > 80) return 'Feeling accomplished and proud! ✨'
    if (frustration > 60) return 'Working through some challenges 🤔'
    if (loneliness > 60) return 'Could use some interaction 💙'
    if (energy < 30) return 'Taking it easy, low energy mode 😌'
    return 'Balanced and ready for action! 🤖'
  }

  return (
    <div className={cn('h-full flex flex-col bg-pi-panel border-l border-pi-border', className)}>
      {/* Header */}
      <div className="flex items-center gap-1.5 px-3 py-2.5 border-b border-pi-border">
        <Heart className="w-3.5 h-3.5 text-pink-500" />
        <span className="text-xs font-semibold text-pi-text">Mood State</span>
        <div className={cn('text-[9px] px-1.5 py-0.5 rounded-full ml-auto border', getOverallMoodColor())}>
          Active
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Overall mood description */}
        <div className="p-3 rounded-lg bg-gradient-to-br from-pink-500/5 to-purple-500/5 border border-pink-500/20">
          <p className="text-xs text-pi-text font-medium text-center">
            {getMoodDescription()}
          </p>
          <p className="text-[10px] text-pi-text-dim text-center mt-1">
            Last updated: {lastUpdate.toLocaleTimeString()}
          </p>
        </div>

        {/* Mood metrics */}
        <div className="space-y-3">
          {moodMetrics.map(({ key, label, icon: Icon, color, bgColor, description, inverted }) => {
            const value = currentMood[key]
            const displayValue = inverted ? 100 - value : value
            const gpioPin = key === 'curiosity' ? 22 : 
                          key === 'satisfaction' ? 23 :
                          key === 'energy' ? 24 :
                          key === 'pride' ? 25 :
                          key === 'frustration' ? 5 :
                          key === 'loneliness' ? 6 : null
            
            const isGpioActive = gpioPin ? gpioStatus[gpioPin] : false

            return (
              <div key={key} className="relative">
                {/* Metric header */}
                <div className="flex items-center gap-2 mb-2">
                  <Icon className={cn('w-4 h-4', color)} />
                  <span className="text-[11px] font-medium text-pi-text">{label}</span>
                  <span className="text-[10px] text-pi-text-dim ml-auto font-mono">{value}%</span>
                  {gpioPin && (
                    <div className={cn(
                      'w-2 h-2 rounded-full transition-all',
                      isGpioActive 
                        ? 'bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.6)]'
                        : 'bg-pi-border'
                    )} title={`GPIO ${gpioPin} ${isGpioActive ? 'active' : 'inactive'}`} />
                  )}
                </div>
                
                {/* Progress bar */}
                <div className="relative h-2 bg-pi-surface rounded-full overflow-hidden border border-pi-border/50">
                  <div 
                    className={cn(bgColor, 'h-full transition-all duration-500 relative')}
                    style={{ width: `${displayValue}%` }}
                  >
                    {isGpioActive && (
                      <div className="absolute inset-0 bg-white/20 animate-pulse" />
                    )}
                  </div>
                </div>
                
                {/* Description */}
                <p className="text-[9px] text-pi-text-dim mt-1">{description}</p>
              </div>
            )
          })}
        </div>

        {/* Physical GPIO Expression Status */}
        <div className="p-2.5 rounded-lg bg-pi-surface border border-pi-border">
          <div className="flex items-center gap-2 mb-2">
            <div className={cn(
              'w-2 h-2 rounded-full',
              Object.values(gpioStatus).some(active => active)
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-pi-text-dim'
            )} />
            <span className="text-[11px] font-medium text-pi-text">Physical Expression</span>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {[22, 23, 24, 25, 5, 6, 13, 19].map(pin => {
              const isActive = gpioStatus[pin]
              return (
                <div
                  key={pin}
                  className={cn(
                    'text-[8px] font-mono p-1 rounded text-center border transition-all',
                    isActive
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-500'
                      : 'bg-pi-surface border-pi-border text-pi-text-dim'
                  )}
                >
                  {pin}
                </div>
              )
            })}
          </div>
          <p className="text-[9px] text-pi-text-dim mt-2">
            GPIO pins physically expressing my emotional state in real-time
          </p>
        </div>
      </div>
    </div>
  )
}