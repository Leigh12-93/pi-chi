'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

type Theme = 'light' | 'dark'

interface ThemeContextValue {
  theme: Theme
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'light',
  toggleTheme: () => {},
})

export const useTheme = () => useContext(ThemeContext)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  // Sync with localStorage on mount (class already set by blocking script in layout)
  useEffect(() => {
    const stored = localStorage.getItem('forge-theme') as Theme | null
    if (stored === 'dark') setTheme('dark')
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      document.documentElement.classList.toggle('dark', next === 'dark')
      localStorage.setItem('forge-theme', next)
      return next
    })
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
