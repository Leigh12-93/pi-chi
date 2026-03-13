'use client'

import { useState } from 'react'
import {
  ArrowRight, Globe, ShoppingCart,
  FileText, Layout, Rocket,
} from 'lucide-react'

interface OnboardingProps {
  onComplete: (opts: { template: string; description: string }) => void
}

const CATEGORIES = [
  { id: 'website', label: 'Website', icon: Globe, desc: 'Landing page, portfolio, blog' },
  { id: 'webapp', label: 'Web App', icon: Layout, desc: 'SaaS, dashboard, tool' },
  { id: 'ecommerce', label: 'E-commerce', icon: ShoppingCart, desc: 'Online store, product page' },
  { id: 'docs', label: 'Documentation', icon: FileText, desc: 'Docs site, knowledge base' },
]

const TEMPLATES: Record<string, { id: string; label: string; desc: string; framework: string }[]> = {
  website: [
    { id: 'nextjs', label: 'Next.js Site', desc: 'Full-stack React with routing', framework: 'nextjs' },
    { id: 'static', label: 'Static HTML', desc: 'Simple, fast, no framework', framework: 'static' },
    { id: 'portfolio', label: 'Portfolio', desc: 'Creative showcase site', framework: 'portfolio' },
    { id: 'blog', label: 'Blog', desc: 'Content-focused with MDX', framework: 'blog' },
  ],
  webapp: [
    { id: 'dashboard', label: 'Dashboard', desc: 'Data viz + admin panel', framework: 'dashboard' },
    { id: 'saas', label: 'SaaS Starter', desc: 'Auth + billing + dashboard', framework: 'saas' },
    { id: 'vite-react', label: 'Vite + React', desc: 'Fast SPA development', framework: 'vite-react' },
  ],
  ecommerce: [
    { id: 'ecommerce', label: 'Store', desc: 'Product catalog + cart', framework: 'ecommerce' },
    { id: 'nextjs', label: 'Custom Build', desc: 'From scratch with Next.js', framework: 'nextjs' },
  ],
  docs: [
    { id: 'docs', label: 'Documentation', desc: 'Clean docs with sidebar', framework: 'docs' },
    { id: 'static', label: 'Simple Docs', desc: 'Single-page documentation', framework: 'static' },
  ],
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<'category' | 'template' | 'describe'>('category')
  const [category, setCategory] = useState<string | null>(null)
  const [template, setTemplate] = useState<string | null>(null)
  const [description, setDescription] = useState('')

  const handleCategorySelect = (id: string) => {
    setCategory(id)
    setStep('template')
  }

  const handleTemplateSelect = (id: string) => {
    setTemplate(id)
    setStep('describe')
  }

  const handleSubmit = () => {
    if (!template) return
    onComplete({ template, description: description.trim() })
  }

  return (
    <div className="min-h-screen bg-pi-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-8">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-pi-accent to-red-600 flex items-center justify-center shadow-lg shadow-pi-accent/20">
            <span className="text-2xl font-bold text-white">6-&#x03C7;</span>
          </div>
          <h1 className="text-2xl font-bold text-pi-text">What are you building?</h1>
          <p className="text-sm text-pi-text-dim">
            {step === 'category' && 'Choose a category to get started'}
            {step === 'template' && 'Pick a starting template'}
            {step === 'describe' && 'Describe your project (optional)'}
          </p>
        </div>

        {/* Step: Category */}
        {step === 'category' && (
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleCategorySelect(cat.id)}
                className="p-4 rounded-xl bg-pi-surface border border-pi-border hover:border-pi-accent/50 hover:bg-pi-surface/80 transition-all text-left group"
              >
                <cat.icon className="w-5 h-5 text-pi-accent mb-2 group-hover:scale-110 transition-transform" />
                <p className="text-sm font-medium text-pi-text">{cat.label}</p>
                <p className="text-[11px] text-pi-text-dim mt-0.5">{cat.desc}</p>
              </button>
            ))}
          </div>
        )}

        {/* Step: Template */}
        {step === 'template' && category && (
          <div className="space-y-3">
            <button
              onClick={() => setStep('category')}
              className="text-xs text-pi-text-dim hover:text-pi-text transition-colors"
            >
              &larr; Back
            </button>
            <div className="grid grid-cols-1 gap-2">
              {(TEMPLATES[category] || []).map(t => (
                <button
                  key={t.id}
                  onClick={() => handleTemplateSelect(t.framework)}
                  className="flex items-center gap-3 p-3 rounded-xl bg-pi-surface border border-pi-border hover:border-pi-accent/50 transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-lg bg-pi-accent/10 flex items-center justify-center shrink-0">
                    <Rocket className="w-4 h-4 text-pi-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-pi-text">{t.label}</p>
                    <p className="text-[11px] text-pi-text-dim">{t.desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-pi-text-dim shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step: Describe */}
        {step === 'describe' && (
          <div className="space-y-4">
            <button
              onClick={() => setStep('template')}
              className="text-xs text-pi-text-dim hover:text-pi-text transition-colors"
            >
              &larr; Back
            </button>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g., A minimalist portfolio for a photographer with a dark theme, image grid, and contact form..."
              className="w-full h-32 px-4 py-3 bg-pi-surface border border-pi-border rounded-xl text-sm text-pi-text placeholder:text-pi-text-dim/50 focus:outline-none focus:border-pi-accent resize-none transition-colors"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={handleSubmit}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-pi-accent text-white font-medium rounded-xl hover:bg-pi-accent-hover transition-colors"
              >
                <Rocket className="w-4 h-4" />
                {description.trim() ? 'Build It' : 'Start with Template'}
              </button>
            </div>
          </div>
        )}

        {/* Skip option */}
        <div className="text-center">
          <button
            onClick={() => onComplete({ template: 'nextjs', description: '' })}
            className="text-xs text-pi-text-dim/50 hover:text-pi-text-dim transition-colors"
          >
            Skip &mdash; start with a blank Next.js project
          </button>
        </div>
      </div>
    </div>
  )
}
