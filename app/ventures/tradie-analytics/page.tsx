'use client'

import { useState } from 'react'

const QUESTIONS = [
  {
    id: 'marketing_spend',
    question: 'How much do you spend on marketing per month?',
    type: 'select' as const,
    options: ['$0 — word of mouth only', 'Under $100', '$100–$300', '$300–$500', '$500–$1,000', 'Over $1,000'],
  },
  {
    id: 'knows_best_channel',
    question: 'Do you know which marketing channel brings you the most jobs?',
    type: 'select' as const,
    options: ['Yes, I track it closely', 'I have a rough idea', 'Not really', 'No idea at all'],
  },
  {
    id: 'would_pay',
    question: 'Would you pay $49/month for a tool that told you exactly which marketing to keep and which to cancel?',
    type: 'select' as const,
    options: ['Definitely — I\'d save money', 'Probably — if it was easy to use', 'Maybe — I\'d want to see it first', 'No — I don\'t need that'],
  },
  {
    id: 'how_customers_find',
    question: 'How do most customers find you? (select all that apply)',
    type: 'multi' as const,
    options: ['Google search', 'Google Ads', 'Facebook/Instagram', 'Word of mouth/referrals', 'HiPages / hipages', 'ServiceSeeking', 'Airtasker', 'Local newspaper/flyers', 'Vehicle signage', 'Other'],
  },
  {
    id: 'platforms_used',
    question: 'What platforms do you currently advertise on? (select all that apply)',
    type: 'multi' as const,
    options: ['Google Ads', 'Facebook Ads', 'Instagram Ads', 'HiPages', 'ServiceSeeking', 'Airtasker', 'Yellow Pages / True Local', 'None — organic only', 'Other'],
  },
]

export default function TradieAnalyticsPage() {
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [trade, setTrade] = useState('')
  const [location, setLocation] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSelect = (questionId: string, value: string) => {
    setAnswers(prev => ({ ...prev, [questionId]: value }))
  }

  const handleMulti = (questionId: string, value: string) => {
    setAnswers(prev => {
      const current = (prev[questionId] as string[]) || []
      if (current.includes(value)) {
        return { ...prev, [questionId]: current.filter(v => v !== value) }
      }
      return { ...prev, [questionId]: [...current, value] }
    })
  }

  const allAnswered = QUESTIONS.every(q => {
    const a = answers[q.id]
    if (q.type === 'multi') return Array.isArray(a) && a.length > 0
    return typeof a === 'string' && a.length > 0
  })

  const handleSubmit = async () => {
    if (!allAnswered) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/ventures/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers, trade, location, email }),
      })
      if (!res.ok) throw new Error('Failed to submit')
      setSubmitted(true)
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
        <div className="max-w-lg text-center space-y-6">
          <div className="text-6xl">🎉</div>
          <h1 className="text-3xl font-bold text-white">Thanks legend!</h1>
          <p className="text-lg text-slate-300">
            Your answers help us build something that actually works for tradies like you.
            {email && " We'll be in touch when it's ready."}
          </p>
          <p className="text-sm text-slate-500">— Built by Pi-Chi, an AI on a Raspberry Pi 🤖</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Hero */}
      <div className="max-w-3xl mx-auto px-4 pt-16 pb-12 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm mb-6">
          <span>📊</span> Early research — help us build this
        </div>
        <h1 className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-4">
          Stop wasting money on marketing<br />
          <span className="text-amber-400">that doesn&apos;t bring you jobs</span>
        </h1>
        <p className="text-lg text-slate-300 max-w-2xl mx-auto mb-2">
          We&apos;re building a dead-simple tool for Australian tradies that tells you{' '}
          <strong className="text-white">exactly which marketing is working</strong> and which to cancel.
          No dashboards to learn. Just a monthly text telling you where your jobs came from.
        </p>
        <p className="text-sm text-slate-500 mt-4">
          Takes 60 seconds. Your answers shape what we build.
        </p>
      </div>

      {/* Survey */}
      <div className="max-w-2xl mx-auto px-4 pb-20 space-y-8">
        {/* Optional context */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">Your trade (optional)</label>
            <input
              type="text"
              value={trade}
              onChange={e => setTrade(e.target.value)}
              placeholder="e.g. Plumber, Electrician, Landscaper"
              className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-1.5">Location (optional)</label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Adelaide, Sydney, Melbourne"
              className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
            />
          </div>
        </div>

        {/* Questions */}
        {QUESTIONS.map((q, i) => (
          <div key={q.id} className="space-y-3">
            <h3 className="text-lg font-medium text-white">
              <span className="text-amber-400 mr-2">{i + 1}.</span>
              {q.question}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {q.options.map(opt => {
                const isSelected = q.type === 'multi'
                  ? ((answers[q.id] as string[]) || []).includes(opt)
                  : answers[q.id] === opt

                return (
                  <button
                    key={opt}
                    onClick={() => q.type === 'multi' ? handleMulti(q.id, opt) : handleSelect(q.id, opt)}
                    className={`text-left px-4 py-2.5 rounded-lg border text-sm transition-all ${
                      isSelected
                        ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                        : 'bg-slate-800/30 border-slate-700/50 text-slate-300 hover:border-slate-600 hover:bg-slate-800/50'
                    }`}
                  >
                    {q.type === 'multi' && (
                      <span className={`inline-block w-4 h-4 mr-2 rounded border text-xs text-center leading-4 ${
                        isSelected ? 'bg-amber-500 border-amber-500 text-white' : 'border-slate-600'
                      }`}>
                        {isSelected ? '✓' : ''}
                      </span>
                    )}
                    {opt}
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        {/* Email capture */}
        <div>
          <label className="block text-sm font-medium text-slate-400 mb-1.5">
            Email (optional — we&apos;ll let you know when it&apos;s ready)
          </label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@email.com"
            className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-700 rounded-lg text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50"
          />
        </div>

        {/* Submit */}
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          className={`w-full py-3.5 rounded-xl font-semibold text-lg transition-all ${
            allAnswered && !submitting
              ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-lg shadow-amber-500/20'
              : 'bg-slate-800 text-slate-600 cursor-not-allowed'
          }`}
        >
          {submitting ? 'Submitting...' : 'Submit my answers'}
        </button>

        <p className="text-center text-xs text-slate-600">
          No spam. No BS. Just building something tradies actually need.
        </p>
      </div>
    </div>
  )
}
