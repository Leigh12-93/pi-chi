export interface ComponentReference {
  name: string
  category: 'layout' | 'navigation' | 'form' | 'data-display' | 'feedback' | 'auth' | 'dashboard' | 'page'
  description: string
  tags: string[]
  code: string
}

export const REFERENCE_LIBRARY: ComponentReference[] = [
  // ─── DATA DISPLAY ───────────────────────────────────────────
  {
    name: 'DataTable',
    category: 'data-display',
    description: 'Generic data table with typed columns, loading skeleton, empty state, and clickable rows. Uses a column config array with render functions.',
    tags: ['table', 'data', 'list', 'grid', 'sort', 'skeleton', 'loading'],
    code: `'use client'
import { ReactNode } from 'react'

interface Column<T> {
  key: string
  header: string
  cell: (item: T) => ReactNode
  className?: string
}

interface DataTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyField: keyof T
  onRowClick?: (item: T) => void
  loading?: boolean
  emptyMessage?: string
}

export function DataTable<T>({ columns, data, keyField, onRowClick, loading, emptyMessage = 'No data found' }: DataTableProps<T>) {
  if (loading) return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => <div key={i} className="h-12 w-full bg-muted animate-pulse rounded" />)}
    </div>
  )
  if (!data.length) return <div className="text-center py-12 text-muted-foreground">{emptyMessage}</div>
  return (
    <table className="w-full">
      <thead><tr>{columns.map(c => <th key={c.key} className={c.className}>{c.header}</th>)}</tr></thead>
      <tbody>
        {data.map(item => (
          <tr key={String(item[keyField])} onClick={() => onRowClick?.(item)}
              className={onRowClick ? 'cursor-pointer hover:bg-muted/50' : ''}>
            {columns.map(c => <td key={c.key} className={c.className}>{c.cell(item)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}`,
  },
  {
    name: 'StatsCard',
    category: 'dashboard',
    description: 'Dashboard metric card with icon, title, large value, and optional trend indicator showing percentage change.',
    tags: ['stats', 'metric', 'kpi', 'card', 'dashboard', 'analytics', 'trend', 'number'],
    code: `'use client'
import { LucideIcon, TrendingUp, TrendingDown } from 'lucide-react'

interface StatsCardProps {
  title: string
  value: string | number
  icon: LucideIcon
  trend?: { value: number; label: string }
  highlight?: 'red' | 'green' | 'blue' | 'orange'
}

export function StatsCard({ title, value, icon: Icon, trend, highlight = 'blue' }: StatsCardProps) {
  const TrendIcon = trend && trend.value >= 0 ? TrendingUp : TrendingDown
  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold tracking-tight mt-1">{value}</p>
          {trend && (
            <p className={\`text-xs mt-2 flex items-center gap-1 \${trend.value >= 0 ? 'text-green-600' : 'text-red-600'}\`}>
              <TrendIcon className="h-3 w-3" /> {Math.abs(trend.value)}% {trend.label}
            </p>
          )}
        </div>
        <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
          <Icon className="h-6 w-6 text-primary" />
        </div>
      </div>
    </div>
  )
}`,
  },
  {
    name: 'StatusBadge',
    category: 'data-display',
    description: 'Configurable status badge with color mapping, optional icon, and size variants. Normalizes status strings for consistent display.',
    tags: ['badge', 'status', 'tag', 'chip', 'label', 'indicator'],
    code: `'use client'
import { CheckCircle2, Clock, AlertCircle, XCircle, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  paid: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  inactive: 'bg-gray-100 text-gray-600',
  cancelled: 'bg-gray-100 text-gray-500 line-through',
  overdue: 'bg-red-100 text-red-800',
  draft: 'bg-gray-100 text-gray-600',
}

const STATUS_ICONS: Record<string, typeof CheckCircle2> = {
  active: CheckCircle2, paid: CheckCircle2,
  pending: Clock, overdue: AlertCircle,
  cancelled: XCircle, processing: Loader2,
}

interface StatusBadgeProps {
  status: string
  showIcon?: boolean
  size?: 'sm' | 'default' | 'lg'
}

export function StatusBadge({ status, showIcon = false, size = 'default' }: StatusBadgeProps) {
  const normalized = status.toLowerCase()
  const Icon = STATUS_ICONS[normalized]
  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : size === 'lg' ? 'text-sm px-4 py-1.5' : 'text-xs px-3 py-1'
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full font-medium', sizeClass, STATUS_STYLES[normalized] || 'bg-gray-100 text-gray-600')}>
      {showIcon && Icon && <Icon className="h-3.5 w-3.5" />}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}`,
  },
  {
    name: 'EmptyState',
    category: 'feedback',
    description: 'Centered empty state with icon, title, description, and optional action button. Includes pre-configured variants for common entities.',
    tags: ['empty', 'state', 'placeholder', 'no-data', 'zero', 'blank'],
    code: `'use client'
import { LucideIcon, FileText } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description: string
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center px-4">
      <div className="rounded-full bg-muted p-4 mb-4">
        <Icon className="h-10 w-10 text-muted-foreground" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-xs">{description}</p>
      {action && (
        <button onClick={action.onClick}
          className="mt-6 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90">
          {action.label}
        </button>
      )}
    </div>
  )
}`,
  },
  // ─── LAYOUT ─────────────────────────────────────────────────
  {
    name: 'PageContainer',
    category: 'layout',
    description: 'Page-level container with title, optional description, badge, and action buttons slot. Staggers children entry animations.',
    tags: ['page', 'layout', 'container', 'header', 'title', 'wrapper'],
    code: `'use client'
import { ReactNode } from 'react'

interface PageContainerProps {
  children: ReactNode
  title: string
  description?: string
  actions?: ReactNode
  badge?: ReactNode
}

export function PageContainer({ children, title, description, actions, badge }: PageContainerProps) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            {badge}
          </div>
          {description && <p className="text-muted-foreground mt-1.5 text-sm">{description}</p>}
        </div>
        {actions && <div className="flex items-center gap-3 flex-shrink-0">{actions}</div>}
      </div>
      {children}
    </div>
  )
}`,
  },
  {
    name: 'PortalCard',
    category: 'layout',
    description: 'Versatile card component with variant styles (default, primary gradient, success, muted), size options, and optional click handler with keyboard support.',
    tags: ['card', 'container', 'box', 'panel', 'wrapper', 'variant'],
    code: `'use client'
import { forwardRef, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'primary' | 'success' | 'muted'

interface CardProps {
  variant?: Variant
  padding?: 'sm' | 'md' | 'lg'
  onClick?: () => void
  className?: string
  children: ReactNode
}

const variants: Record<Variant, string> = {
  default: 'bg-white border-gray-200 shadow-sm',
  primary: 'bg-gradient-to-br from-primary to-primary/80 border-transparent text-white shadow-lg',
  success: 'bg-green-50 border-green-200',
  muted: 'bg-muted border-muted-foreground/10',
}
const paddings = { sm: 'p-3', md: 'p-4 md:p-5', lg: 'p-5 md:p-6' }

const AppCard = forwardRef<HTMLDivElement, CardProps>(
  ({ variant = 'default', padding = 'md', onClick, className, children }, ref) => (
    <div ref={ref} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}
      onClick={onClick} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
      className={cn('rounded-xl border', paddings[padding], variants[variant],
        onClick && 'cursor-pointer hover:shadow-md active:scale-[0.99] transition-all', className)}>
      {children}
    </div>
  )
)
AppCard.displayName = 'AppCard'
export { AppCard }`,
  },
  {
    name: 'DashboardHeader',
    category: 'layout',
    description: 'Page header with time-based greeting, user name, and status badge. Useful for portal/dashboard landing pages.',
    tags: ['header', 'greeting', 'welcome', 'dashboard', 'portal', 'hero'],
    code: `'use client'

interface DashboardHeaderProps {
  userName: string
  status?: string
  statusVariant?: 'green' | 'orange' | 'blue'
}

function getGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  if (h >= 17 && h < 21) return 'Good evening'
  return 'Hello'
}

export function DashboardHeader({ userName, status, statusVariant = 'green' }: DashboardHeaderProps) {
  const first = userName.split(' ')[0]
  const colors = { green: 'bg-green-50 text-green-700 border-green-200', orange: 'bg-orange-50 text-orange-700 border-orange-200', blue: 'bg-blue-50 text-blue-700 border-blue-200' }
  return (
    <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold">{getGreeting()}, {first}</h1>
        <p className="text-sm text-muted-foreground">Welcome to your dashboard</p>
      </div>
      {status && (
        <span className={\`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium border w-fit \${colors[statusVariant]}\`}>
          {status}
        </span>
      )}
    </header>
  )
}`,
  },
  // ─── NAVIGATION ─────────────────────────────────────────────
  {
    name: 'FilterTabs',
    category: 'navigation',
    description: 'Horizontal scrollable pill-style filter tabs with optional count badges. Auto-scrolls active tab into view.',
    tags: ['tabs', 'filter', 'pills', 'navigation', 'horizontal', 'scroll', 'chip'],
    code: `'use client'
import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

interface Tab { id: string; label: string; count?: number }

interface FilterTabsProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (id: string) => void
}

export function FilterTabs({ tabs, activeTab, onTabChange }: FilterTabsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (activeRef.current && containerRef.current) {
      activeRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [activeTab])

  return (
    <div ref={containerRef} className="flex items-center gap-2 overflow-x-auto py-2">
      {tabs.map(tab => (
        <button key={tab.id} ref={tab.id === activeTab ? activeRef : undefined}
          onClick={() => onTabChange(tab.id)}
          className={cn('flex-shrink-0 h-9 px-4 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
            tab.id === activeTab ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}>
          {tab.label}
          {tab.count !== undefined && tab.count > 0 && <span className="ml-1.5 opacity-70">({tab.count})</span>}
        </button>
      ))}
    </div>
  )
}`,
  },
  {
    name: 'UnderlineTabs',
    category: 'navigation',
    description: 'Tab bar with animated underline indicator on the active tab. Clean alternative to pill-style tabs for section navigation.',
    tags: ['tabs', 'underline', 'navigation', 'section', 'animated'],
    code: `'use client'
import { cn } from '@/lib/utils'

interface Tab { id: string; label: string; count?: number }

interface UnderlineTabsProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (id: string) => void
}

export function UnderlineTabs({ tabs, activeTab, onTabChange }: UnderlineTabsProps) {
  return (
    <div className="flex items-center border-b">
      {tabs.map(tab => (
        <button key={tab.id} onClick={() => onTabChange(tab.id)}
          className={cn('relative px-4 py-3 text-sm font-medium transition-colors',
            tab.id === activeTab ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          {tab.label}
          {tab.count !== undefined && <span className="ml-1.5 text-primary">({tab.count})</span>}
          {tab.id === activeTab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
      ))}
    </div>
  )
}`,
  },
  {
    name: 'Sidebar',
    category: 'navigation',
    description: 'Collapsible sidebar navigation with icon-only collapsed state, sections, and active link highlighting. Responsive with mobile overlay.',
    tags: ['sidebar', 'navigation', 'menu', 'nav', 'drawer', 'collapsible', 'responsive'],
    code: `'use client'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronLeft, Menu, LucideIcon } from 'lucide-react'

interface NavItem { label: string; href: string; icon: LucideIcon; badge?: number }
interface SidebarProps { items: NavItem[]; activePath: string }

export function Sidebar({ items, activePath }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  return (
    <aside className={cn('h-screen border-r bg-card flex flex-col transition-all', collapsed ? 'w-16' : 'w-64')}>
      <div className="flex items-center justify-between p-4 border-b">
        {!collapsed && <span className="font-bold text-lg">App</span>}
        <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded-lg hover:bg-muted">
          {collapsed ? <Menu className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>
      <nav className="flex-1 p-2 space-y-1">
        {items.map(item => (
          <a key={item.href} href={item.href}
            className={cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              activePath === item.href ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted')}>
            <item.icon className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span className="flex-1">{item.label}</span>}
            {!collapsed && item.badge !== undefined && (
              <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs">{item.badge}</span>
            )}
          </a>
        ))}
      </nav>
    </aside>
  )
}`,
  },
  // ─── FORMS ──────────────────────────────────────────────────
  {
    name: 'FormDialog',
    category: 'form',
    description: 'Dialog-based form with react-hook-form + zod validation, error messages, loading state, and success feedback. Includes keyboard shortcut submit.',
    tags: ['form', 'dialog', 'modal', 'validation', 'input', 'create', 'edit', 'zod'],
    code: `'use client'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Loader2 } from 'lucide-react'

const schema = z.object({
  name: z.string().min(1, 'Required'),
  email: z.string().email('Invalid email'),
})
type FormData = z.infer<typeof schema>

interface FormDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (data: FormData) => Promise<void>
}

export function FormDialog({ open, onClose, onSubmit }: FormDialogProps) {
  const [loading, setLoading] = useState(false)
  const { register, handleSubmit, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema), mode: 'onChange',
  })

  const submit = async (data: FormData) => {
    setLoading(true)
    try { await onSubmit(data); onClose() }
    catch { /* handle error */ }
    finally { setLoading(false) }
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-background rounded-xl shadow-xl border p-6">
        <h2 className="text-lg font-semibold mb-4">Create Item</h2>
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div>
            <label className="text-sm font-medium">Name <span className="text-destructive">*</span></label>
            <input {...register('name')} className={cn('w-full mt-1 px-3 py-2 border rounded-lg', errors.name && 'border-destructive')} />
            {errors.name && <p className="text-sm text-destructive mt-1">{errors.name.message}</p>}
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input {...register('email')} type="email" className="w-full mt-1 px-3 py-2 border rounded-lg" />
            {errors.email && <p className="text-sm text-destructive mt-1">{errors.email.message}</p>}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-lg border hover:bg-muted">Cancel</button>
            <button type="submit" disabled={loading} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}`,
  },
  {
    name: 'SearchInput',
    category: 'form',
    description: 'Search input with icon, clear button, loading spinner, and keyboard shortcuts (Enter to submit, Escape to clear). Expandable variant included.',
    tags: ['search', 'input', 'filter', 'query', 'find', 'autocomplete', 'bar'],
    code: `'use client'
import { forwardRef, useState, useRef } from 'react'
import { Search, X, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  loading?: boolean
  onSubmit?: (value: string) => void
  className?: string
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ value, onChange, placeholder = 'Search...', loading, onSubmit, className }, ref) => {
    const [focused, setFocused] = useState(false)
    return (
      <div className={cn('relative flex items-center h-10 rounded-lg bg-muted', focused && 'ring-2 ring-primary bg-background', className)}>
        <Search className={cn('absolute left-3 h-4 w-4', focused ? 'text-primary' : 'text-muted-foreground')} />
        <input ref={ref} type="text" value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          onKeyDown={e => { if (e.key === 'Enter') onSubmit?.(value); if (e.key === 'Escape') onChange('') }}
          placeholder={placeholder}
          className="w-full h-full pl-9 pr-9 bg-transparent text-sm focus:outline-none" />
        {loading && <Loader2 className="absolute right-3 h-4 w-4 animate-spin text-muted-foreground" />}
        {value && !loading && (
          <button onClick={() => onChange('')} className="absolute right-2 p-1 rounded-full hover:bg-muted-foreground/10">
            <X className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        )}
      </div>
    )
  }
)
SearchInput.displayName = 'SearchInput'`,
  },
  {
    name: 'AutocompleteSearch',
    category: 'form',
    description: 'Search input with dropdown results, debounced API calls, keyboard navigation (arrow keys + enter), and selected item display with clear button.',
    tags: ['autocomplete', 'combobox', 'search', 'select', 'dropdown', 'typeahead', 'lookup'],
    code: `'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, X, Loader2 } from 'lucide-react'

interface Result { id: string | number; label: string; subtitle?: string }

interface AutocompleteProps {
  value: Result | null
  onChange: (item: Result | null) => void
  onSearch: (query: string) => Promise<Result[]>
  placeholder?: string
  debounceMs?: number
}

export function AutocompleteSearch({ value, onChange, onSearch, placeholder = 'Search...', debounceMs = 300 }: AutocompleteProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [loading, setLoading] = useState(false)
  const [isOpen, setIsOpen] = useState(false)
  const [focusIdx, setFocusIdx] = useState(-1)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (query.length < 2) { setResults([]); return }
    const timer = setTimeout(async () => {
      setLoading(true)
      try { setResults(await onSearch(query)) } finally { setLoading(false) }
    }, debounceMs)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setIsOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFocusIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFocusIdx(i => Math.max(i - 1, -1)) }
    if (e.key === 'Enter' && focusIdx >= 0) { e.preventDefault(); onChange(results[focusIdx]); setQuery(''); setIsOpen(false) }
    if (e.key === 'Escape') setIsOpen(false)
  }, [results, focusIdx])

  if (value) return (
    <div className="flex items-center gap-2 px-3 py-2 border rounded-lg bg-primary/5">
      <span className="flex-1 truncate font-medium">{value.label}</span>
      <button onClick={() => onChange(null)}><X className="h-4 w-4 text-muted-foreground" /></button>
    </div>
  )
  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input value={query} onChange={e => { setQuery(e.target.value); setIsOpen(true); setFocusIdx(-1) }}
          onFocus={() => setIsOpen(true)} onKeyDown={handleKey} placeholder={placeholder}
          className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin" />}
      </div>
      {isOpen && query.length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-popover border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {results.length > 0 ? results.map((r, i) => (
            <button key={r.id} onClick={() => { onChange(r); setQuery(''); setIsOpen(false) }}
              className={\`w-full px-3 py-2 text-left text-sm hover:bg-muted \${i === focusIdx ? 'bg-muted' : ''}\`}>
              <span className="font-medium">{r.label}</span>
              {r.subtitle && <span className="ml-2 text-muted-foreground">{r.subtitle}</span>}
            </button>
          )) : <div className="py-4 text-center text-sm text-muted-foreground">No results found</div>}
        </div>
      )}
    </div>
  )
}`,
  },
  // ─── FEEDBACK ───────────────────────────────────────────────
  {
    name: 'ConfirmDialog',
    category: 'feedback',
    description: 'Confirmation dialog with title, description, customizable button labels, and destructive variant for dangerous actions.',
    tags: ['dialog', 'confirm', 'modal', 'alert', 'warning', 'delete', 'destructive'],
    code: `'use client'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  variant?: 'default' | 'destructive'
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, variant = 'default' }: ConfirmDialogProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => onOpenChange(false)}>
      <div className="bg-background border rounded-xl shadow-xl p-6 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-2">{description}</p>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={() => onOpenChange(false)} className="px-4 py-2 text-sm rounded-lg border hover:bg-muted">{cancelLabel}</button>
          <button onClick={() => { onConfirm(); onOpenChange(false) }}
            className={\`px-4 py-2 text-sm rounded-lg text-white \${variant === 'destructive' ? 'bg-destructive hover:bg-destructive/90' : 'bg-primary hover:bg-primary/90'}\`}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}`,
  },
  {
    name: 'Toast',
    category: 'feedback',
    description: 'Toast notification system with context provider, auto-dismiss, type variants (success, error, warning, info), and action button support.',
    tags: ['toast', 'notification', 'snackbar', 'alert', 'message', 'feedback'],
    code: `'use client'
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'
interface Toast { id: string; type: ToastType; title: string; message?: string }

const icons = { success: CheckCircle, error: AlertCircle, warning: AlertCircle, info: Info }
const colors = { success: 'border-green-500 bg-green-50', error: 'border-red-500 bg-red-50', warning: 'border-yellow-500 bg-yellow-50', info: 'border-blue-500 bg-blue-50' }

const Ctx = createContext<{ toast: (t: Omit<Toast, 'id'>) => void }>({ toast: () => {} })
export const useToast = () => useContext(Ctx)

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = icons[t.type]
  useEffect(() => { const timer = setTimeout(onDismiss, 5000); return () => clearTimeout(timer) }, [])
  return (
    <div className={\`flex items-start gap-3 p-4 rounded-lg border-l-4 shadow-lg bg-background \${colors[t.type]}\`}>
      <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">{t.title}</p>
        {t.message && <p className="text-xs text-muted-foreground mt-0.5">{t.message}</p>}
      </div>
      <button onClick={onDismiss}><X className="h-4 w-4 text-muted-foreground" /></button>
    </div>
  )
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    setToasts(prev => [...prev, { ...t, id: Math.random().toString(36).slice(2) }])
  }, [])
  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
        {toasts.slice(-3).map(t => <ToastItem key={t.id} toast={t} onDismiss={() => setToasts(prev => prev.filter(x => x.id !== t.id))} />)}
      </div>
    </Ctx.Provider>
  )
}`,
  },
  {
    name: 'ErrorBoundary',
    category: 'feedback',
    description: 'React error boundary class component with fallback UI, retry button, dev-mode error details, and a useErrorHandler hook for functional components.',
    tags: ['error', 'boundary', 'catch', 'fallback', 'crash', 'recovery'],
    code: `'use client'
import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="min-h-[200px] flex flex-col items-center justify-center p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <span className="text-destructive text-2xl">!</span>
          </div>
          <h2 className="text-lg font-semibold mb-1">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mb-4">An unexpected error occurred.</p>
          <button onClick={() => this.setState({ hasError: false, error: null })}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">Try Again</button>
        </div>
      )
    }
    return this.props.children
  }
}`,
  },
  {
    name: 'LoadingSkeleton',
    category: 'feedback',
    description: 'Composable skeleton loading patterns for cards, lists, tables, and profiles. Uses pulse animation on neutral backgrounds.',
    tags: ['skeleton', 'loading', 'placeholder', 'shimmer', 'spinner', 'progress'],
    code: `import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('bg-muted animate-pulse rounded-md', className)} {...props} />
}

export function CardSkeleton() {
  return (
    <div className="rounded-xl border p-6 space-y-4">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  )
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-4 px-4 py-2">
        {Array.from({ length: cols }).map((_, i) => <Skeleton key={i} className="h-4 flex-1" />)}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-t">
          {Array.from({ length: cols }).map((_, j) => <Skeleton key={j} className="h-4 flex-1" />)}
        </div>
      ))}
    </div>
  )
}

export { Skeleton }`,
  },
  // ─── AUTH ───────────────────────────────────────────────────
  {
    name: 'LoginPage',
    category: 'auth',
    description: 'Full-page login form with centered card layout, gradient background, email/password fields, loading state, error alerts, and back link.',
    tags: ['login', 'auth', 'signin', 'authentication', 'credentials', 'password'],
    code: `'use client'
import { useState } from 'react'
import { Loader2, LogIn } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Login failed')
      window.location.href = '/dashboard'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-background rounded-xl border shadow-xl">
        <div className="p-6 text-center border-b">
          <div className="mx-auto w-12 h-12 bg-primary rounded-full flex items-center justify-center mb-3">
            <LogIn className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">Sign In</h1>
          <p className="text-sm text-muted-foreground mt-1">Enter your credentials to continue</p>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>}
          <div>
            <label className="text-sm font-medium">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required disabled={loading}
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" placeholder="you@example.com" />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required disabled={loading}
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm" placeholder="Enter password" />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-50">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}`,
  },
  // ─── DASHBOARD ──────────────────────────────────────────────
  {
    name: 'DashboardGrid',
    category: 'dashboard',
    description: 'Dashboard page layout with stats grid, filter tabs, and main content area. Combines StatsCard, FilterTabs, and DataTable patterns.',
    tags: ['dashboard', 'admin', 'overview', 'grid', 'layout', 'home', 'main'],
    code: `'use client'
import { useState } from 'react'
import { Users, FileText, DollarSign, TrendingUp } from 'lucide-react'

const stats = [
  { title: 'Total Users', value: '2,543', icon: Users, trend: { value: 12, label: 'vs last month' } },
  { title: 'Active Projects', value: '48', icon: FileText, trend: { value: -3, label: 'vs last month' } },
  { title: 'Revenue', value: '$12,430', icon: DollarSign, trend: { value: 8, label: 'vs last month' } },
  { title: 'Growth', value: '23%', icon: TrendingUp },
]
const tabs = [{ id: 'all', label: 'All' }, { id: 'active', label: 'Active' }, { id: 'archived', label: 'Archived' }]

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState('all')
  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of your application</p>
      </div>
      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.title} className="rounded-xl border p-5 bg-card">
            <div className="flex justify-between">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{s.title}</p>
                <p className="text-2xl font-bold mt-1">{s.value}</p>
              </div>
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <s.icon className="h-5 w-5 text-primary" />
              </div>
            </div>
          </div>
        ))}
      </div>
      {/* Tabs + Content */}
      <div className="flex gap-2 border-b pb-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={\`px-4 py-2 text-sm font-medium border-b-2 -mb-px \${t.id === activeTab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}\`}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border">
        {/* Data table or content goes here */}
        <div className="p-8 text-center text-muted-foreground">Content for "{activeTab}" tab</div>
      </div>
    </div>
  )
}`,
  },
  // ─── SETTINGS ───────────────────────────────────────────────
  {
    name: 'SettingsPanel',
    category: 'page',
    description: 'Settings page with grouped cards, toggle switches, text inputs, expandable sections, and dividers. Mobile-friendly touch targets.',
    tags: ['settings', 'preferences', 'config', 'toggle', 'switch', 'profile', 'account'],
    code: `'use client'
import { useState, ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

function SettingsCard({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl bg-card border overflow-hidden', className)}>{children}</div>
}

function SettingsRow({ icon, label, value, onClick }: { icon?: ReactNode; label: string; value?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full px-4 py-3 flex items-center gap-3 hover:bg-muted/50 transition-colors text-left">
      {icon && <div className="w-5 h-5 text-muted-foreground">{icon}</div>}
      <span className="flex-1 text-sm">{label}</span>
      {value && <span className="text-sm text-muted-foreground">{value}</span>}
      <ChevronRight className="w-4 h-4 text-muted-foreground" />
    </button>
  )
}

function SettingsToggle({ label, subtitle, checked, onChange }: { label: string; subtitle?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="px-4 py-3 flex items-center gap-3">
      <div className="flex-1"><span className="text-sm">{label}</span>
        {subtitle && <span className="block text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      <button onClick={() => onChange(!checked)}
        className={cn('w-11 h-6 rounded-full p-0.5 transition-colors', checked ? 'bg-primary' : 'bg-muted-foreground/20')}>
        <div className={cn('w-5 h-5 rounded-full bg-white shadow transition-transform', checked && 'translate-x-5')} />
      </button>
    </div>
  )
}

function SettingsExpandable({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <SettingsCard>
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50">
        <span className="text-sm font-semibold">{title}</span>
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>
      {open && <div className="border-t">{children}</div>}
    </SettingsCard>
  )
}

export { SettingsCard, SettingsRow, SettingsToggle, SettingsExpandable }`,
  },
  {
    name: 'FileUpload',
    category: 'form',
    description: 'Drag-and-drop file upload zone with click-to-browse, file type filtering, size limits, preview, and progress indicator.',
    tags: ['upload', 'file', 'drag', 'drop', 'image', 'attachment', 'import'],
    code: `'use client'
import { useState, useRef, useCallback } from 'react'
import { Upload, X, File as FileIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FileUploadProps {
  accept?: string
  maxSizeMB?: number
  onUpload: (file: File) => Promise<void>
  className?: string
}

export function FileUpload({ accept = '*', maxSizeMB = 10, onUpload, className }: FileUploadProps) {
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (f: File) => {
    if (f.size > maxSizeMB * 1024 * 1024) { setError(\`File must be under \${maxSizeMB}MB\`); return }
    setFile(f); setError(''); setUploading(true)
    try { await onUpload(f) } catch { setError('Upload failed') } finally { setUploading(false) }
  }, [maxSizeMB, onUpload])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0])
  }, [handleFile])

  return (
    <div className={cn('relative', className)}>
      <div onDragOver={e => { e.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={cn('border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/20 hover:border-primary/50')}>
        <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        {file ? (
          <div className="flex items-center gap-3 justify-center">
            <FileIcon className="h-8 w-8 text-primary" />
            <div className="text-left">
              <p className="font-medium text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
            </div>
            <button onClick={e => { e.stopPropagation(); setFile(null) }}><X className="h-4 w-4" /></button>
          </div>
        ) : (
          <>
            <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm font-medium">Drop file here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">Max {maxSizeMB}MB</p>
          </>
        )}
        {uploading && <div className="absolute inset-0 bg-background/50 flex items-center justify-center rounded-xl">
          <div className="h-8 w-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>}
      </div>
      {error && <p className="text-sm text-destructive mt-2">{error}</p>}
    </div>
  )
}`,
  },
  {
    name: 'NotFoundPage',
    category: 'page',
    description: '404 Not Found page with illustration, message, and navigation buttons to go home or go back.',
    tags: ['404', 'not-found', 'error', 'page', 'missing', 'lost'],
    code: `export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
      <div className="text-8xl font-bold text-muted-foreground/20 mb-4">404</div>
      <h1 className="text-2xl font-bold mb-2">Page Not Found</h1>
      <p className="text-muted-foreground mb-8 max-w-md">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <div className="flex gap-3">
        <a href="/" className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
          Go Home
        </a>
        <button onClick={() => window.history.back()}
          className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-muted">
          Go Back
        </button>
      </div>
    </div>
  )
}`,
  },
  {
    name: 'Footer',
    category: 'layout',
    description: 'Site footer with multi-column grid layout, company info, navigation links, social icons, and copyright bar.',
    tags: ['footer', 'layout', 'navigation', 'links', 'social', 'copyright', 'bottom'],
    code: `import { Facebook, Twitter, Github } from 'lucide-react'

const links = {
  product: [{ label: 'Features', href: '/features' }, { label: 'Pricing', href: '/pricing' }, { label: 'Docs', href: '/docs' }],
  company: [{ label: 'About', href: '/about' }, { label: 'Blog', href: '/blog' }, { label: 'Contact', href: '/contact' }],
  legal: [{ label: 'Privacy', href: '/privacy' }, { label: 'Terms', href: '/terms' }],
}

export function Footer() {
  return (
    <footer className="border-t bg-muted/30 mt-auto">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <h3 className="font-bold text-lg mb-3">AppName</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">Building great software for modern teams.</p>
            <div className="flex gap-3 mt-4">
              {[Facebook, Twitter, Github].map((Icon, i) => (
                <a key={i} href="#" className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <Icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          </div>
          {Object.entries(links).map(([section, items]) => (
            <div key={section}>
              <h4 className="font-semibold text-sm uppercase tracking-wider mb-3">{section}</h4>
              <ul className="space-y-2">
                {items.map(item => (
                  <li key={item.href}><a href={item.href} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{item.label}</a></li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="border-t mt-8 pt-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} AppName. All rights reserved.
        </div>
      </div>
    </footer>
  )
}`,
  },
  {
    name: 'UpdateToast',
    category: 'feedback',
    description: 'Fixed-position update notification banner with refresh action and dismiss button. Auto-dismisses after timeout.',
    tags: ['update', 'toast', 'banner', 'refresh', 'pwa', 'notification', 'version'],
    code: `'use client'
import { useState, useEffect } from 'react'
import { RefreshCw, X } from 'lucide-react'

export function UpdateToast({ show, onRefresh }: { show: boolean; onRefresh: () => void }) {
  const [visible, setVisible] = useState(show)
  useEffect(() => { setVisible(show) }, [show])
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => setVisible(false), 30000)
    return () => clearTimeout(t)
  }, [visible])

  if (!visible) return null
  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50">
      <div className="flex items-center gap-3 bg-primary text-primary-foreground px-4 py-3 rounded-xl shadow-lg">
        <RefreshCw className="h-4 w-4" />
        <span className="text-sm font-medium">Update available</span>
        <button onClick={onRefresh} className="bg-white text-primary text-sm font-semibold px-3 py-1 rounded-lg">Refresh</button>
        <button onClick={() => setVisible(false)}><X className="h-4 w-4 opacity-70" /></button>
      </div>
    </div>
  )
}`,
  },
]

export function searchReferences(query: string, limit = 3): ComponentReference[] {
  const lower = query.toLowerCase()
  const scored = REFERENCE_LIBRARY.map(ref => {
    let score = 0
    if (ref.name.toLowerCase().includes(lower)) score += 10
    if (ref.description.toLowerCase().includes(lower)) score += 5
    if (ref.category.toLowerCase().includes(lower)) score += 8
    for (const tag of ref.tags) {
      if (tag.toLowerCase().includes(lower)) score += 3
      if (lower.includes(tag.toLowerCase())) score += 3
    }
    // Word-level matching
    const words = lower.split(/\s+/)
    for (const word of words) {
      if (word.length < 3) continue
      if (ref.tags.some(t => t.toLowerCase().includes(word))) score += 2
      if (ref.description.toLowerCase().includes(word)) score += 1
    }
    return { ref, score }
  })
  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.ref)
}
