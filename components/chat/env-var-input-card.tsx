'use client'

import { useState } from 'react'
import { Key } from 'lucide-react'
import { cn } from '@/lib/utils'

export function EnvVarInputCard({
  variables,
  savedVars,
  onSave,
}: {
  variables: Array<{ name: string; description?: string; required?: boolean }>
  savedVars: Record<string, string>
  onSave: (vars: Record<string, string>) => void
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const v of variables) {
      initial[v.name] = savedVars[v.name] || ''
    }
    return initial
  })
  const [saved, setSaved] = useState(false)

  const allRequiredFilled = variables
    .filter(v => v.required !== false)
    .every(v => values[v.name]?.trim())

  const handleSave = () => {
    const trimmed: Record<string, string> = {}
    for (const [k, v] of Object.entries(values)) {
      if (v.trim()) trimmed[k] = v.trim()
    }
    onSave(trimmed)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="border border-pi-border bg-pi-surface/30 rounded-xl p-3.5 text-[12px]">
      <div className="flex items-center gap-2 mb-2.5">
        <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 text-pi-accent bg-pi-accent/10">
          <Key className="w-3 h-3" />
        </div>
        <span className="font-medium text-pi-text">Environment Variables Required</span>
      </div>
      <div className="space-y-2.5">
        {variables.map((v) => (
          <div key={v.name}>
            <div className="flex items-center gap-1 mb-1">
              <code className="text-[11px] font-mono text-pi-text font-medium">{v.name}</code>
              {v.required !== false && <span className="text-red-500 text-[9px]">*</span>}
            </div>
            {v.description && (
              <p className="text-[11px] text-pi-text-dim mb-1">{v.description}</p>
            )}
            <input
              type={v.name.toLowerCase().includes('secret') || v.name.toLowerCase().includes('key') || v.name.toLowerCase().includes('password') || v.name.toLowerCase().includes('token') ? 'password' : 'text'}
              value={values[v.name] || ''}
              onChange={(e) => setValues(prev => ({ ...prev, [v.name]: e.target.value }))}
              placeholder={v.name}
              className="w-full px-2.5 py-1.5 rounded-md bg-pi-bg border border-pi-border text-[11.5px] font-mono text-pi-text placeholder:text-pi-text-dim/40 focus:outline-none focus:border-pi-accent/40 focus:shadow-[0_0_0_3px_var(--color-pi-ring)] transition-all"
            />
          </div>
        ))}
      </div>
      <button
        onClick={handleSave}
        disabled={!allRequiredFilled}
        className={cn(
          'mt-3 px-3.5 py-1.5 rounded-md text-[12px] font-medium transition-colors',
          saved
            ? 'bg-emerald-500 text-white'
            : allRequiredFilled
              ? 'bg-pi-accent hover:bg-pi-accent/90 text-white cursor-pointer'
              : 'bg-pi-surface text-pi-text-dim/50 cursor-not-allowed'
        )}
      >
        {saved ? 'Saved!' : 'Save Environment Variables'}
      </button>
    </div>
  )
}
