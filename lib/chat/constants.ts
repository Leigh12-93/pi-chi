import {
  Brain, Lightbulb, FileText, Eye, Pencil, Trash2,
  FolderPlus, Search, Terminal, Globe, Rocket,
  CheckCircle, Sparkles, ArrowUp, Database, Wrench,
  RefreshCw, BookOpen, Save, Plug, ImageIcon, Package,
  GitBranch, Key, ListChecks, StopCircle,
  ClipboardList, HelpCircle, Flag, Shield,
  Calendar, CalendarPlus, Mail, Inbox, MailOpen, Table2, FilePlus,
  type LucideIcon,
} from 'lucide-react'

export const TOOL_LABELS: Record<string, { label: string; Icon: LucideIcon; color: string }> = {
  think: { label: 'Planning', Icon: Brain, color: 'purple' },
  suggest_improvement: { label: 'Suggestion', Icon: Lightbulb, color: 'yellow' },
  write_file: { label: 'Writing file', Icon: FileText, color: 'green' },
  read_file: { label: 'Reading file', Icon: Eye, color: 'blue' },
  edit_file: { label: 'Editing file', Icon: Pencil, color: 'yellow' },
  delete_file: { label: 'Deleting file', Icon: Trash2, color: 'red' },
  list_files: { label: 'Listing files', Icon: FolderPlus, color: 'blue' },
  search_files: { label: 'Searching files', Icon: Search, color: 'purple' },
  create_project: { label: 'Scaffolding project', Icon: Sparkles, color: 'indigo' },
  github_create_repo: { label: 'Creating GitHub repo', Icon: GitBranch, color: 'green' },
  github_push_update: { label: 'Pushing to GitHub', Icon: ArrowUp, color: 'blue' },
  github_push_files: { label: 'Pushing files', Icon: ArrowUp, color: 'blue' },
  deploy_to_vercel: { label: 'Deploying to Vercel', Icon: Rocket, color: 'blue' },
  get_all_files: { label: 'File manifest', Icon: Eye, color: 'blue' },
  rename_file: { label: 'Renaming file', Icon: Pencil, color: 'yellow' },
  db_query: { label: 'Querying database', Icon: Database, color: 'green' },
  db_mutate: { label: 'Modifying database', Icon: Database, color: 'yellow' },
  save_project: { label: 'Saving project', Icon: Save, color: 'green' },
  forge_read_own_source: { label: 'Reading own source', Icon: BookOpen, color: 'purple' },
  forge_modify_own_source: { label: 'Self-modifying', Icon: Wrench, color: 'red' },
  forge_redeploy: { label: 'Redeploying self', Icon: RefreshCw, color: 'orange' },
  github_read_file: { label: 'Reading repo file', Icon: Eye, color: 'blue' },
  github_list_repo_files: { label: 'Listing repo files', Icon: FolderPlus, color: 'blue' },
  github_modify_external_file: { label: 'Modifying repo file', Icon: Pencil, color: 'yellow' },
  github_search_code: { label: 'Searching GitHub', Icon: Search, color: 'purple' },
  load_chat_history: { label: 'Loading chat history', Icon: Database, color: 'blue' },
  github_pull_latest: { label: 'Pulling from GitHub', Icon: RefreshCw, color: 'green' },
  mcp_list_servers: { label: 'Listing MCP servers', Icon: Plug, color: 'purple' },
  mcp_connect_server: { label: 'Connecting MCP server', Icon: Plug, color: 'green' },
  mcp_call_tool: { label: 'Calling MCP tool', Icon: Plug, color: 'blue' },
  forge_check_npm_package: { label: 'Checking npm package', Icon: Search, color: 'blue' },
  forge_revert_commit: { label: 'Reverting commit', Icon: RefreshCw, color: 'red' },
  forge_create_branch: { label: 'Creating branch', Icon: GitBranch, color: 'green' },
  forge_create_pr: { label: 'Creating pull request', Icon: GitBranch, color: 'purple' },
  forge_merge_pr: { label: 'Merging pull request', Icon: GitBranch, color: 'green' },
  forge_deployment_status: { label: 'Checking deployment', Icon: Rocket, color: 'blue' },
  forge_check_build: { label: 'Running preview build', Icon: Rocket, color: 'yellow' },
  forge_list_branches: { label: 'Listing branches', Icon: GitBranch, color: 'blue' },
  forge_delete_branch: { label: 'Deleting branch', Icon: GitBranch, color: 'red' },
  forge_read_deploy_log: { label: 'Reading build log', Icon: Terminal, color: 'yellow' },
  db_introspect: { label: 'Inspecting table schema', Icon: Database, color: 'purple' },
  scaffold_component: { label: 'Scaffolding component', Icon: Sparkles, color: 'indigo' },
  generate_env_file: { label: 'Generating .env.example', Icon: FileText, color: 'green' },
  request_env_vars: { label: 'Environment setup', Icon: Key, color: 'amber' },
  get_stored_env_vars: { label: 'Loading stored keys', Icon: Key, color: 'green' },
  connect_service: { label: 'Service connection', Icon: Plug, color: 'indigo' },
  start_sandbox: { label: 'Starting sandbox', Icon: Rocket, color: 'green' },
  stop_sandbox: { label: 'Stopping sandbox', Icon: Terminal, color: 'red' },
  sandbox_status: { label: 'Checking sandbox', Icon: Rocket, color: 'blue' },
  add_image: { label: 'Finding image', Icon: ImageIcon, color: 'cyan' },
  check_task_status: { label: 'Checking task', Icon: RefreshCw, color: 'blue' },
  manage_tasks: { label: 'Update tasks', Icon: ListChecks, color: 'blue' },
  cancel_task: { label: 'Cancel task', Icon: StopCircle, color: 'red' },
  grep_files: { label: 'Grepping files', Icon: BookOpen, color: 'purple' },
  add_dependency: { label: 'Adding package', Icon: Package, color: 'green' },
  validate_file: { label: 'Validating file', Icon: CheckCircle, color: 'green' },
  check_coherence: { label: 'Checking coherence', Icon: Search, color: 'purple' },
  capture_preview: { label: 'Capturing preview', Icon: Eye, color: 'cyan' },
  generate_tests: { label: 'Generating tests', Icon: FileText, color: 'indigo' },
  check_dependency_health: { label: 'Checking package health', Icon: Package, color: 'yellow' },
  search_references: { label: 'Searching references', Icon: BookOpen, color: 'purple' },
  get_reference_code: { label: 'Loading reference', Icon: BookOpen, color: 'blue' },
  save_preference: { label: 'Saving preference', Icon: Save, color: 'green' },
  load_preferences: { label: 'Loading preferences', Icon: Database, color: 'blue' },
  select_model: { label: 'Switching model', Icon: Sparkles, color: 'purple' },
  web_search: { label: 'Searching web', Icon: Globe, color: 'blue' },
  save_memory: { label: 'Saving to memory', Icon: Save, color: 'green' },
  load_memory: { label: 'Loading memory', Icon: Database, color: 'blue' },
  set_custom_domain: { label: 'Setting domain', Icon: Globe, color: 'blue' },
  run_command: { label: 'Running command', Icon: Terminal, color: 'green' },
  install_package: { label: 'Installing packages', Icon: Package, color: 'green' },
  run_dev_server: { label: 'Starting dev server', Icon: Rocket, color: 'green' },
  run_build: { label: 'Building project', Icon: Rocket, color: 'yellow' },
  run_tests: { label: 'Running tests', Icon: CheckCircle, color: 'blue' },
  check_types: { label: 'Type checking', Icon: CheckCircle, color: 'purple' },
  verify_build: { label: 'Verifying build', Icon: CheckCircle, color: 'green' },
  audit_codebase: { label: 'Scanning files', Icon: Search, color: 'amber' },
  create_audit_plan: { label: 'Analyzing codebase', Icon: Shield, color: 'amber' },
  execute_audit_task: { label: 'Fixing issue', Icon: Wrench, color: 'green' },
  // Gate tools (Claude Code patterns)
  present_plan: { label: 'Presenting plan', Icon: ClipboardList, color: 'purple' },
  ask_user: { label: 'Asking question', Icon: HelpCircle, color: 'blue' },
  checkpoint: { label: 'Checkpoint', Icon: Flag, color: 'green' },
  diagnose_preview: { label: 'Diagnosing preview', Icon: Search, color: 'amber' },
  // Google tools
  google_sheets_read: { label: 'Reading spreadsheet', Icon: Table2, color: 'green' },
  google_sheets_write: { label: 'Writing spreadsheet', Icon: Table2, color: 'green' },
  google_sheets_create: { label: 'Creating spreadsheet', Icon: FilePlus, color: 'green' },
  google_calendar_list_events: { label: 'Checking calendar', Icon: Calendar, color: 'blue' },
  google_calendar_create_event: { label: 'Creating event', Icon: CalendarPlus, color: 'blue' },
  google_gmail_send: { label: 'Sending email', Icon: Mail, color: 'red' },
  google_gmail_list: { label: 'Listing emails', Icon: Inbox, color: 'blue' },
  google_gmail_read: { label: 'Reading email', Icon: MailOpen, color: 'blue' },
  google_drive_list: { label: 'Browsing Drive', Icon: FolderPlus, color: 'amber' },
  google_drive_read: { label: 'Reading Drive file', Icon: FileText, color: 'amber' },
}

