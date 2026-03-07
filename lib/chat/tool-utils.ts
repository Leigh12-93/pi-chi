export type ToolInvocation = {
  toolName: string
  state: string
  args: Record<string, unknown>
  result?: Record<string, unknown>
}

export function getToolSummary(toolName: string, args: Record<string, unknown>, result: unknown): string {
  const data = (result && typeof result === 'object') ? result as Record<string, unknown> : null
  if (data?.error) return `Error: ${String(data.error).slice(0, 80)}`

  switch (toolName) {
    case 'think': return args.plan ? String(args.plan).slice(0, 100) + (String(args.plan).length > 100 ? '...' : '') : 'Planning...'
    case 'suggest_improvement': return args.issue ? `${args.priority}: ${String(args.issue).slice(0, 80)}` : 'Suggestion logged'
    case 'write_file': return args.path ? `${args.path}` : 'Writing...'
    case 'read_file': return args.path ? `${args.path}` : 'Reading...'
    case 'edit_file': return args.path ? `${args.path}` : 'Editing...'
    case 'delete_file': return args.path ? `${args.path}` : 'Deleting...'
    case 'create_project': return args.template ? `${args.template} template` : 'Scaffolding...'
    case 'github_create_repo': return args.repoName ? `${args.repoName}` : 'Creating...'
    case 'github_push_update': return data?.ok ? `${data.filesCount} files pushed (${(data as any).mode || 'full'})` : 'Pushing...'
    case 'github_push_files': return data?.ok ? `${data.filesCount} file(s) pushed` : `Pushing ${(args.paths as string[])?.length || ''} file(s)...`
    case 'deploy_to_vercel': return data?.url ? `Live at ${data.url}` : 'Deploying...'
    case 'set_custom_domain': return data?.ok ? `${args.domain} configured` : (data?.error ? `Failed: ${String(data.error).slice(0, 60)}` : `Setting ${args.domain}...`)
    case 'list_files': return data ? `${data.count || 0} files` : 'Listing...'
    case 'search_files': return data ? `${data.count || 0} matches` : 'Searching...'
    case 'grep_files': return data ? `${data.count || 0} matches for /${args.pattern}/` : `Grepping /${args.pattern}/...`
    case 'add_dependency': return data?.ok ? (data.skipped ? `${args.name} already installed` : `Added ${args.name}@${data.version}`) : `Adding ${args.name}...`
    case 'rename_file': return args.newPath ? `→ ${args.newPath}` : 'Renaming...'
    case 'get_all_files': return data ? `${(data as any).totalFiles || 0} files` : 'Reading manifest...'
    case 'db_query': return args.table ? `${args.table}${args.filters ? ` (${String(args.filters).slice(0, 40)})` : ''}` : 'Querying...'
    case 'db_mutate': return args.table ? `${args.operation} on ${args.table}` : 'Mutating...'
    case 'save_project': return data?.ok ? `${(data as any).savedFiles || 0} files saved` : 'Saving...'
    case 'forge_read_own_source': return args.path ? `forge/${args.path}` : 'Reading...'
    case 'forge_modify_own_source': return args.path ? `forge/${args.path}` : 'Modifying...'
    case 'forge_redeploy': return data?.ok ? `Deploying: ${(data as any).reason || ''}`.slice(0, 60) : 'Redeploying...'
    case 'github_read_file': return args.path ? `${args.owner}/${args.repo}/${args.path}` : 'Reading...'
    case 'github_list_repo_files': return args.repo ? `${args.owner}/${args.repo}/${args.path || ''}` : 'Listing...'
    case 'github_modify_external_file': return args.path ? `${args.owner}/${args.repo}/${args.path}` : 'Modifying...'
    case 'github_search_code': return args.query ? String(args.query).slice(0, 50) : 'Searching...'
    case 'load_chat_history': return data ? `${(data as any).count || 0} messages` : 'Loading...'
    case 'github_pull_latest': {
      if (!data?.ok) return 'Pulling...'
      const pulled = (data as any).fileCount || 0
      const skipped = (data as any).skippedCount || 0
      return skipped > 0 ? `${pulled} pulled, ${skipped} local edits preserved` : `${pulled} files pulled`
    }
    case 'check_task_status': {
      if (data?.status === 'completed') return `${data.type || 'Task'}: completed`
      if (data?.status === 'failed') return `${data.type || 'Task'}: failed`
      if (data?.status === 'running') return `${data.type || 'Task'}: running...`
      return 'Checking...'
    }
    case 'cancel_task': return data?.ok ? 'Task cancelled' : 'Cancelling...'
    case 'mcp_list_servers': return data ? `${(data as any).count || 0} servers` : 'Listing...'
    case 'mcp_connect_server': return args.serverName ? `${args.serverName}` : 'Connecting...'
    case 'mcp_call_tool': return args.toolName ? `${args.serverName}/${args.toolName}` : 'Calling...'
    case 'forge_check_npm_package': return args.packageName ? `${args.packageName}` : 'Checking...'
    case 'forge_revert_commit': return data?.ok ? 'Commit reverted' : 'Reverting...'
    case 'forge_create_branch': return args.branchName ? `${args.branchName}` : 'Creating...'
    case 'forge_create_pr': return data?.url ? `PR created` : 'Creating PR...'
    case 'forge_merge_pr': return data?.ok ? 'PR merged' : 'Merging...'
    case 'forge_deployment_status': return data?.state ? `${data.state}` : 'Checking...'
    case 'forge_check_build': return data?.ok ? 'Build passed' : (data?.error ? 'Build failed' : 'Building...')
    case 'forge_list_branches': return data ? `${(data as any).count || 0} branches` : 'Listing...'
    case 'forge_delete_branch': return data?.ok ? 'Branch deleted' : 'Deleting...'
    case 'forge_read_deploy_log': return data ? 'Log retrieved' : 'Reading...'
    case 'db_introspect': return args.table ? `${args.table}` : 'Inspecting...'
    case 'scaffold_component': return args.name ? `${args.name}` : 'Scaffolding...'
    case 'generate_env_file': return data?.ok ? '.env.example created' : 'Generating...'
    case 'request_env_vars': return 'Environment setup'
    case 'connect_service': return args.service ? `Connect ${args.service}` : 'Service connection'
    case 'start_sandbox': return data?.ok ? 'Sandbox started' : 'Starting...'
    case 'stop_sandbox': return data?.ok ? 'Sandbox stopped' : 'Stopping...'
    case 'sandbox_status': return data?.running ? 'Running' : 'Checking...'
    case 'add_image': return args.query ? `"${String(args.query).slice(0, 30)}"` : 'Finding image...'
    case 'run_command': return args.command ? String(args.command).slice(0, 60) : 'Running...'
    case 'install_package': return args.packages ? String(args.packages) : 'Installing...'
    case 'run_dev_server': return data?.ok ? `Dev server at ${data.url || 'localhost'}` : 'Starting dev server...'
    case 'run_build': return data?.ok ? 'Build passed' : (data?.error ? 'Build failed' : 'Building...')
    case 'run_tests': {
      if (!data) return 'Running tests...'
      const passed = (data as any).passed || 0
      const failed = (data as any).failed || 0
      return failed > 0 ? `${passed} passed, ${failed} failed` : `${passed} passed`
    }
    case 'check_types': return data?.ok ? 'Types OK' : (data?.errorCount ? `${data.errorCount} type errors` : 'Type checking...')
    case 'verify_build': return data?.ok ? 'All checks passed' : 'Verifying...'
    case 'audit_codebase': return data ? `${(data as any).filesAnalyzed || 0} files analyzed` : 'Auditing...'
    case 'create_audit_plan': {
      if (!data) return 'Creating audit plan...'
      const findings = (data as any).findings?.length || 0
      const critical = (data as any).stats?.criticalCount || 0
      return critical > 0 ? `${findings} findings (${critical} critical)` : `${findings} findings`
    }
    case 'execute_audit_task': return data?.ok ? `${args.findingId || 'Issue'} fixed` : `Fixing ${args.findingId || 'issue'}...`
    case 'manage_tasks': {
      const taskList = args.tasks as Array<{ status: string }> | undefined
      if (!taskList) return 'Updating tasks...'
      const done = taskList.filter(t => t.status === 'completed').length
      return `${done}/${taskList.length} tasks`
    }
    default: return 'Done'
  }
}

