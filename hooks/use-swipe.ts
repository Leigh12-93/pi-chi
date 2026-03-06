'use client'

import { useRef, useCallback } from 'react'

interface UseSwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
  velocityThreshold?: number
}

export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 50, velocityThreshold = 0.4 }: UseSwipeOptions) {
  const startX = useRef(0)
  const startY = useRef(0)
  const startTime = useRef(0)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    // Guard: don't capture swipes that start inside horizontal-scrollable containers
    const target = e.target as HTMLElement
    const scrollable = target.closest('[data-swipe-ignore], .overflow-x-auto, .overflow-x-scroll, .monaco-editor, [role="tablist"]')
    if (scrollable) {
      startX.current = 0
      startY.current = 0
      startTime.current = 0
      return
    }

    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    startTime.current = Date.now()
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!startTime.current) return

    const endX = e.changedTouches[0].clientX
    const endY = e.changedTouches[0].clientY
    const dx = endX - startX.current
    const dy = endY - startY.current
    const elapsed = (Date.now() - startTime.current) / 1000 // seconds
    const velocity = elapsed > 0 ? Math.abs(dx) / elapsed : 0

    // Only trigger if horizontal movement dominates vertical
    if (Math.abs(dx) < Math.abs(dy)) return

    // Accept either: distance threshold OR fast velocity flick (short swipe but fast)
    const meetsDistance = Math.abs(dx) >= threshold
    const meetsVelocity = velocity >= velocityThreshold * 1000 && Math.abs(dx) >= 20

    if (!meetsDistance && !meetsVelocity) return

    if (dx > 0) onSwipeRight?.()
    else onSwipeLeft?.()
  }, [onSwipeLeft, onSwipeRight, threshold, velocityThreshold])

  return { onTouchStart, onTouchEnd }
}
