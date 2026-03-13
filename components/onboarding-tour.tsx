'use client'

import { useState, useEffect, useRef } from 'react'
import { X, ChevronRight, Sparkles, MessageSquare, Eye, FolderTree, Rocket } from 'lucide-react'

const STEPS = [
  {
    title: 'Welcome to Pi-Chi',
    description: 'Build React websites with AI. Describe what you want and watch it come to life.',
    icon: Sparkles,
  },
  {
    title: 'Chat with AI',
    description: 'Use the chat panel on the left to describe what you want to build. The AI will create, edit, and manage files for you.',
    icon: MessageSquare,
  },
  {
    title: 'Browse & Edit Files',
    description: 'The file tree shows your project structure. Click any file to open it in the code editor with syntax highlighting.',
    icon: FolderTree,
  },
  {
    title: 'Live Preview',
    description: 'Switch between Code, Split, and Preview modes to see your project rendered in real-time as the AI builds it.',
    icon: Eye,
  },
  {
    title: 'Deploy & Share',
    description: 'When you\'re happy, deploy to Vercel, push to GitHub, or download as a ZIP. Use Ctrl+K for the command palette.',
    icon: Rocket,
  },
]

export function OnboardingTour() {
  const [visible, setVisible] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    const seen = localStorage.getItem('pi-onboarding-seen')
    if (!seen) setVisible(true)
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    localStorage.setItem('pi-onboarding-seen', '1')
  }

  const [transitioning, setTransitioning] = useState(false)
  const pendingStep = useRef<number | null>(null)

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      // Fade out, swap step, fade in
      setTransitioning(true)
      pendingStep.current = step + 1
      setTimeout(() => {
        setStep(pendingStep.current!)
        setTransitioning(false)
        pendingStep.current = null
      }, 150)
    } else {
      handleDismiss()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      handleDismiss()
    } else if (e.key === 'Tab') {
      // Keep focus within the modal
      const modal = e.currentTarget
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
  }

  if (!visible) return null

  const currentStep = STEPS[step]
  const StepIcon = currentStep.icon

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center" onClick={handleDismiss} onKeyDown={handleKeyDown}>
      <div className="absolute inset-0 bg-pi-overlay backdrop-blur-md animate-fade-in" />
      <div
        className="relative w-full max-w-sm mx-4 bg-pi-bg rounded-2xl shadow-2xl border border-pi-border overflow-hidden animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 p-1 rounded-lg text-pi-text-dim hover:text-pi-text hover:bg-pi-surface transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        <div
          className="p-6 text-center transition-all duration-150 ease-out"
          style={{ opacity: transitioning ? 0 : 1, transform: transitioning ? 'translateY(4px)' : 'translateY(0)' }}
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-pi-accent/20 to-purple-500/20 mb-4 animate-breathe">
            <StepIcon className="w-7 h-7 text-pi-accent" />
          </div>
          <h2 className="text-base font-semibold text-pi-text mb-2">{currentStep.title}</h2>
          <p className="text-xs text-pi-text-dim leading-relaxed">{currentStep.description}</p>
        </div>

        <div className="flex items-center justify-between px-5 py-3 border-t border-pi-border bg-pi-surface/30">
          {/* Dots */}
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === step ? 'bg-pi-accent w-4' : i < step ? 'bg-pi-accent/50 w-1.5' : 'bg-pi-border w-1.5'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 text-xs text-pi-text-dim hover:text-pi-text rounded-lg hover:bg-pi-surface transition-colors"
            >
              Skip
            </button>
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-pi-accent hover:bg-pi-accent-hover rounded-lg transition-colors"
            >
              {step < STEPS.length - 1 ? (
                <>
                  Next
                  <ChevronRight className="w-3 h-3" />
                </>
              ) : (
                'Get Started'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