/**
 * Returns a human-readable "phase label" based on what the last completed tool was.
 * Used in the streaming indicator to show contextual status instead of "Step N".
 */
export function getPhaseLabel(lastToolName: string | null): string {
  if (!lastToolName) return 'Thinking'

  switch (lastToolName) {
    // Reading files
    case 'read_file':
    case 'forge_read_own_source':
    case 'github_read_file':
      return 'Reading file'
    case 'get_all_files':
    case 'list_files':
    case 'github_list_repo_files':
      return 'Listing files'

    // Searching
    case 'search_files':
    case 'github_search_code':
    case 'search_references':
      return 'Searching files'
    case 'grep_files':
      return 'Searching file contents'
    case 'get_reference_code':
      return 'Looking up references'
    case 'forge_check_npm_package':
    case 'check_dependency_health':
      return 'Checking dependencies'

    // Writing / editing
    case 'write_file':
      return 'Writing file'
    case 'edit_file':
      return 'Editing file'
    case 'rename_file':
      return 'Renaming file'
    case 'delete_file':
      return 'Deleting file'
    case 'forge_modify_own_source':
    case 'github_modify_external_file':
      return 'Modifying source'
    case 'scaffold_component':
      return 'Scaffolding component'

    // Planning / thinking
    case 'think':
      return 'Planning next steps'
    case 'suggest_improvement':
      return 'Suggesting improvements'
    case 'check_coherence':
    case 'validate_file':
      return 'Validating changes'

    // Project / scaffolding
    case 'create_project':
      return 'Creating project'
    case 'add_dependency':
      return 'Adding dependency'
    case 'generate_env_file':
      return 'Generating config'
    case 'generate_tests':
      return 'Generating tests'

    // Deployment
    case 'deploy_to_vercel':
      return 'Deploying to Vercel'
    case 'forge_redeploy':
      return 'Redeploying'
    case 'forge_deployment_status':
    case 'forge_check_build':
    case 'forge_read_deploy_log':
      return 'Checking deployment'

    // Git
    case 'github_create_repo':
      return 'Creating repository'
    case 'github_push_update':
    case 'github_push_files':
      return 'Pushing to GitHub'
    case 'github_pull_latest':
      return 'Pulling latest'
    case 'forge_create_branch':
      return 'Creating branch'
    case 'forge_create_pr':
      return 'Creating pull request'
    case 'forge_merge_pr':
      return 'Merging pull request'
    case 'forge_revert_commit':
      return 'Reverting commit'
    case 'forge_list_branches':
    case 'forge_delete_branch':
      return 'Managing branches'

    // Database
    case 'db_query':
      return 'Querying database'
    case 'db_mutate':
      return 'Updating database'
    case 'db_introspect':
      return 'Inspecting schema'

    // Terminal / commands
    case 'run_command':
      return 'Running command'
    case 'install_package':
      return 'Installing packages'
    case 'run_dev_server':
      return 'Starting dev server'

    // Build / test / verify
    case 'run_build':
      return 'Running build'
    case 'run_tests':
      return 'Running tests'
    case 'check_types':
      return 'Checking types'
    case 'verify_build':
      return 'Verifying build'

    // Audit
    case 'audit_codebase':
    case 'create_audit_plan':
      return 'Auditing code'
    case 'execute_audit_task':
      return 'Fixing issue'

    // Tasks
    case 'manage_tasks':
      return 'Updating task list'

    // Sandbox / environment
    case 'start_sandbox':
    case 'stop_sandbox':
    case 'sandbox_status':
    case 'capture_preview':
      return 'Checking preview'

    // MCP / external
    case 'mcp_list_servers':
    case 'mcp_connect_server':
    case 'mcp_call_tool':
      return 'Using external tool'

    // Chat / history
    case 'load_chat_history':
    case 'save_project':
    case 'save_preference':
    case 'load_preferences':
      return 'Loading context'

    // Env / config
    case 'request_env_vars':
    case 'set_custom_domain':
    case 'connect_service':
      return 'Configuring environment'

    // Media
    case 'add_image':
      return 'Finding media'

    // Tasks
    case 'check_task_status':
    case 'cancel_task':
      return 'Checking progress'

    default:
      return 'Working'
  }
}

