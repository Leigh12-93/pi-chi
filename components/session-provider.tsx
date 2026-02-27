'use client'

import { createContext, useContext, useEffect, useState } from 'react'

interface Session {
  user: { name: string; email: string; image: string }
  accessToken: string
  githubUsername: string
}

interface SessionContextValue {
  session: Session | null
  status: 'loading' | 'authenticated' | 'unauthenticated'
}

const SessionContext = createContext<SessionContextValue>({
  session: null,
  status: 'loading',
})

export function useSession() {
  return useContext(SessionContext)
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [status, setStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading')

  useEffect(() => {
    fetch('/api/auth/session')
      .then(res => res.json())
      .then(data => {
        if (data?.user) {
          setSession(data)
          setStatus('authenticated')
        } else {
          setSession(null)
          setStatus('unauthenticated')
        }
      })
      .catch(() => {
        setSession(null)
        setStatus('unauthenticated')
      })
  }, [])

  return (
    <SessionContext.Provider value={{ session, status }}>
      {children}
    </SessionContext.Provider>
  )
}
