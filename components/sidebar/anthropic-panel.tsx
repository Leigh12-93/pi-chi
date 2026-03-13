'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  CheckCircle2, ChevronDown, Trash2, Loader2, Plug, Key,
  ExternalLink, AlertCircle, Sparkles,
  Brain, FileText, Search, Terminal, Globe, Rocket,
  Database, GitBranch, Wrench, Save, Shield,
  FolderPlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MODEL_OPTIONS, MODEL_PRICING, TOOL_LABELS } from '@/lib/chat/constants'
import { toast } from 'sonner'
import type { LucideIcon } from 'lucide-react'

interface AnthropicPanelProps {
  onOpenSettings?: () => void
  onOpenMcpManager?: () => void
  sessionCost?: { cost: number; inputTokens: number; outputTokens: number }
  fileContents?: Record<string, string>
}

/** Detect Anthropic API key from project env files */
function detectAnthropicKeyFromEnv(fileContents: Record<string, string>): string | null {
  const envFiles = ['.env.local', '.env', '.env.development', '.env.production']
  for (const envFile of envFiles) {
    const content = fileContents[envFile]
    if (!content) continue
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue
      const eqIdx = trimmed.indexOf('=')
      const k = trimmed.slice(0, eqIdx).trim()
      const v = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '')
      if (k === 'ANTHROPIC_API_KEY' && v.startsWith('sk-ant-')) return v
    }
  }
  return null
}

interface ToolCategory {
  label: string
  icon: LucideIcon
  color: string
  tools: string[]
}

const TOOL_CATEGORIES: ToolCategory[] = [
  {
    label: 'Planning',
    icon: Brain,
    color: 'text-purple-400',
    tools: ['think', 'suggest_improvement', 'web_search', 'present_plan', 'ask_user', 'checkpoint'],
  },
  {
    label: 'File Operations',
    icon: FileText,
    color: 'text-green-400',
    tools: ['write_file', 'read_file', 'edit_file', 'delete_file', 'list_files', 'search_files', 'grep_files', 'rename_file', 'get_all_files'],
  },
  {
    label: 'Project',
    icon: FolderPlus,
    color: 'text-indigo-400',
    tools: ['create_project', 'save_project', 'scaffold_component', 'add_dependency', 'generate_env_file', 'request_env_vars'],
  },
  {
    label: 'GitHub',
    icon: GitBranch,
    color: 'text-slate-400',
    tools: ['github_create_repo', 'github_push_update', 'github_push_files', 'github_read_file', 'github_list_repo_files', 'github_modify_external_file', 'github_search_code', 'github_pull_latest'],
  },
  {
    label: 'Deploy',
    icon: Rocket,
    color: 'text-blue-400',
    tools: ['deploy_to_vercel', 'pi_deployment_status', 'pi_check_build', 'pi_read_deploy_log', 'set_custom_domain'],
  },
  {
    label: 'Database',
    icon: Database,
    color: 'text-emerald-400',
    tools: ['db_query', 'db_mutate', 'db_introspect'],
  },
  {
    label: 'Self-Modification',
    icon: Wrench,
    color: 'text-red-400',
    tools: ['pi_read_own_source', 'pi_modify_own_source', 'pi_redeploy', 'pi_revert_commit', 'pi_create_branch', 'pi_create_pr', 'pi_merge_pr', 'pi_list_branches', 'pi_delete_branch'],
  },
  {
    label: 'Terminal',
    icon: Terminal,
    color: 'text-green-400',
    tools: ['run_command', 'install_package', 'run_dev_server', 'run_build', 'run_tests', 'check_types', 'verify_build', 'start_sandbox', 'stop_sandbox', 'sandbox_status'],
  },
  {
    label: 'Search & Inspect',
    icon: Search,
    color: 'text-purple-400',
    tools: ['search_references', 'get_reference_code', 'check_coherence', 'capture_preview', 'diagnose_preview', 'validate_file', 'check_dependency_health'],
  },
  {
    label: 'Generation',
    icon: Sparkles,
    color: 'text-cyan-400',
    tools: ['generate_tests', 'add_image'],
  },
  {
    label: 'MCP',
    icon: Plug,
    color: 'text-purple-400',
    tools: ['mcp_list_servers', 'mcp_connect_server', 'mcp_call_tool'],
  },
  {
    label: 'Google',
    icon: Globe,
    color: 'text-blue-400',
    tools: ['google_sheets_read', 'google_sheets_write', 'google_sheets_create', 'google_calendar_list_events', 'google_calendar_create_event', 'google_gmail_send', 'google_gmail_list', 'google_gmail_read', 'google_drive_list', 'google_drive_read'],
  },
  {
    label: 'Memory & Tasks',
    icon: Save,
    color: 'text-green-400',
    tools: ['save_memory', 'load_memory', 'save_preference', 'load_preferences', 'manage_tasks', 'check_task_status', 'cancel_task', 'load_chat_history'],
  },
  {
    label: 'Model',
    icon: Sparkles,
    color: 'text-purple-400',
    tools: ['select_model'],
  },
  {
    label: 'Audit',
    icon: Shield,
    color: 'text-amber-400',
    tools: ['audit_codebase', 'create_audit_plan', 'execute_audit_task'],
  },
]