/**
 * Maps raw tool error strings to user-friendly messages.
 * Falls back to a truncated version of the raw error.
 */
export function getFriendlyError(rawError: string, toolName?: string): string {
  const lower = rawError.toLowerCase()

  // Rate limiting
  if (lower.includes('rate limit') || lower.includes('429') || lower.includes('too many requests'))
    return 'Rate limit hit - wait a moment and retry'
  // Timeouts
  if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('etimedout'))
    return 'Operation timed out - try again'
  // Auth
  if (lower.includes('401') || lower.includes('unauthorized') || lower.includes('auth') || lower.includes('forbidden') || lower.includes('403'))
    return 'Authentication failed - check your credentials'
  // Not found
  if (lower.includes('404') || lower.includes('not found') || lower.includes('no such file') || lower.includes('enoent'))
    return toolName === 'read_file' || toolName === 'edit_file' ? 'File not found - check the path' : 'Resource not found'
  // Network
  if (lower.includes('enotfound') || lower.includes('network') || lower.includes('econnrefused') || lower.includes('econnreset') || lower.includes('fetch failed'))
    return 'Network error - check your connection'
  // GitHub specific
  if (lower.includes('github') && lower.includes('abuse'))
    return 'GitHub abuse detection triggered - slow down requests'
  // Syntax / parse
  if (lower.includes('syntax') || lower.includes('parse error') || lower.includes('unexpected token'))
    return 'Syntax error in the generated code'
  // Permission
  if (lower.includes('permission') || lower.includes('eperm') || lower.includes('eacces'))
    return 'Permission denied - cannot access this resource'
  // Disk
  if (lower.includes('enospc') || lower.includes('no space'))
    return 'No disk space available'
  // Edit-specific: old_string not found
  if (lower.includes('old_string not found') || lower.includes('no match') || lower.includes('could not find'))
    return 'Edit target not found - file may have changed'
  // Cancelled
  if (lower.includes('cancelled') || lower.includes('canceled') || lower.includes('aborted'))
    return 'Cancelled'
  // Generic server error
  if (lower.includes('500') || lower.includes('internal server'))
    return 'Server error - try again'

  // Fallback: truncate the raw error
  return rawError.length > 80 ? rawError.slice(0, 77) + '...' : rawError
}

