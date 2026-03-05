'use client'

import { useState, useMemo } from 'react'
import { Search, Package, Copy, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ComponentLibraryProps {
  onInsert?: (code: string) => void
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'layout', label: 'Layout' },
  { id: 'form', label: 'Form' },
  { id: 'display', label: 'Display' },
  { id: 'feedback', label: 'Feedback' },
  { id: 'nav', label: 'Navigation' },
]

const COMPONENTS = [
  { name: 'Button', category: 'form', desc: 'Interactive button with variants', tags: ['primary', 'secondary', 'outline', 'ghost'] },
  { name: 'Input', category: 'form', desc: 'Text input field', tags: ['text', 'email', 'password', 'search'] },
  { name: 'Textarea', category: 'form', desc: 'Multi-line text input', tags: ['form', 'text'] },
  { name: 'Select', category: 'form', desc: 'Dropdown select', tags: ['dropdown', 'options'] },
  { name: 'Checkbox', category: 'form', desc: 'Checkbox with label', tags: ['toggle', 'boolean'] },
  { name: 'Switch', category: 'form', desc: 'Toggle switch', tags: ['toggle', 'boolean'] },
  { name: 'Card', category: 'display', desc: 'Content container with border', tags: ['container', 'box'] },
  { name: 'Badge', category: 'display', desc: 'Status indicator label', tags: ['tag', 'status', 'label'] },
  { name: 'Avatar', category: 'display', desc: 'User avatar with fallback', tags: ['user', 'image', 'profile'] },
  { name: 'Dialog', category: 'feedback', desc: 'Modal dialog overlay', tags: ['modal', 'popup', 'overlay'] },
  { name: 'Toast', category: 'feedback', desc: 'Notification toast', tags: ['notification', 'alert'] },
  { name: 'Alert', category: 'feedback', desc: 'Alert message banner', tags: ['warning', 'info', 'error'] },
  { name: 'Tooltip', category: 'feedback', desc: 'Hover tooltip', tags: ['popover', 'hint'] },
  { name: 'Tabs', category: 'nav', desc: 'Tab navigation', tags: ['navigation', 'sections'] },
  { name: 'Breadcrumb', category: 'nav', desc: 'Breadcrumb navigation', tags: ['navigation', 'path'] },
  { name: 'Pagination', category: 'nav', desc: 'Page navigation', tags: ['pages', 'list'] },
  { name: 'Sidebar', category: 'layout', desc: 'Collapsible sidebar', tags: ['navigation', 'menu'] },
  { name: 'Header', category: 'layout', desc: 'Page header with nav', tags: ['navigation', 'top'] },
  { name: 'Footer', category: 'layout', desc: 'Page footer', tags: ['bottom', 'links'] },
  { name: 'Grid', category: 'layout', desc: 'Responsive grid layout', tags: ['columns', 'responsive'] },
  { name: 'Table', category: 'display', desc: 'Data table with sorting', tags: ['data', 'list', 'sort'] },
  { name: 'Skeleton', category: 'feedback', desc: 'Loading skeleton', tags: ['loading', 'placeholder'] },
  { name: 'Progress', category: 'feedback', desc: 'Progress bar', tags: ['loading', 'status'] },
  { name: 'Accordion', category: 'display', desc: 'Expandable sections', tags: ['collapse', 'expand', 'faq'] },
]

export function ComponentLibrary({ onInsert }: ComponentLibraryProps) {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return COMPONENTS.filter(c => {
      const matchesCategory = category === 'all' || c.category === category
      const matchesSearch = !search ||
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        c.desc.toLowerCase().includes(search.toLowerCase()) ||
        c.tags.some(t => t.includes(search.toLowerCase()))
      return matchesCategory && matchesSearch
    })
  }, [search, category])

  const handleCopy = (name: string) => {
    const prompt = `Add a ${name} component to my project using shadcn/ui style with Tailwind CSS. Make it reusable with proper TypeScript types and variants.`
    navigator.clipboard.writeText(prompt)
    setCopiedId(name)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="h-full flex flex-col bg-forge-panel">
      <div className="px-3 pt-3 pb-2 space-y-2">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-forge-accent" />
          <span className="text-xs font-medium text-forge-text">Components</span>
        </div>

        <div className="flex items-center gap-1.5 bg-forge-surface border border-forge-border rounded-lg px-2">
          <Search className="w-3 h-3 text-forge-text-dim" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search components..."
            className="flex-1 py-1.5 text-xs bg-transparent text-forge-text placeholder:text-forge-text-dim/50 focus:outline-none"
          />
        </div>

        <div className="flex gap-1 overflow-x-auto">
          {CATEGORIES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={cn(
                'px-2 py-1 text-[10px] rounded-full whitespace-nowrap transition-colors',
                category === cat.id
                  ? 'bg-forge-accent/10 text-forge-accent'
                  : 'text-forge-text-dim hover:text-forge-text',
              )}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {filtered.map(comp => (
          <div
            key={comp.name}
            className="flex items-center justify-between px-2.5 py-2 rounded-lg hover:bg-forge-surface/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-xs font-medium text-forge-text">{comp.name}</p>
              <p className="text-[10px] text-forge-text-dim truncate">{comp.desc}</p>
            </div>
            <button
              onClick={() => handleCopy(comp.name)}
              className="p-1.5 text-forge-text-dim hover:text-forge-accent opacity-0 group-hover:opacity-100 transition-all"
              title="Copy prompt to add this component"
            >
              {copiedId === comp.name ? (
                <Check className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-xs text-forge-text-dim text-center py-4">No components found</p>
        )}
      </div>
    </div>
  )
}
