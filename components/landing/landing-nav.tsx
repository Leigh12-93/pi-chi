'use client'

import { useState, useEffect } from 'react'
import { Github, Menu, X } from 'lucide-react'

interface LandingNavProps {
  onSignIn: () => void
  loading: boolean
}

export function LandingNav({ onSignIn, loading }: LandingNavProps) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-150 ${
        scrolled
          ? 'nav-scrolled bg-forge-bg/80 border-b border-forge-border/50'
          : 'bg-transparent'
      }`}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-forge-accent to-red-600 flex items-center justify-center">
            <span className="text-sm font-bold text-white">6-&#x03C7;</span>
          </div>
          <span className="font-semibold text-forge-text tracking-tight">Six-Chi</span>
        </div>

        {/* Desktop CTA */}
        <button
          onClick={onSignIn}
          disabled={loading}
          className="hidden sm:flex items-center gap-2 px-4 py-2 rounded-lg bg-forge-accent text-white text-sm font-medium hover:bg-forge-accent-hover transition-colors disabled:opacity-50"
        >
          <Github className="w-4 h-4" />
          {loading ? 'Connecting...' : 'Sign in with GitHub'}
        </button>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="sm:hidden p-2 text-forge-text-dim hover:text-forge-text transition-colors"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="sm:hidden border-t border-forge-border/50 bg-forge-bg/95 nav-scrolled px-4 py-4">
          <button
            onClick={onSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-forge-accent text-white text-sm font-medium hover:bg-forge-accent-hover transition-colors disabled:opacity-50"
          >
            <Github className="w-4 h-4" />
            {loading ? 'Connecting...' : 'Sign in with GitHub'}
          </button>
        </div>
      )}
    </nav>
  )
}