export function extractFileUpdates(
  inv: ToolInvocation,
  currentFiles: Record<string, string>,
): { updates?: Record<string, string>; deletes?: string[]; warning?: string } | null {
  const args = inv.args || {}

  switch (inv.toolName) {
    case 'write_file':
      if (typeof args.path === 'string' && typeof args.content === 'string') {
        return { updates: { [args.path]: args.content } }
      }
      return null

    case 'edit_file':
      if (inv.state === 'result' && inv.result && !('error' in inv.result)) {
        const path = args.path as string
        const oldStr = args.old_string as string
        const newStr = args.new_string as string
        const current = currentFiles[path]
        if (current && typeof oldStr === 'string' && typeof newStr === 'string') {
          if (current.includes(oldStr)) {
            // Warn if oldStr appears multiple times — only first occurrence is replaced
            const occurrences = current.split(oldStr).length - 1
            const updated = current.replace(oldStr, newStr)
            if (occurrences > 1) {
              return { updates: { [path]: updated }, warning: `old_string appeared ${occurrences} times — only the first occurrence was replaced` }
            }
            return { updates: { [path]: updated } }
          }
          const normLine = (l: string) => l.trim()
          const currentLines = current.split('\n')
          const oldLines = oldStr.split('\n').map(normLine).filter(l => l.length > 0)
          if (oldLines.length > 0) {
            for (let i = 0; i < currentLines.length; i++) {
              if (normLine(currentLines[i]) !== oldLines[0]) continue
              let fi = i, oi = 0, matched = true
              while (oi < oldLines.length && fi < currentLines.length) {
                if (normLine(currentLines[fi]) === '') { fi++; continue }
                if (normLine(currentLines[fi]) === oldLines[oi]) { oi++; fi++ }
                else { matched = false; break }
              }
              if (matched && oi === oldLines.length) {
                const before = currentLines.slice(0, i).join('\n')
                const after = currentLines.slice(fi).join('\n')
                const updated = [before, newStr, after].filter(s => s !== '').join('\n')
                return { updates: { [path]: updated } }
              }
            }
          }
        }
      }
      return null

    case 'delete_file':
      if (typeof args.path === 'string') {
        return { deletes: [args.path] }
      }
      return null

    case 'rename_file':
      if (typeof args.oldPath === 'string' && typeof args.newPath === 'string') {
        const content = currentFiles[args.oldPath]
        if (content !== undefined) {
          return { updates: { [args.newPath]: content }, deletes: [args.oldPath] }
        }
      }
      return null

    case 'create_project':
      if (inv.state === 'result' && inv.result?.allFiles && typeof inv.result.allFiles === 'object') {
        const raw = inv.result.allFiles as Record<string, unknown>
        const safe: Record<string, string> = {}
        for (const [k, v] of Object.entries(raw)) {
          if (typeof v === 'string') safe[k] = v
        }
        return Object.keys(safe).length > 0 ? { updates: safe } : null
      }
      return null

    default:
      return null
  }
}