export const MODEL_OPTIONS = [
  { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4', description: 'Fast & capable' },
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', description: 'Fastest' },
  { id: 'claude-opus-4-6', label: 'Opus 4.6', description: 'Latest flagship' },
] as const

/** Per 1M token pricing (USD) for cost estimation */
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-20250514': { input: 3, output: 15 },
  'claude-opus-4-20250514': { input: 15, output: 75 },
  'claude-opus-4-6': { input: 15, output: 75 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4 },
}

/** Calculate cost in USD from token counts and model ID */
export function estimateCost(inputTokens: number, outputTokens: number, model: string): number {
  const pricing = MODEL_PRICING[model] || (console.warn(`[forge] Unknown model for pricing: ${model}`), MODEL_PRICING['claude-sonnet-4-20250514'])
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output
}

/** Format token count as human-readable string */
export function formatTokens(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
  return String(count)
}

/** Destructive tool patterns for approval gates */
export const DESTRUCTIVE_TOOLS = new Set([
  'delete_file',
  'db_mutate',
  'forge_modify_own_source',
  'forge_redeploy',
  'forge_revert_commit',
  'forge_merge_pr',
  'github_modify_external_file',
  'google_gmail_send',
])
export const DANGEROUS_COMMAND_PATTERNS = /\b(rm\s+-rf|rm\s+-r|drop\s+table|drop\s+database|delete\s+from|truncate|reset\s+--hard|--force|--no-verify)\b/i

