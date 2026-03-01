'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

interface Session {
  user: { name: string; email: string; image: string }
  githubUsername: string
}

interface SessionContextValue {
  session: Session | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
  refresh: () => void
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  status: 'loading',
  refresh: () => {},
})

export function useSession() {
  return useContext(SessionContext)
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

  const fetchSession = useCallback(async (isRetry = false) => {
    try {
      const res = await fetch('/api/auth/session')
      const data = await res.json()
      if (data?.user) {
        setSession(data)
        setStatus('authenticated')
      } else {
        setSession(null)
        setStatus('unauthenticated')
      }
    } catch {
      if (!isRetry) {
        setTimeout(() => fetchSession(true), 2000)
        return
      }
      setSession(null)
      setStatus('unauthenticated')
    }
  }, [])

  useEffect(() => {
    fetchSession()

    // Re-fetch session every 5 minutes and on tab visibility change
    const interval = setInterval(fetchSession, 5 * 60 * 1000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchSession()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchSession])

  return (
    <SessionContext.Provider value={{ session, status, refresh: fetchSession }}>
      {children}
    </SessionContext.Provider>
  )
}
