'use client'

import { useState } from 'react'
import { Github, Zap, Code2, Rocket, Shield } from 'lucide-react'

export function SignInPage() {
  const [loading, setLoading] = useState(false)

  const handleSignIn = () => {
    setLoading(true)
    window.location.href = '/api/auth/login'
  }

  return (
    <div className="min-h-screen bg-forge-bg flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo + Title */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-forge-accent to-red-600 flex items-center justify-center shadow-lg shadow-forge-accent/20">
            <span className="text-3xl font-bold text-white">6-&#x03C7;</span>
          </div>
          <h1 className="text-3xl font-bold text-forge-text tracking-tight">Six-Chi</h1>
          <p className="text-forge-text-dim text-sm max-w-xs mx-auto">
            AI-powered development environment. Describe what you want, watch it build, ship with one click.
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { icon: Code2, label: 'Live Editor', desc: 'Monaco + WebContainer' },
            { icon: Zap, label: 'AI Builder', desc: 'Claude writes code live' },
            { icon: Rocket, label: 'One-Click Deploy', desc: 'Ship to Vercel instantly' },
            { icon: Shield, label: 'GitHub-First', desc: 'Your code, your repos' },
          ].map(({ icon: Icon, label, desc }) => (
            <div key={label} className="p-3 rounded-xl bg-forge-surface border border-forge-border">
              <Icon className="w-4 h-4 text-forge-accent mb-2" />
              <p className="text-xs font-medium text-forge-text">{label}</p>
              <p className="text-[10px] text-forge-text-dim mt-0.5">{desc}</p>
            </div>
          ))}
        </div>

        {/* Sign In Button */}
        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-6 py-3.5 bg-white text-black font-medium rounded-xl hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <Github className="w-5 h-5" />
          {loading ? 'Connecting...' : 'Sign in with GitHub'}
        </button>

        <p className="text-[10px] text-forge-text-dim/50 text-center">
          Six-Chi uses your GitHub account for auth and repo access. Your API key is encrypted and never shared.
        </p>
      </div>
    </div>
  )
}
