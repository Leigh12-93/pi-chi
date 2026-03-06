'use client'

import { useRef, useCallback } from 'react'

interface UseSwipeOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  threshold?: number
}

export function useSwipe({ onSwipeLeft, onSwipeRight, threshold = 50 }: UseSwipeOptions) {
  const startX = useRef(0)
  const startY = useRef(0)

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
  }, [])

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const endX = e.changedTouches[0].clientX
    const endY = e.changedTouches[0].clientY
    const dx = endX - startX.current
    const dy = endY - startY.current

    // Only trigger if horizontal movement dominates vertical
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy)) return

    if (dx > 0) onSwipeRight?.()
    else onSwipeLeft?.()
  }, [onSwipeLeft, onSwipeRight, threshold])

  return { onTouchStart, onTouchEnd }
}