export const QUICK_ACTIONS = [
  { label: 'Landing Page', query: 'Build a premium SaaS landing page. Design a bespoke design token system first — unique color palette, font pairing, spacing scale, shadows. Then build all sections with those tokens. Must look like a $10k agency build.', icon: Sparkles },
  { label: 'Dashboard', query: 'Build a professional admin dashboard. Design a bespoke dark-first design token system first — unique color palette, font pairing, spacing scale, shadows. Then build sidebar, stats, charts, tables. Must look like a real production app.', icon: FolderPlus },
  { label: 'Portfolio', query: 'Build a designer portfolio. Design a bespoke editorial design token system first — refined palette, elegant fonts, generous spacing. Then build hero, project grid, about, contact. Must look like a senior designer made it.', icon: Globe },
  { label: 'E-commerce', query: 'Build an e-commerce product page. Design a bespoke retail design token system first — premium palette, clean fonts, polished effects. Then build gallery, selectors, reviews, related products. Must look like a real store.', icon: FileText },
]

export const colorClasses: Record<string, string> = {
  green: 'text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-950/40',
  blue: 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/40',
  yellow: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40',
  red: 'text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/40',
  purple: 'text-purple-600 bg-purple-50 dark:text-purple-400 dark:bg-purple-950/40',
  indigo: 'text-indigo-600 bg-indigo-50 dark:text-indigo-400 dark:bg-indigo-950/40',
  orange: 'text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/40',
  gray: 'text-forge-text-dim bg-forge-surface',
  cyan: 'text-cyan-600 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-950/40',
  amber: 'text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40',
}

