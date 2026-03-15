import { useState, useEffect } from 'react'

/**
 * Tracks online/offline status and triggers a retry callback when coming back online.
 */
export function useOfflineSync(onReconnect: () => void) {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => {
      setIsOffline(false)
      onReconnect()
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [onReconnect])

  return { isOffline }
}
