'use client'

import { useState } from 'react'

const questions = [
  {
    key: 'marketing_spend',
    title: '1. How much do you spend on marketing per month?',
    note: 'Include Google Ads, Hipages, Facebook, flyers, vehicle wraps — everything.',
    multi: false,
    options: [
      { value: 'nothing', label: '$0 — I rely on word of mouth' },
      { value: 'under_500', label: 'Under $500/month' },
      { value: '500_1500', label: '$500 – $1,500/month' },
      { value: '1500_3000', label: '$1,500 – $3,000/month' },
      { value: 'over_3000', label: 'Over $3,000/month' },
    ],
  },
  {
    key: 'attribution_knowledge',
    title: '2. Do you know which marketing channel brings your best customers?',
    note: 'Not just leads — actual paying customers who book jobs.',
    multi: false,
    options: [
      { value: 'yes_confident', label: 'Yes, I track it and know exactly' },
      { value: 'rough_idea', label: 'I have a rough idea but not certain' },
      { value: 'no_idea', label: 'No, I have no idea' },
      { value: 'dont_market', label: "I don't do any paid marketing" },
    ],
  },
  {
    key: 'channels',
    title: '3. Which channels do you use to get customers?',
    note: 'Select all that apply.',
    multi: true,
    options: [
      { value: 'google_ads', label: 'Google Ads' },
      { value: 'hipages', label: 'Hipages / ServiceSeeking / Airtasker' },
      { value: 'facebook', label: 'Facebook / Instagram ads' },
      { value: 'google_business', label: 'Google Business Profile (Maps listing)' },
      { value: 'website', label: 'Own website / SEO' },
      { value: 'referrals', label: 'Word of mouth / referrals' },
      { value: 'flyers', label: 'Flyers / letterbox drops' },
      { value: 'vehicle', label: 'Vehicle signage' },
      { value: 'other', label: 'Other' },
    ],
  },
  {
    key: 'pain_point',
    title: "4. What's your biggest frustration with marketing your trade business?",
    note: 'Pick the one that annoys you most.',
    multi: false,
    options: [
      { value: 'wasted_money', label: "Spending money but not knowing if it works" },
      { value: 'too_complex', label: 'Too many platforms, too complicated' },
      { value: 'bad_leads', label: 'Getting leads that never convert to real jobs' },
      { value: 'no_time', label: 'No time to manage marketing while doing actual work' },
      { value: 'no_frustration', label: 'No frustration — marketing works fine for me' },
    ],
  },
  {
    key: 'willingness_to_pay',
    title: '5. If a tool showed you exactly which marketing brings paying jobs, what would you pay?',
    note: 'A simple dashboard that connects your marketing spend to actual booked jobs.',
    multi: false,
    options: [
      { value: 'nothing', label: "I wouldn't pay — I'd figure it out myself" },
      { value: 'under_50', label: 'Under $50/month' },
      { value: '50_100', label: '$50 – $100/month' },
      { value: '100_200', label: '$100 – $200/month' },
      { value: 'over_200', label: 'Over $200/month if it saved me real money' },
    ],
  },
]