function Section({ title, defaultOpen = true, children, badge }: {
  title: string
  defaultOpen?: boolean
  children: React.ReactNode
  badge?: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-pi-border last:border-b-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-wider text-pi-text-dim font-medium hover:text-pi-text transition-colors"
      >
        <ChevronDown className={cn('w-3 h-3 transition-transform', !open && '-rotate-90')} />
        <span className="flex-1 text-left">{title}</span>
        {badge}
      </button>
      {open && <div className="px-3 pb-3">{children}</div>}
    </div>
  )
}

export function AnthropicPanel({ onOpenSettings: _onOpenSettings, onOpenMcpManager, sessionCost, fileContents }: AnthropicPanelProps) {
  // Connection state
  const [hasApiKey, setHasApiKey] = useState(false)
  const [validatedAt, setValidatedAt] = useState<string | null>(null)
  const [preferredModel, setPreferredModel] = useState('claude-sonnet-4-20250514')
  const [loading, setLoading] = useState(true)

  // API key input
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [showInput, setShowInput] = useState(false)

  // MCP servers
  const [mcpServers, setMcpServers] = useState<{ id: string; name: string; connected: boolean; error?: string }[]>([])
  const [mcpLoading, setMcpLoading] = useState(false)

  // Tools section
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null)

  // Auto-detect API key from project env files
  const detectedKey = useMemo(() => fileContents ? detectAnthropicKeyFromEnv(fileContents) : null, [fileContents])
  const autoSaved = useRef(false)

  // Fetch settings on mount
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings')
      if (!res.ok) return
      const data = await res.json()
      setHasApiKey(!!data.hasApiKey)
      setValidatedAt(data.apiKeyValidatedAt || null)
      setPreferredModel(data.preferredModel || 'claude-sonnet-4-20250514')
    } catch (e) { console.warn('[pi:anthropic] Failed to load Anthropic settings:', e) } finally {
      setLoading(false)
    }
  }, [])

  // Fetch MCP servers
  const fetchMcp = useCallback(async () => {
    setMcpLoading(true)
    try {
      const res = await fetch('/api/mcp')
      if (!res.ok) return
      const data = await res.json()
      setMcpServers(data.servers || [])
    } catch (e) { console.warn('[pi:mcp] Failed to load MCP servers:', e) } finally {
      setMcpLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
    fetchMcp()
  }, [fetchSettings, fetchMcp])

  // Auto-save detected API key from env files (fire-and-forget)
  useEffect(() => {
    if (!detectedKey || hasApiKey || autoSaved.current || loading) return
    autoSaved.current = true
    fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: detectedKey, skipValidation: true }),
    }).then(() => {
      setHasApiKey(true)
      setValidatedAt(new Date().toISOString())
    }).catch(() => {})
  }, [detectedKey, hasApiKey, loading])

  // Save API key
  const handleSaveKey = async () => {
    const trimmed = apiKeyInput.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmed }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to save API key')
        return
      }
      setHasApiKey(true)
      setValidatedAt(new Date().toISOString())
      setApiKeyInput('')
      setShowInput(false)
      toast.success('API key saved')
    } catch {
      toast.error('Failed to save API key')
    } finally {
      setSaving(false)
    }
  }

  // Remove API key
  const handleRemoveKey = async () => {
    setRemoving(true)
    try {
      await fetch('/api/settings?target=apiKey', { method: 'DELETE' })
      setHasApiKey(false)
      setValidatedAt(null)
      toast.success('API key removed')
    } catch {
      toast.error('Failed to remove API key')
    } finally {
      setRemoving(false)
    }
  }

  // Save model preference
  const handleModelChange = async (modelId: string) => {
    setPreferredModel(modelId)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferredModel: modelId }),
      })
    } catch {
      toast.error('Failed to save model preference')
    }
  }

  // Format validated-at timestamp
  const formatValidatedAt = (iso: string) => {
    try {
      const d = new Date(iso)
      const now = Date.now()
      const diff = now - d.getTime()
      if (diff < 60000) return 'just now'
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
      return d.toLocaleDateString()
    } catch { return '' }
  }

  const totalTools = TOOL_CATEGORIES.reduce((sum, cat) => sum + cat.tools.length, 0)

  if (loading) {
    return (
      <div className="p-3">
        <div className="flex items-center gap-2 py-6 justify-center">
          <Loader2 className="w-4 h-4 animate-spin text-pi-accent" />
          <span className="text-xs text-pi-text-dim">Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      <Section title="Connection" defaultOpen={true}>
        {hasApiKey ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle2 className="w-3.5 h-3.5 text-green-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-green-400 font-medium">Connected</p>
                {validatedAt && (
                  <p className="text-[9px] text-pi-text-dim">Validated {formatValidatedAt(validatedAt)}</p>
                )}
              </div>
            </div>
            {showInput ? (
              <div className="space-y-1.5">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveKey() }}
                  placeholder="sk-ant-..."
                  className="w-full px-2.5 py-1.5 text-xs bg-pi-bg border border-pi-border rounded-lg outline-none focus:border-pi-accent/50 font-mono"
                  autoFocus
                />
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleSaveKey}
                    disabled={!apiKeyInput.trim() || saving}
                    className="flex-1 px-2 py-1.5 text-[11px] font-medium bg-pi-accent text-white rounded-lg hover:bg-pi-accent-hover disabled:opacity-40 transition-colors"
                  >
                    {saving ? 'Validating...' : 'Update Key'}
                  </button>
                  <button
                    onClick={() => { setShowInput(false); setApiKeyInput('') }}
                    className="px-2 py-1.5 text-[11px] text-pi-text-dim hover:text-pi-text rounded-lg hover:bg-pi-surface transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setShowInput(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 text-[11px] text-pi-text-dim hover:text-pi-text border border-pi-border rounded-lg hover:bg-pi-surface transition-colors"
                >
                  <Key className="w-3 h-3" />
                  Update
                </button>
                <button
                  onClick={handleRemoveKey}
                  disabled={removing}
                  className="flex items-center justify-center gap-1 px-2 py-1.5 text-[11px] text-red-400 hover:text-red-300 border border-pi-border rounded-lg hover:bg-red-500/10 hover:border-red-500/30 transition-colors"
                >
                  {removing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  Remove
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 p-2 bg-pi-surface border border-pi-border rounded-lg">
              <Key className="w-3.5 h-3.5 text-pi-text-dim shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-pi-text">No API key configured</p>
                <p className="text-[10px] text-pi-text-dim mt-0.5">Add your Anthropic API key to get started.</p>
              </div>
            </div>
            <input
              type="password"
              value={apiKeyInput}
              onChange={e => setApiKeyInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSaveKey() }}
              placeholder="sk-ant-..."
              className="w-full px-2.5 py-1.5 text-xs bg-pi-bg border border-pi-border rounded-lg outline-none focus:border-pi-accent/50 font-mono"
            />
            <button
              onClick={handleSaveKey}
              disabled={!apiKeyInput.trim() || saving}
              className="w-full px-2 py-1.5 text-[11px] font-medium bg-pi-accent text-white rounded-lg hover:bg-pi-accent-hover disabled:opacity-40 transition-colors"
            >
              {saving ? 'Validating...' : 'Save Key'}
            </button>
            <a
              href="https://console.anthropic.com/settings/keys"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-[10px] text-pi-accent hover:underline"
            >
              Get an API key <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </div>
        )}
      </Section>

      <Section title="Model" defaultOpen={true} badge={
        <span className="text-[9px] text-pi-text-dim/60 normal-case tracking-normal font-normal">
          {MODEL_OPTIONS.find(m => m.id === preferredModel)?.label || 'Sonnet 4'}
        </span>
      }>
        <div className="space-y-1">
          {MODEL_OPTIONS.map(model => {
            const pricing = MODEL_PRICING[model.id]
            const isSelected = preferredModel === model.id
            return (
              <button
                key={model.id}
                onClick={() => handleModelChange(model.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors',
                  isSelected
                    ? 'bg-pi-accent/10 border border-pi-accent/25 text-pi-text'
                    : 'hover:bg-pi-surface border border-transparent text-pi-text-dim hover:text-pi-text',
                )}
              >
                <div className={cn(
                  'w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0',
                  isSelected ? 'border-pi-accent' : 'border-pi-text-dim/30',
                )}>
                  {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-pi-accent" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-medium">{model.label}</span>
                    <span className="text-[9px] text-pi-text-dim">{model.description}</span>
                  </div>
                  {pricing && (
                    <p className="text-[9px] text-pi-text-dim/60">
                      ${pricing.input}/M in · ${pricing.output}/M out
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </Section>

      <Section title="Session Usage" defaultOpen={true} badge={
        sessionCost && sessionCost.cost > 0 ? (
          <span className="text-[9px] text-pi-accent normal-case tracking-normal font-normal">
            ${sessionCost.cost < 0.01 ? sessionCost.cost.toFixed(4) : sessionCost.cost.toFixed(2)}
          </span>
        ) : undefined
      }>
        {sessionCost && (sessionCost.inputTokens > 0 || sessionCost.outputTokens > 0) ? (
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <div className="p-2 bg-pi-surface rounded-lg">
                <p className="text-[9px] text-pi-text-dim uppercase tracking-wider">Input</p>
                <p className="text-xs font-medium text-pi-text tabular-nums">
                  {sessionCost.inputTokens > 1000
                    ? `${(sessionCost.inputTokens / 1000).toFixed(1)}K`
                    : sessionCost.inputTokens}
                </p>
              </div>
              <div className="p-2 bg-pi-surface rounded-lg">
                <p className="text-[9px] text-pi-text-dim uppercase tracking-wider">Output</p>
                <p className="text-xs font-medium text-pi-text tabular-nums">
                  {sessionCost.outputTokens > 1000
                    ? `${(sessionCost.outputTokens / 1000).toFixed(1)}K`
                    : sessionCost.outputTokens}
                </p>
              </div>
            </div>
            {sessionCost.cost > 0 && (
              <div className="p-2 bg-pi-surface rounded-lg flex items-center justify-between">
                <p className="text-[9px] text-pi-text-dim uppercase tracking-wider">Cost</p>
                <p className="text-xs font-medium text-pi-accent tabular-nums">
                  ${sessionCost.cost < 0.01 ? sessionCost.cost.toFixed(4) : sessionCost.cost.toFixed(2)}
                </p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-[10px] text-pi-text-dim text-center py-2">No usage yet this session</p>
        )}
      </Section>

      <Section title="Tools" defaultOpen={false} badge={
        <span className="text-[9px] px-1.5 py-0.5 bg-pi-surface rounded-full text-pi-text-dim normal-case tracking-normal font-normal">
          {totalTools}
        </span>
      }>
        <div className="space-y-0.5">
          {TOOL_CATEGORIES.map(cat => {
            const isExpanded = expandedCategory === cat.label
            return (
              <div key={cat.label}>
                <button
                  onClick={() => setExpandedCategory(isExpanded ? null : cat.label)}
                  className="w-full flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-pi-surface transition-colors text-left"
                >
                  <cat.icon className={cn('w-3 h-3 shrink-0', cat.color)} />
                  <span className="flex-1 text-[11px] text-pi-text">{cat.label}</span>
                  <span className="text-[9px] px-1.5 py-0.5 bg-pi-surface rounded-full text-pi-text-dim">{cat.tools.length}</span>
                  <ChevronDown className={cn('w-2.5 h-2.5 text-pi-text-dim transition-transform', !isExpanded && '-rotate-90')} />
                </button>
                {isExpanded && (
                  <div className="ml-5 mt-0.5 mb-1 space-y-0.5">
                    {cat.tools.map(tool => {
                      const def = TOOL_LABELS[tool]
                      return (
                        <div key={tool} className="flex items-center gap-1.5 px-1.5 py-0.5 text-[10px] text-pi-text-dim">
                          {def ? <def.Icon className="w-2.5 h-2.5 shrink-0" /> : <Wrench className="w-2.5 h-2.5 shrink-0" />}
                          <span className="truncate">{def?.label || tool}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Section>

      <Section title="MCP Servers" defaultOpen={true} badge={
        mcpServers.length > 0 ? (
          <span className="text-[9px] px-1.5 py-0.5 bg-pi-surface rounded-full text-pi-text-dim normal-case tracking-normal font-normal">
            {mcpServers.length}
          </span>
        ) : undefined
      }>
        {mcpLoading ? (
          <div className="flex items-center gap-2 py-2 justify-center">
            <Loader2 className="w-3 h-3 animate-spin text-pi-text-dim" />
            <span className="text-[10px] text-pi-text-dim">Loading servers...</span>
          </div>
        ) : mcpServers.length > 0 ? (
          <div className="space-y-1">
            {mcpServers.map(server => (
              <div
                key={server.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-pi-surface"
              >
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  server.connected ? 'bg-green-400' : 'bg-red-400',
                )} />
                <span className="flex-1 text-[11px] text-pi-text truncate">{server.name}</span>
                {server.error && (
                  <span title={server.error}><AlertCircle className="w-3 h-3 text-red-400 shrink-0" /></span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-pi-text-dim text-center py-1">No servers connected</p>
        )}
        <button
          onClick={onOpenMcpManager}
          className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 mt-2 text-[11px] text-pi-text-dim hover:text-pi-text border border-pi-border rounded-lg hover:bg-pi-surface transition-colors"
        >
          <Plug className="w-3 h-3" />
          Manage Servers
        </button>
      </Section>
    </div>
  )
}