/** v0-style tool variant for card coloring */
export type ToolVariant = 'default' | 'success' | 'info' | 'warn' | 'destructive'

export const TOOL_VARIANTS: Record<string, ToolVariant> = {
  write_file: 'success', create_project: 'success', scaffold_component: 'success',
  save_project: 'success', add_dependency: 'success', install_package: 'success',
  verify_build: 'success', validate_file: 'success', generate_env_file: 'success',
  run_command: 'success', run_dev_server: 'success',
  edit_file: 'info', rename_file: 'info', github_push_update: 'info',
  github_push_files: 'info', github_pull_latest: 'info',
  delete_file: 'destructive', forge_modify_own_source: 'destructive',
  forge_revert_commit: 'destructive', forge_delete_branch: 'destructive',
  run_build: 'warn', forge_check_build: 'warn', db_mutate: 'warn',
  check_types: 'warn', request_env_vars: 'warn', connect_service: 'warn',
}

export const variantCardClasses: Record<ToolVariant, { border: string; bg: string }> = {
  default: { border: 'border-forge-border/50', bg: 'bg-forge-surface/20' },
  success: { border: 'border-emerald-500/20 dark:border-emerald-500/15', bg: 'bg-emerald-50/30 dark:bg-emerald-950/20' },
  info: { border: 'border-sky-500/20 dark:border-sky-500/15', bg: 'bg-sky-50/30 dark:bg-sky-950/20' },
  warn: { border: 'border-amber-500/20 dark:border-amber-500/15', bg: 'bg-amber-50/30 dark:bg-amber-950/20' },
  destructive: { border: 'border-red-500/20 dark:border-red-500/15', bg: 'bg-red-50/30 dark:bg-red-950/20' },
}

/** Past-tense labels for completed tool invocations (v0-style) */
export const TOOL_COMPLETE_LABELS: Record<string, string> = {
  write_file: 'Wrote', edit_file: 'Edited', read_file: 'Read',
  delete_file: 'Deleted', rename_file: 'Renamed', list_files: 'Listed',
  search_files: 'Searched', grep_files: 'Grepped', create_project: 'Scaffolded',
  add_dependency: 'Installed', install_package: 'Installed', save_project: 'Saved',
  run_command: 'Ran', run_build: 'Built', verify_build: 'Verified',
  run_tests: 'Tested', check_types: 'Checked types', scaffold_component: 'Scaffolded',
  github_push_update: 'Pushed', github_push_files: 'Pushed', github_pull_latest: 'Pulled',
  deploy_to_vercel: 'Deployed', db_query: 'Queried', db_mutate: 'Modified',
  db_introspect: 'Inspected', validate_file: 'Validated', check_coherence: 'Checked',
  get_all_files: 'Got manifest', web_search: 'Searched web', capture_preview: 'Captured',
  generate_tests: 'Generated tests', run_dev_server: 'Started server',
  connect_service: 'Connected service',
}
