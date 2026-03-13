'use client'

import { useState, useEffect, useRef } from 'react'
import { Download, X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function PWAInstallPrompt() {
  const [show, setShow] = useState(false)
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    // Don't show if already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // Check dismiss timestamp — suppress for 7 days
    const dismissed = localStorage.getItem('sixchi-install-dismissed')
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return

    // Visit counter — show after 2nd visit
    const visits = Number(localStorage.getItem('pichi-visits') || '0') + 1
    localStorage.setItem('pichi-visits', String(visits))
    if (visits < 2) return

    const handler = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e as BeforeInstallPromptEvent
      setShow(true)
    }

    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt.current) return
    deferredPrompt.current.prompt()
    const { outcome } = await deferredPrompt.current.userChoice
    if (outcome === 'accepted') {
      setShow(false)
    }
    deferredPrompt.current = null
  }

  const handleDismiss = () => {
    localStorage.setItem('sixchi-install-dismissed', String(Date.now()))
    setShow(false)
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed bottom-20 left-3 right-3 z-50 md:hidden"
        >
          <div className="flex items-center gap-3 px-4 py-3 bg-pi-panel/95 backdrop-blur-lg border border-pi-border rounded-2xl shadow-lg">
            <Download className="w-5 h-5 text-pi-accent shrink-0" />
            <span className="flex-1 text-xs text-pi-text">
              Add Pi-Chi to your home screen
            </span>
            <button
              onClick={handleInstall}
              className="px-3 py-1.5 text-xs font-medium bg-pi-accent text-white rounded-lg hover:bg-pi-accent-hover transition-colors"
            >
              Install
            </button>
            <button
              onClick={handleDismiss}
              className="p-1 text-pi-text-dim hover:text-pi-text transition-colors"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Type for the BeforeInstallPromptEvent (not in standard TS lib)
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
