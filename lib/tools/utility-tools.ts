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
      description: 'Think through your approach before building. Use for complex tasks (3+ files). The files array becomes a live progress checklist — list EVERY file you plan to create/modify in BUILD ORDER (types → hooks → components → pages). For data-driven apps, include dataModel and stateManagement. After think, IMMEDIATELY start building with tool calls. No text output.',
      inputSchema: z.object({
        plan: z.string().describe('Your step-by-step plan for implementing this task'),
        files: z.array(z.string()).describe('ALL files in BUILD ORDER: types → hooks → components → pages'),
        approach: z.string().optional().describe('Key architectural decisions'),
        dataModel: z.string().optional().describe('TypeScript types/interfaces for core entities — define BEFORE building components'),
        stateManagement: z.string().optional().describe('Hooks, stores, context, data fetching strategy'),
        apiContracts: z.string().optional().describe('API route request/response shapes'),
        errorStrategy: z.string().optional().describe('Loading states, error boundaries, empty states per data source'),
        confidence: z.number().min(0).max(100).optional()
          .describe('Confidence in approach (0-100). Below 70 → use present_plan to get user approval'),
        uncertainties: z.array(z.string()).optional()
          .describe('What would reduce uncertainty'),
        fragileAssumption: z.string().optional()
          .describe('The assumption most likely to be wrong'),
      }),
      execute: async ({ plan, files, approach, dataModel, stateManagement, apiContracts, errorStrategy, confidence, uncertainties, fragileAssumption }) => {
        const warnings: string[] = []

        // Validate build order: types files should come before component/page files
        const typesIdx = files.findIndex(f => /\/types\.tsx?$/.test(f) || f.includes('/types/'))
        const firstComponentIdx = files.findIndex(f => f.includes('components/'))
        const firstPageIdx = files.findIndex(f => f.match(/app\/.*page\.tsx/) || f.match(/page\.tsx$/))
        if (typesIdx > -1 && firstComponentIdx > -1 && typesIdx > firstComponentIdx) {
          warnings.push('BUILD ORDER: types file is listed AFTER components — types should be built first')
        }
        if (firstComponentIdx > -1 && firstPageIdx > -1 && firstComponentIdx > firstPageIdx) {
          warnings.push('BUILD ORDER: components are listed AFTER pages — components should be built before pages that import them')
        }

        // Check if data-driven app is missing architecture fields
        const planLower = plan.toLowerCase()
        const isDataDriven = /\b(fetch|api|crud|form|database|supabase|data|state)\b/.test(planLower)
        if (isDataDriven && !dataModel) {
          warnings.push('ARCHITECTURE: This appears to be a data-driven app but no dataModel was provided — define TypeScript types for your entities')
        }
        const hasApiRoutes = files.some(f => f.includes('api/') && f.includes('route'))
        if (hasApiRoutes && !apiContracts) {
          warnings.push('ARCHITECTURE: API routes are planned but no apiContracts defined — specify request/response shapes')
        }
        if (isDataDriven && !stateManagement) {
          warnings.push('ARCHITECTURE: Data-driven app with no stateManagement — define hooks, stores, context, or data fetching strategy')
        }
        if (isDataDriven && !errorStrategy) {
          warnings.push('ARCHITECTURE: Data-driven app with no errorStrategy — define loading, error, and empty states')
        }
        if (isDataDriven && !stateManagement) {
          warnings.push('ARCHITECTURE: Data-driven app with no stateManagement — define hooks, stores, context, or data fetching strategy')
        }

        if (confidence !== undefined && confidence < 70) {
          warnings.push(`LOW CONFIDENCE (${confidence}%): Consider using present_plan to get user approval before building`)
        }

        return {
          acknowledged: true,
          plan,
          files,
          approach,
          architecture: {
            dataModel: dataModel || null,
            stateManagement: stateManagement || null,
            apiContracts: apiContracts || null,
            errorStrategy: errorStrategy || null,
          },
          confidence: confidence ?? null,
          uncertainties: uncertainties || [],
          fragileAssumption: fragileAssumption || null,
          warnings,
          next: warnings.length > 0
            ? `Address these warnings before building: ${warnings.join('; ')}`
            : 'Start building immediately. Your next action must be a tool call.',
        }
      },
    }),

    present_plan: tool({
      description: 'Present a build plan to the user and WAIT for approval. Use for ANY task involving 3+ files, ambiguous requirements, or architectural decisions. Shows an interactive plan card. Do NOT build until the user approves.',
      inputSchema: z.object({
        summary: z.string().describe('1-2 sentence overview of what will be built'),
        approach: z.string().describe('Key architectural decisions and rationale'),
        files: z.array(z.object({
          path: z.string(),
          action: z.enum(['create', 'modify', 'delete']),
          reason: z.string().describe('Why this file needs this change'),
        })).describe('Every file that will be created/modified/deleted, in build order'),
        alternatives: z.array(z.object({
          id: z.string(),
          label: z.string(),
          description: z.string(),
        })).optional().describe('Alternative approaches for user to choose'),
        questions: z.array(z.object({
          id: z.string(),
          question: z.string(),
          options: z.array(z.string()).optional(),
        })).optional().describe('Clarifying questions requiring user input'),
        confidence: z.number().min(0).max(100).describe('Confidence in this plan (0-100)'),
        uncertainties: z.array(z.string()).optional().describe('What could reduce uncertainty'),
      }),
      execute: async (args) => ({
        __plan_gate: true,
        ...args,
        instruction: 'Plan presented to user. STOP and WAIT for their approval. Do NOT proceed until you receive a [PLAN APPROVED] or [PLAN REJECTED] message.',
      }),
    }),

    ask_user: tool({
      description: 'Ask the user a clarifying question with optional choices. Use when the request is ambiguous, multiple valid approaches exist, or you need the user to decide. Renders as an interactive card. STOP and wait for response.',
      inputSchema: z.object({
        question: z.string().describe('The question to ask'),
        context: z.string().optional().describe('Why you are asking this'),
        options: z.array(z.object({
          id: z.string(),
          label: z.string(),
          description: z.string().optional(),
        })).optional().describe('Choices for the user (if applicable)'),
        recommended: z.string().optional().describe('ID of the recommended option'),
        allowFreeText: z.boolean().optional().describe('Allow user to type a custom answer (default true)'),
      }),
      execute: async (args) => ({
        __ask_gate: true,
        ...args,
        instruction: 'Question shown to user. STOP and wait for their response.',
      }),
    }),

    checkpoint: tool({
      description: 'Show a progress checkpoint during a complex build (10+ files). Use after completing a logical phase. Lets the user see progress and provide feedback before continuing.',
      inputSchema: z.object({
        phase: z.string().describe('What phase just completed (e.g., "Data model & types")'),
        completed: z.array(z.string()).describe('Files completed in this phase'),
        nextPhase: z.string().describe('What will be built next'),
        previewReady: z.boolean().optional().describe('Is there enough to see a meaningful preview?'),
        question: z.string().optional().describe('Optional question before continuing'),
      }),
      execute: async (args) => ({
        __checkpoint: true,
        ...args,
        instruction: args.question
          ? 'Checkpoint shown with question. STOP and wait for user response.'
          : 'Checkpoint shown. Continue to next phase.',
      }),
    }),

    diagnose_preview: tool({
      description: 'Diagnose why the preview panel is failing to load. Checks CSP headers, X-Frame-Options, and connection status of the preview URL. Use when the user reports "refused to connect" or preview errors.',
      inputSchema: z.object({
        url: z.string().describe('The preview URL that is failing'),
        errorType: z.enum(['refused_to_connect', 'blank_page', 'runtime_error', 'timeout', 'unknown'])
          .describe('The type of error observed'),
        consoleErrors: z.array(z.string()).optional().describe('Any console errors reported by the preview'),
      }),
      execute: async ({ url, errorType, consoleErrors }) => {
        const diagnosis: string[] = []
        const fixes: string[] = []

        try {
          const res = await fetch(url, {
            method: 'HEAD',
            signal: AbortSignal.timeout(10000),
            redirect: 'follow',
          })

          const xFrameOptions = res.headers.get('x-frame-options')
          const csp = res.headers.get('content-security-policy')
          const frameAncestors = csp?.match(/frame-ancestors\s+([^;]+)/)?.[1]

          if (xFrameOptions?.toLowerCase() === 'deny' || xFrameOptions?.toLowerCase() === 'sameorigin') {
            diagnosis.push(`X-Frame-Options: ${xFrameOptions} — blocks iframe embedding`)
            fixes.push('Remove or modify X-Frame-Options header in next.config.ts or middleware.ts')
          }

          if (frameAncestors && !frameAncestors.includes('*')) {
            diagnosis.push(`CSP frame-ancestors: ${frameAncestors} — restricts iframe embedding`)
            fixes.push('Update Content-Security-Policy frame-ancestors to allow Forge domain')
          }

          if (!res.ok) {
            diagnosis.push(`HTTP ${res.status}: Server returned error status`)
            fixes.push(`Check build logs — the deployed site is returning ${res.status}`)
          }

          if (res.status === 500) {
            fixes.push('Check for missing environment variables on the deployed site')
            fixes.push('Check for server-side rendering errors (use try/catch in server components)')
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : String(err)
          diagnosis.push(`Connection failed: ${errMsg}`)
          if (errMsg.includes('ECONNREFUSED')) {
            fixes.push('The preview server is not running — check if the dev server started correctly')
          }
          if (errMsg.includes('timeout')) {
            fixes.push('The preview URL timed out — the server may be overloaded or unresponsive')
          }
        }

        return {
          url,
          errorType,
          diagnosis: diagnosis.length ? diagnosis : ['No specific issue detected from server-side probe'],
          suggestedFixes: fixes.length ? fixes : ['Try refreshing the preview or redeploying'],
          consoleErrors: consoleErrors || [],
        }
      },
    }),

    suggest_improvement: tool({
      description: 'Log a tooling limitation, bug, or improvement suggestion. Use when you encounter something that blocks or slows your work.',
      inputSchema: z.object({
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
      inputSchema: z.object({
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
      inputSchema: z.object({}),
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
      inputSchema: z.object({}),
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
      inputSchema: z.object({
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
      inputSchema: z.object({
        query: z.string().describe('What type of component or pattern to search for (e.g., "data table", "login form", "dashboard layout")'),
        category: z.string().optional().describe('Filter by category: page, layout, form, data-display, navigation, feedback, dashboard, auth, chart, loading, error-handling, settings, component, hook, utility, ui-primitive, api-route, search'),
        source: z.string().optional().describe('Filter by source codebase: awb-website, awb-admin-dashboard, forge'),
      }),
      execute: async ({ query, category, source }) => {
        const { searchReferences } = await import('@/lib/reference-library')
        const results = searchReferences(query, { category, source })
        if (results.length === 0) return { results: [], message: 'No matching references found. Generate from scratch using design system tokens.' }
        return {
          results: results.map(r => ({
            name: r.name,
            category: r.category,
            description: r.description,
            codePreview: r.code.split('\n').slice(0, 30).join('\n') + (r.code.split('\n').length > 30 ? '\n// ... truncated — use get_reference_code for full source' : ''),
          })),
          message: `Found ${results.length} reference(s). Adapt the closest match to the user's needs — don't copy verbatim.`,
        }
      },
    }),

    get_reference_code: tool({
      description: 'Get the full source code of a reference component by name. Use after search_references finds a relevant match and you need the complete implementation.',
      inputSchema: z.object({
        name: z.string().describe('Exact component name from search_references results'),
      }),
      execute: async ({ name }) => {
        const { REFERENCE_LIBRARY } = await import('@/lib/reference-library')
        const ref = REFERENCE_LIBRARY.find(r => r.name === name)
        if (!ref) return { error: `Reference "${name}" not found. Use search_references first to find available components.` }
        return {
          name: ref.name,
          source: ref.source,
          path: ref.path,
          category: ref.category,
          tags: ref.tags,
          code: ref.code,
          lines: ref.lines,
        }
      },
    }),

    mcp_call_tool: tool({
      description: 'Execute a tool on a connected MCP server. Use mcp_list_servers first to see available tools.',
      inputSchema: z.object({
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
      inputSchema: z.object({
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
        const importRegex = /from\s+['"](\.\/?[^'"]+|@\/[^'"]+|~\/[^'"]+)['"]/g
        let match
        while ((match = importRegex.exec(content)) !== null) {
          const importPath = match[1]
          // Resolve relative imports
          if (importPath.startsWith('.') || importPath.startsWith('@/') || importPath.startsWith('~/')) {
            const basePath = importPath.startsWith('@/')
              ? importPath.replace('@/', '')
              : importPath.startsWith('~/')
                ? importPath.replace('~/', '')
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

    capture_preview: tool({
      description: 'Request a screenshot capture of the current preview panel. The client will capture the iframe content and return it as a base64 data URL. Use this after building or modifying UI components to visually verify your output looks correct. Review the image for: layout issues, missing elements, broken styling, accessibility concerns.',
      inputSchema: z.object({
        reason: z.string().optional().describe('Why you want to capture the preview (e.g., "verify dashboard layout", "check form styling")'),
      }),
      execute: async ({ reason }) => {
        // This is a client-signaling tool — the actual capture happens on the client side.
        // The chat-panel intercepts this tool call and triggers html2canvas on the preview iframe.
        // The result is injected back as a follow-up message with the image data.
        return {
          action: 'capture_preview',
          reason: reason || 'Visual review of current output',
          instruction: 'The preview capture has been requested. The client will respond with a screenshot. Review it carefully for layout, styling, and accessibility issues.',
        }
      },
    }),

    check_coherence: tool({
      description: 'Check cross-file consistency: verify imports resolve, shared types match, and API routes align with frontend expectations. Call after creating or modifying multiple related files.',
      inputSchema: z.object({
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
          const importRegex = /from\s+['"](\.\/?[^'"]+|@\/[^'"]+|~\/[^'"]+)['"]/g
          let match
          while ((match = importRegex.exec(content)) !== null) {
            const imp = match[1]
            const resolved = imp.startsWith('@/')
              ? imp.replace('@/', '')
              : imp.startsWith('~/')
                ? imp.replace('~/', '')
                : resolvePath(filePath, imp)
            const candidates = [resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}/index.ts`, `${resolved}/index.tsx`, `${resolved}.js`, `${resolved}.jsx`]
            if (!candidates.some(c => allPaths.has(c))) {
              issues.push(`${filePath}: import '${imp}' does not resolve to any file`)
            }
          }
        }

        // Check 2: Exported types/interfaces used consistently
        const exports = new Map<string, string[]>()
        for (const [filePath, content] of fileContents) {
          const exportMatches = content.matchAll(/export\s+(?:interface|type|function|const)\s+(\w+)/g)
          for (const m of exportMatches) {
            if (!exports.has(m[1])) exports.set(m[1], [])
            exports.get(m[1])!.push(filePath)
          }
        }

        // Check 3: API route response shape matches frontend fetch usage
        const warnings: string[] = []
        for (const [filePath, content] of fileContents) {
          // Find fetch calls to local API routes
          const fetchMatches = content.matchAll(/fetch\s*\(\s*['"`]\/api\/([^'"`]+)/g)
          for (const m of fetchMatches) {
            const apiPath = `app/api/${m[1]}/route.ts`
            if (!allPaths.has(apiPath)) {
              issues.push(`${filePath}: fetches /api/${m[1]} but no route file exists at ${apiPath}`)
            } else if (!fileContents.has(apiPath)) {
              warnings.push(`${filePath}: fetches /api/${m[1]} — route exists but wasn't included in coherence check`)
            }
          }
        }

        // Check 4: Dead exports — exported types/functions not imported by any checked file
        for (const [typeName, exportFiles] of exports) {
          const importedAnywhere = [...fileContents].some(([fp, content]) =>
            !exportFiles.includes(fp) && new RegExp(`\\b${typeName}\\b`).test(content)
          )
          if (!importedAnywhere && fileContents.size > 1) {
            warnings.push(`${exportFiles[0]}: exports '${typeName}' but it's not imported by any other checked file`)
          }
        }

        // Check 5: Missing loading/error states for data fetching components
        for (const [filePath, content] of fileContents) {
          const isTsx = filePath.endsWith('.tsx') || filePath.endsWith('.jsx')
          if (!isTsx) continue
          const hasFetch = /\b(fetch|useSWR|useQuery|axios)\b/.test(content) || (/\buseEffect\b/.test(content) && /\bfetch\b/.test(content))
          if (hasFetch) {
            const hasLoading = /loading|isLoading|skeleton|spinner|Loader/i.test(content)
            const hasError = /error|isError|catch|Error/i.test(content)
            if (!hasLoading) {
              issues.push(`${filePath}: fetches data but has no loading state — add a loading indicator`)
            }
            if (!hasError) {
              issues.push(`${filePath}: fetches data but has no error handling — add error state`)
            }
          }
        }

        // Check 6: Excessive 'any' types
        for (const [filePath, content] of fileContents) {
          const isTs = filePath.endsWith('.ts') || filePath.endsWith('.tsx')
          if (!isTs) continue
          const anyCount = (content.match(/:\s*any\b/g) || []).length
          if (anyCount > 3) {
            warnings.push(`${filePath}: ${anyCount} uses of 'any' type — consider defining proper types`)
          }
        }

        return {
          filesChecked: paths.length,
          issues,
          warnings,
          coherent: issues.length === 0,
          summary: issues.length === 0
            ? `All ${paths.length} files are coherent${warnings.length > 0 ? ` (${warnings.length} warning${warnings.length > 1 ? 's' : ''})` : ''}`
            : `Found ${issues.length} issue(s) and ${warnings.length} warning(s) across ${paths.length} files`,
        }
      },
    }),

    generate_tests: tool({
      description: 'Generate test scaffolding for a component or API route. Creates a test file with smoke tests, prop validation, error states, and accessibility checks. Call after writing components to ensure quality.',
      inputSchema: z.object({
        path: z.string().describe('Path of the file to generate tests for'),
        framework: z.enum(['vitest', 'jest']).default('vitest').describe('Test framework to use'),
      }),
      execute: async ({ path, framework }) => {
        const content = vfs.read(path)
        if (!content) return { error: `File not found: ${path}` }

        const ext = path.split('.').pop() || ''
        const isTsx = ext === 'tsx' || ext === 'jsx'
        const basename = path.split('/').pop()?.replace(/\.[^.]+$/, '') || 'Component'
        const testPath = path.replace(/\.[^.]+$/, `.test.${ext}`)

        // Extract component name
        const nameMatch = content.match(/export\s+(?:default\s+)?function\s+(\w+)/)
          || content.match(/export\s+const\s+(\w+)/)
        const componentName = nameMatch?.[1] || basename
        const hasDefaultExport = /export\s+default\s+/.test(content)

        // Extract props interface
        const propsMatch = content.match(/(?:interface|type)\s+(\w*Props\w*)\s*[={]/)
        const propsType = propsMatch?.[1] || null

        // Detect patterns
        const hasForm = /<form/.test(content)
        const hasAsync = /async|await|fetch\(|useSWR|useQuery/.test(content)
        const hasState = /useState/.test(content)
        const isApiRoute = /export\s+(?:async\s+)?function\s+(?:GET|POST|PUT|DELETE)/.test(content)

        let testContent = ''
        const importLib = framework === 'vitest' ? 'vitest' : '@jest/globals'

        if (isApiRoute) {
          testContent = `import { describe, it, expect } from '${importLib}'
import { ${content.match(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|DELETE)/g)?.map(m => m.match(/(GET|POST|PUT|DELETE)/)?.[1]).filter(Boolean).join(', ') || 'GET'} } from './${basename}'

describe('${basename} API route', () => {
  it('handles valid request', async () => {
    const req = new Request('http://localhost/api/test', { method: 'GET' })
    const res = await GET(req)
    expect(res.status).toBeLessThan(500)
  })

  it('returns JSON response', async () => {
    const req = new Request('http://localhost/api/test', { method: 'GET' })
    const res = await GET(req)
    const contentType = res.headers.get('content-type')
    expect(contentType).toContain('application/json')
  })

  it('handles malformed input gracefully', async () => {
    const req = new Request('http://localhost/api/test', {
      method: 'POST',
      body: 'not-json',
      headers: { 'Content-Type': 'application/json' },
    })
    // Should not throw — should return error response
    try {
      const res = await POST(req)
      expect(res.status).toBeGreaterThanOrEqual(400)
    } catch {
      // POST may not exist, that's ok
    }
  })
})
`
        } else if (isTsx) {
          const componentImport = hasDefaultExport
            ? `import ${componentName} from './${basename}'`
            : `import { ${componentName} } from './${basename}'`
          testContent = `import { describe, it, expect } from '${importLib}'
import { render, screen } from '@testing-library/react'
${componentImport}

describe('${componentName}', () => {
  it('renders without crashing', () => {
    render(<${componentName} />)
  })

${hasState ? `  it('manages state correctly', () => {
    render(<${componentName} />)
    // TODO: test state changes via user interactions
  })

` : ''}${hasForm ? `  it('renders form elements', () => {
    render(<${componentName} />)
    const form = document.querySelector('form')
    expect(form).toBeTruthy()
  })

  it('shows validation errors for empty required fields', async () => {
    render(<${componentName} />)
    // TODO: submit empty form, check for error messages
  })

` : ''}${hasAsync ? `  it('handles loading state', () => {
    render(<${componentName} />)
    // TODO: verify loading indicator appears during data fetch
  })

  it('handles error state', () => {
    // TODO: mock failed fetch, verify error UI
  })

` : ''}  it('is accessible', () => {
    const { container } = render(<${componentName} />)
    // Check for basic accessibility
    const images = container.querySelectorAll('img')
    images.forEach(img => {
      expect(img.getAttribute('alt')).toBeTruthy()
    })
    const buttons = container.querySelectorAll('button')
    buttons.forEach(btn => {
      expect(btn.textContent || btn.getAttribute('aria-label')).toBeTruthy()
    })
  })
})
`
        } else {
          testContent = `import { describe, it, expect } from '${importLib}'
import { ${componentName} } from './${basename}'

describe('${componentName}', () => {
  it('exists and is callable', () => {
    expect(typeof ${componentName}).toBe('function')
  })

  it('handles valid input', () => {
    // TODO: add test with valid input
    const result = ${componentName}()
    expect(result).toBeDefined()
  })

  it('handles edge cases', () => {
    // TODO: test with null, undefined, empty values
  })
})
`
        }

        vfs.write(testPath, testContent)
        return {
          ok: true,
          testPath,
          testCount: (testContent.match(/it\(/g) || []).length,
          framework,
          note: 'Test scaffolding generated with TODO markers. Fill in specific assertions based on component behavior.',
        }
      },
    }),

    check_dependency_health: tool({
      description: 'Check the health of an npm package before adding it as a dependency. Checks for deprecation, last publish date, weekly downloads, and approximate bundle size. Use before add_dependency to avoid adding dead or bloated packages.',
      inputSchema: z.object({
        packageName: z.string().describe('npm package name to check (e.g., "lodash", "date-fns")'),
      }),
      execute: async ({ packageName }) => {
        try {
          // Fetch from npm registry
          const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}`, {
            signal: AbortSignal.timeout(10000),
          })
          if (res.status === 404) return { error: `Package "${packageName}" not found on npm.` }
          if (!res.ok) return { error: `npm registry returned ${res.status}` }
          const data = await res.json()

          const latest = data['dist-tags']?.latest
          const latestVersion = latest ? data.versions?.[latest] : null
          const time = data.time || {}
          const lastPublish = time[latest] || time.modified || null
          const deprecated = latestVersion?.deprecated || data.deprecated || null

          // Calculate days since last publish
          let daysSincePublish: number | null = null
          if (lastPublish) {
            daysSincePublish = Math.floor((Date.now() - new Date(lastPublish).getTime()) / (1000 * 60 * 60 * 24))
          }

          // Check weekly downloads
          let weeklyDownloads: number | null = null
          try {
            const dlRes = await fetch(`https://api.npmjs.org/downloads/point/last-week/${encodeURIComponent(packageName)}`, {
              signal: AbortSignal.timeout(5000),
            })
            if (dlRes.ok) {
              const dlData = await dlRes.json()
              weeklyDownloads = dlData.downloads || null
            }
          } catch { /* non-critical */ }

          // Health assessment
          const warnings: string[] = []
          if (deprecated) warnings.push(`DEPRECATED: ${deprecated}`)
          if (daysSincePublish && daysSincePublish > 730) warnings.push(`Last published ${daysSincePublish} days ago — may be unmaintained`)
          if (weeklyDownloads !== null && weeklyDownloads < 1000) warnings.push(`Low usage: ${weeklyDownloads} downloads/week`)

          const healthy = !deprecated && (daysSincePublish === null || daysSincePublish < 730)

          return {
            name: packageName,
            version: latest,
            healthy,
            deprecated: deprecated || null,
            lastPublished: lastPublish,
            daysSincePublish,
            weeklyDownloads,
            license: latestVersion?.license || data.license || 'unknown',
            description: data.description || '',
            warnings,
            recommendation: deprecated
              ? 'DO NOT USE — this package is deprecated. Find an alternative.'
              : !healthy
                ? 'CAUTION — this package may be unmaintained. Consider alternatives.'
                : warnings.length > 0
                  ? `Usable but note: ${warnings.join('; ')}`
                  : 'Healthy — safe to use.',
          }
        } catch (err) {
          return { error: `Failed to check package: ${err instanceof Error ? err.message : 'unknown error'}` }
        }
      },
    }),

    select_model: tool({
      description: 'Switch to a different Claude model for the remainder of this session. Use when a task requires more reasoning power (Opus) or when a simple task can be handled faster (Haiku).',
      inputSchema: z.object({
        model: z.enum(['haiku', 'sonnet', 'opus']).describe('Model to switch to: haiku (fast), sonnet (balanced), opus (most capable)'),
        reason: z.string().optional().describe('Why you are switching models'),
      }),
      execute: async ({ model, reason }) => {
        const modelMap: Record<string, string> = {
          haiku: 'claude-haiku-4-5-20251001',
          sonnet: 'claude-sonnet-4-20250514',
          opus: 'claude-opus-4-6',
        }
        return {
          ok: true,
          selectedModel: modelMap[model] || modelMap.sonnet,
          reason: reason || `Switched to ${model}`,
          __model_override: modelMap[model] || modelMap.sonnet,
        }
      },
    }),

    web_search: tool({
      description: 'Search the web for documentation, API references, library info, or solutions. Returns top results with title, URL, and snippet. Use when you need to look up current docs or verify API patterns.',
      inputSchema: z.object({
        query: z.string().describe('Search query — be specific for better results'),
        count: z.number().optional().default(5).describe('Number of results to return (max 10)'),
      }),
      execute: async ({ query, count }) => {
        const numResults = Math.min(count || 5, 10)
        try {
          // Try Brave Search API (free tier: 1 query/sec, 2000/month)
          const braveKey = process.env.BRAVE_SEARCH_API_KEY
          if (braveKey) {
            const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${numResults}`
            const res = await fetch(url, {
              headers: { 'X-Subscription-Token': braveKey, 'Accept': 'application/json' },
              signal: AbortSignal.timeout(10000),
            })
            if (res.ok) {
              const data = await res.json()
              const results = (data.web?.results || []).slice(0, numResults).map((r: any) => ({
                title: r.title || '',
                url: r.url || '',
                snippet: (r.description || '').slice(0, 200),
              }))
              return { ok: true, results, count: results.length, source: 'brave' }
            }
          }

          // Fallback: Serper API
          const serperKey = process.env.SERPER_API_KEY
          if (serperKey) {
            const res = await fetch('https://google.serper.dev/search', {
              method: 'POST',
              headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
              body: JSON.stringify({ q: query, num: numResults }),
              signal: AbortSignal.timeout(10000),
            })
            if (res.ok) {
              const data = await res.json()
              const results = (data.organic || []).slice(0, numResults).map((r: any) => ({
                title: r.title || '',
                url: r.link || '',
                snippet: (r.snippet || '').slice(0, 200),
              }))
              return { ok: true, results, count: results.length, source: 'serper' }
            }
          }

          return {
            error: 'No search API key configured. Set BRAVE_SEARCH_API_KEY or SERPER_API_KEY in environment variables.',
          }
        } catch (err) {
          return { error: `Search failed: ${err instanceof Error ? err.message : 'unknown error'}` }
        }
      },
    }),

    save_memory: tool({
      description: 'Save a project insight to persistent memory. Use when you discover project patterns, architectural decisions, user preferences, or known issues. Memory persists across sessions for this project. Max 5KB total per project.',
      inputSchema: z.object({
        key: z.string().describe('Memory key (e.g., "framework", "conventions", "known_issues", "architecture")'),
        value: z.string().describe('The value to remember'),
      }),
      execute: async ({ key, value }) => {
        if (!projectId) return { error: 'Cannot save memory without a project' }

        // Load existing memory
        const getResult = await supabaseFetch(`/forge_projects?id=eq.${projectId}&select=memory`)
        if (!getResult.ok) return { error: 'Failed to load project memory' }
        const existing = (Array.isArray(getResult.data) && getResult.data[0]?.memory) || {}
        const memory = typeof existing === 'object' ? { ...existing } : {}

        // Check 5KB limit
        memory[key] = value
        const serialized = JSON.stringify(memory)
        if (serialized.length > 5120) {
          return { error: `Memory would exceed 5KB limit (${serialized.length} bytes). Remove some entries first.` }
        }

        // Save
        const saveResult = await supabaseFetch(`/forge_projects?id=eq.${projectId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memory }),
        })
        if (!saveResult.ok) return { error: `Failed to save memory: ${JSON.stringify(saveResult.data)}` }
        return { ok: true, key, value, totalKeys: Object.keys(memory).length, sizeBytes: serialized.length }
      },
    }),

    load_memory: tool({
      description: 'Load all saved memory entries for this project. Returns the full memory object with all key-value pairs.',
      inputSchema: z.object({}),
      execute: async () => {
        if (!projectId) return { error: 'Cannot load memory without a project' }

        const result = await supabaseFetch(`/forge_projects?id=eq.${projectId}&select=memory`)
        if (!result.ok) return { error: 'Failed to load project memory' }
        const memory = (Array.isArray(result.data) && result.data[0]?.memory) || {}
        const keys = typeof memory === 'object' ? Object.keys(memory) : []
        return {
          memory: typeof memory === 'object' ? memory : {},
          count: keys.length,
          message: keys.length === 0
            ? 'No memory saved for this project yet.'
            : `Loaded ${keys.length} memory entries: ${keys.join(', ')}`,
        }
      },
    }),

    save_preference: tool({
      description: 'Save a learned user preference for future sessions. Use this when you notice the user consistently prefers certain patterns (color schemes, component libraries, naming conventions, code style). Preferences persist across projects.',
      inputSchema: z.object({
        key: z.string().describe('Preference key (e.g., "color_palette", "component_style", "naming_convention", "preferred_libraries", "code_style")'),
        value: z.string().describe('The preference value or description'),
      }),
      execute: async ({ key, value }) => {
        if (!ctx.projectId) return { error: 'Cannot save preferences without a session' }

        const result = await supabaseFetch('/forge_user_preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates' },
          body: JSON.stringify({
            github_username: ctx.githubUsername || 'unknown',
            preference_key: key,
            preference_value: value,
            updated_at: new Date().toISOString(),
          }),
        })
        if (!result.ok) return { error: `Failed to save preference: ${JSON.stringify(result.data)}` }
        return { saved: true, key, value }
      },
    }),

    load_preferences: tool({
      description: 'Load all saved user preferences. Call at the start of a session to personalize outputs based on learned preferences.',
      inputSchema: z.object({}),
      execute: async () => {
        const result = await supabaseFetch(`/forge_user_preferences?github_username=eq.${encodeURIComponent(ctx.githubUsername || 'unknown')}&order=updated_at.desc`)
        if (!result.ok) return { error: `Failed to load preferences: ${JSON.stringify(result.data)}` }
        const prefs = Array.isArray(result.data) ? result.data : []
        if (prefs.length === 0) return { preferences: [], message: 'No saved preferences yet. Learn and save them as you work.' }
        return {
          preferences: prefs.map((p: any) => ({
            key: p.preference_key,
            value: p.preference_value,
            updated: p.updated_at,
          })),
          message: `Loaded ${prefs.length} preference(s). Apply these to your outputs.`,
        }
      },
    }),
  }
}
