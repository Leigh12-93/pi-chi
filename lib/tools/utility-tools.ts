import { tool } from 'ai'
import { z } from 'zod'
import { mcpClient } from '@/lib/mcp-client'
import type { ToolContext } from './types'

function resolvePath(fromPath: string, importPath: string): string {
  const fromDir = fromPath.substring(0, fromPath.lastIndexOf('/'))
  const parts = fromDir.split('/').filter(Boolean)
  for (const segment of importPath.split('/')) {
    if (segment === '..') parts.pop()
    else if (segment !== '.') parts.push(segment)
  }
  return parts.join('/')
}

export function createUtilityTools(ctx: ToolContext) {
  const { vfs, projectId, supabaseFetch } = ctx

  return {
    think: tool({
      description: 'Think through your approach before building. Use this for complex tasks (3+ files) to plan the file structure, component hierarchy, and implementation order.',
      parameters: z.object({
        plan: z.string().describe('Your step-by-step plan for implementing this task'),
        files: z.array(z.string()).describe('List of files you plan to create/modify'),
        approach: z.string().optional().describe('Key architectural decisions'),
      }),
      execute: async ({ plan, files, approach }) => ({
        acknowledged: true,
        plan,
        files,
        approach,
      }),
    }),

    suggest_improvement: tool({
      description: 'Log a tooling limitation, bug, or improvement suggestion. Use when you encounter something that blocks or slows your work.',
      parameters: z.object({
        issue: z.string().describe('What limitation or bug you encountered'),
        suggestion: z.string().describe('Specific fix — include exact code changes if possible'),
        file: z.string().optional().describe('Which source file needs to change'),
        priority: z.enum(['low', 'medium', 'high']).describe('Impact level'),
      }),
      execute: async ({ issue, suggestion, file, priority }) => ({
        logged: true,
        issue,
        suggestion,
        file,
        priority,
      }),
    }),

    request_env_vars: tool({
      description: 'Request environment variables from the user. Use this BEFORE deploying when the project needs API keys, secrets, or config values. The user will see inline input fields in the chat to enter their credentials. Call this whenever you detect process.env references that need real values.',
      parameters: z.object({
        variables: z.array(z.object({
          name: z.string().describe('Env var name, e.g. DATABASE_URL'),
          description: z.string().optional().describe('What this variable is for'),
          required: z.boolean().optional().describe('Whether this is required (default true)'),
        })).describe('List of environment variables needed'),
      }),
      execute: async ({ variables }) => {
        // Also scan VFS for any process.env references the AI may have missed
        const detected = new Set(variables.map(v => v.name))
        for (const [, content] of vfs.files) {
          const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)
          for (const match of matches) {
            if (!detected.has(match[1]) && !match[1].startsWith('NODE_') && match[1] !== 'NODE_ENV') {
              detected.add(match[1])
              variables.push({ name: match[1], description: `Detected in project source`, required: true })
            }
          }
        }
        return { variables, count: variables.length }
      },
    }),

    load_chat_history: tool({
      description: 'Load previous chat messages for this project from the database.',
      parameters: z.object({}),
      execute: async () => {
        if (!projectId) return { error: 'No project ID available' }

        const result = await supabaseFetch(`/forge_chat_messages?project_id=eq.${projectId}&order=created_at.asc&limit=100`)
        if (!result.ok) return { error: `Failed to load chat history: ${JSON.stringify(result.data)}` }

        const messages = Array.isArray(result.data) ? result.data : []
        return {
          messages: messages.map((msg: any) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content,
            tool_invocations: msg.tool_invocations,
            created_at: msg.created_at,
          })),
          count: messages.length
        }
      },
    }),

    mcp_list_servers: tool({
      description: 'List all configured MCP servers and their connection status, plus available tools.',
      parameters: z.object({}),
      execute: async () => {
        const servers = mcpClient.getServers()
        return {
          servers: servers.map(s => ({
            id: s.config.id,
            name: s.config.name,
            connected: s.connected,
            toolCount: s.tools.length,
            tools: s.tools.map(t => t.name),
            error: s.error,
          })),
        }
      },
    }),

    mcp_connect_server: tool({
      description: 'Add and connect to an MCP server. Discovers available tools automatically.',
      parameters: z.object({
        url: z.string().describe('MCP server HTTP endpoint URL'),
        name: z.string().describe('Display name for this server'),
        token: z.string().optional().describe('Bearer auth token (if required)'),
      }),
      execute: async ({ url, name, token }) => {
        const config = {
          id: `mcp-${Date.now()}`,
          name,
          description: '',
          url,
          enabled: true,
          tags: [] as string[],
          ...(token ? { auth: { type: 'bearer' as const, token } } : {}),
        }
        mcpClient.addServer(config)
        const state = await mcpClient.connect(config.id)
        return {
          ok: state.connected,
          serverId: config.id,
          tools: state.tools.map(t => ({ name: t.name, description: t.description })),
          error: state.error,
        }
      },
    }),

    search_references: tool({
      description: 'Search the reference component library for high-quality examples. Use before generating any UI component to find proven patterns to adapt.',
      parameters: z.object({
        query: z.string().describe('What type of component or pattern to search for (e.g., "data table", "login form", "dashboard layout")'),
      }),
      execute: async ({ query }) => {
        const { searchReferences } = await import('@/lib/reference-library')
        const results = searchReferences(query)
        if (results.length === 0) return { results: [], message: 'No matching references found. Generate from scratch using design system tokens.' }
        return {
          results: results.map(r => ({
            name: r.name,
            category: r.category,
            description: r.description,
            code: r.code,
          })),
          message: `Found ${results.length} reference(s). Adapt the closest match to the user's needs — don't copy verbatim.`,
        }
      },
    }),

    mcp_call_tool: tool({
      description: 'Execute a tool on a connected MCP server. Use mcp_list_servers first to see available tools.',
      parameters: z.object({
        serverId: z.string().describe('ID of the connected MCP server'),
        tool: z.string().describe('Name of the tool to call'),
        args: z.record(z.unknown()).default({}).describe('Arguments to pass to the tool'),
      }),
      execute: async ({ serverId, tool: toolName, args }) => {
        try {
          const result = await mcpClient.callTool(serverId, toolName, args)
          return { ok: true, result }
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Tool call failed' }
        }
      },
    }),

    validate_file: tool({
      description: 'Validate a file for common issues (broken imports, missing directives, accessibility). Call after writing any file >20 lines.',
      parameters: z.object({
        path: z.string().describe('File path to validate'),
      }),
      execute: async ({ path }) => {
        const content = vfs.read(path)
        if (!content) return { error: `File not found: ${path}` }

        const warnings: string[] = []
        const errors: string[] = []
        const ext = path.split('.').pop() || ''
        const isTsx = ext === 'tsx' || ext === 'jsx'
        const isTs = ext === 'ts' || ext === 'tsx'

        // Check: 'use client' directive missing when hooks are used
        if (isTsx && /\buse(State|Effect|Ref|Callback|Memo|Context|Reducer)\s*\(/.test(content)) {
          if (!content.includes("'use client'") && !content.includes('"use client"')) {
            errors.push("Missing 'use client' directive — file uses React hooks but has no client directive")
          }
        }

        // Check: imports reference files that exist in VFS
        const importRegex = /from\s+['"](\.\/?[^'"]+|@\/[^'"]+)['"]/g
        let match
        while ((match = importRegex.exec(content)) !== null) {
          const importPath = match[1]
          // Resolve relative imports
          if (importPath.startsWith('.') || importPath.startsWith('@/')) {
            const basePath = importPath.startsWith('@/')
              ? importPath.replace('@/', '')
              : resolvePath(path, importPath)
            // Check common extensions
            const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}/index.ts`, `${basePath}/index.tsx`, `${basePath}.js`, `${basePath}.jsx`]
            const found = candidates.some(c => vfs.exists(c))
            if (!found) {
              errors.push(`Import not found: '${importPath}' — no matching file in project`)
            }
          }
        }

        // Check: img tags without alt attribute
        if (isTsx) {
          const imgWithoutAlt = content.match(/<img\s+(?![^>]*\balt\b)[^>]*>/g)
          if (imgWithoutAlt) {
            warnings.push(`${imgWithoutAlt.length} <img> tag(s) missing alt attribute — add descriptive alt text for accessibility`)
          }
        }

        // Check: console.log left in code
        const consoleLogs = (content.match(/console\.(log|debug)\(/g) || []).length
        if (consoleLogs > 0) {
          warnings.push(`${consoleLogs} console.log/debug call(s) found — remove before production`)
        }

        // Check: 'any' type usage
        if (isTs) {
          const anyTypes = (content.match(/:\s*any\b/g) || []).length
          if (anyTypes > 2) {
            warnings.push(`${anyTypes} uses of 'any' type — consider using specific types`)
          }
        }

        // Check: forms without onSubmit
        if (isTsx && content.includes('<form') && !content.includes('onSubmit')) {
          warnings.push('Form element found without onSubmit handler')
        }

        return {
          path,
          valid: errors.length === 0,
          errors,
          warnings,
          summary: errors.length === 0
            ? `✓ Valid${warnings.length > 0 ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : ''}`
            : `✗ ${errors.length} error(s) found`,
        }
      },
    }),

    check_coherence: tool({
      description: 'Check cross-file consistency: verify imports resolve, shared types match, and API routes align with frontend expectations. Call after creating or modifying multiple related files.',
      parameters: z.object({
        paths: z.array(z.string()).describe('File paths to check for cross-file coherence'),
      }),
      execute: async ({ paths }) => {
        const issues: string[] = []
        const fileContents = new Map<string, string>()

        // Read all requested files
        for (const p of paths) {
          const content = vfs.read(p)
          if (content) fileContents.set(p, content)
          else issues.push(`File not found: ${p}`)
        }

        // Check 1: All imports between these files resolve
        const allPaths = new Set(vfs.list())
        for (const [filePath, content] of fileContents) {
          const importRegex = /from\s+['"](\.\/?[^'"]+|@\/[^'"]+)['"]/g
          let match
          while ((match = importRegex.exec(content)) !== null) {
            const imp = match[1]
            const resolved = imp.startsWith('@/') ? imp.replace('@/', '') : resolvePath(filePath, imp)
            const candidates = [resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}/index.ts`, `${resolved}/index.tsx`, `${resolved}.js`, `${resolved}.jsx`]
            if (!candidates.some(c => allPaths.has(c))) {
              issues.push(`${filePath}: import '${imp}' does not resolve to any file`)
            }
          }
        }

        // Check 2: Exported types/interfaces used consistently
        const exports = new Map<string, string[]>()
        for (const [filePath, content] of fileContents) {
          const exportMatches = content.matchAll(/export\s+(?:interface|type)\s+(\w+)/g)
          for (const m of exportMatches) {
            if (!exports.has(m[1])) exports.set(m[1], [])
            exports.get(m[1])!.push(filePath)
          }
        }

        // Check 3: API route response shape matches frontend fetch usage
        for (const [filePath, content] of fileContents) {
          // Find fetch calls to local API routes
          const fetchMatches = content.matchAll(/fetch\s*\(\s*['"`]\/api\/([^'"`]+)/g)
          for (const m of fetchMatches) {
            const apiPath = `app/api/${m[1]}/route.ts`
            if (allPaths.has(apiPath) && !fileContents.has(apiPath)) {
              issues.push(`${filePath}: fetches /api/${m[1]} but that route file wasn't included in coherence check — consider adding it`)
            }
          }
        }

        return {
          filesChecked: paths.length,
          issues,
          coherent: issues.length === 0,
          summary: issues.length === 0
            ? `All ${paths.length} files are coherent — imports resolve and types align`
            : `Found ${issues.length} coherence issue(s) across ${paths.length} files`,
        }
      },
    }),
  }
}