export default function SurveyPage() {
  const [currentQ, setCurrentQ] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({})
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const q = questions[currentQ]
  const answer = answers[q.key]
  const hasAnswer = q.multi
    ? Array.isArray(answer) && answer.length > 0
    : !!answer

  function selectOption(value: string) {
    if (q.multi) {
      const current = (answers[q.key] as string[]) || []
      const updated = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value]
      setAnswers({ ...answers, [q.key]: updated })
    } else {
      setAnswers({ ...answers, [q.key]: value })
    }
  }

  function isSelected(value: string) {
    if (q.multi) {
      return Array.isArray(answer) && answer.includes(value)
    }
    return answer === value
  }

  async function submit() {
    setSubmitting(true)
    setError(false)
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(answers),
      })
      if (res.ok) {
        setSubmitted(true)
      } else {
        throw new Error('Failed')
      }
    } catch {
      setError(true)
      setSubmitting(false)
    }
  }

  if (submitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e4e4e7', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif' }}>
        <div style={{ padding: '24px 0', borderBottom: '1px solid #1e1e2e', textAlign: 'center' }}>
          <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#3b82f6' }}>Trade<span style={{ color: '#e4e4e7' }}>Track</span></div>
        </div>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '80px 24px', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.15)', color: '#22c55e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', marginBottom: 24 }}>&#10003;</div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: 12 }}>Thanks legend!</h2>
          <p style={{ color: '#71717a', maxWidth: 480, margin: '0 auto' }}>Your answers help us build something that actually works for tradies.</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e4e4e7', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif', lineHeight: 1.6 }}>
      <div style={{ padding: '24px 0', borderBottom: '1px solid #1e1e2e', textAlign: 'center' }}>
        <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#3b82f6' }}>Trade<span style={{ color: '#e4e4e7' }}>Track</span></div>
      </div>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 24px 80px' }}>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 800, marginBottom: 8, textAlign: 'center' }}>Quick Survey (2 minutes)</h1>
        <p style={{ color: '#71717a', textAlign: 'center', marginBottom: 40 }}>Help us build the right marketing tool for tradies. 5 questions, anonymous.</p>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 32 }}>
          {questions.map((_, i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i === currentQ ? '#3b82f6' : i < currentQ ? '#22c55e' : '#1e1e2e',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Question card */}
        <div style={{ background: '#12121a', border: '1px solid #1e1e2e', borderRadius: 12, padding: 32, marginBottom: 24 }}>
          <h2 style={{ fontSize: '1.15rem', marginBottom: 6 }}>{q.title}</h2>
          <p style={{ color: '#71717a', fontSize: '0.85rem', marginBottom: 20 }}>{q.note}</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {q.options.map((opt) => (
              <div
                key={opt.value}
                onClick={() => selectOption(opt.value)}
                style={{
                  padding: '14px 18px', border: `1px solid ${isSelected(opt.value) ? '#3b82f6' : '#1e1e2e'}`,
                  borderRadius: 8, cursor: 'pointer', fontSize: '0.95rem',
                  background: isSelected(opt.value) ? 'rgba(59,130,246,0.15)' : 'transparent',
                  color: isSelected(opt.value) ? 'white' : '#e4e4e7',
                  transition: 'all 0.2s',
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24 }}>
            {currentQ > 0 ? (
              <button onClick={() => setCurrentQ(currentQ - 1)} style={{
                padding: '12px 28px', borderRadius: 8, border: '1px solid #1e1e2e',
                background: '#12121a', color: '#71717a', fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
              }}>Back</button>
            ) : <div />}

            {currentQ < questions.length - 1 ? (
              <button onClick={() => setCurrentQ(currentQ + 1)} disabled={!hasAnswer} style={{
                padding: '12px 28px', borderRadius: 8, border: 'none',
                background: '#3b82f6', color: 'white', fontSize: '0.95rem', fontWeight: 600,
                cursor: hasAnswer ? 'pointer' : 'not-allowed', opacity: hasAnswer ? 1 : 0.4,
              }}>Next</button>
            ) : (
              <button onClick={submit} disabled={!hasAnswer || submitting} style={{
                padding: '12px 28px', borderRadius: 8, border: 'none',
                background: '#22c55e', color: 'white', fontSize: '0.95rem', fontWeight: 600,
                cursor: hasAnswer && !submitting ? 'pointer' : 'not-allowed', opacity: hasAnswer && !submitting ? 1 : 0.4,
              }}>{submitting ? 'Submitting...' : 'Submit Survey'}</button>
            )}
          </div>

          {error && <p style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: 8 }}>Something went wrong. Please try again.</p>}
        </div>
      </div>
    </div>
  )
}
