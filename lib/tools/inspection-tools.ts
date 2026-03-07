import { tool } from 'ai'
import { z } from 'zod'
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

export function createInspectionTools(ctx: ToolContext) {
  const { vfs } = ctx

  return {
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
            fixes.push('Remove or modify X-Frame-Options header in next.config.mjs or middleware.ts')
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

        if (isTsx && /\buse(State|Effect|Ref|Callback|Memo|Context|Reducer)\s*\(/.test(content)) {
          if (!content.includes("'use client'") && !content.includes('"use client"')) {
            errors.push("Missing 'use client' directive — file uses React hooks but has no client directive")
          }
        }

        const importRegex = /from\s+['"](\.\/?[^'"]+|@\/[^'"]+|~\/[^'"]+)['"]/g
        let match
        while ((match = importRegex.exec(content)) !== null) {
          const importPath = match[1]
          if (importPath.startsWith('.') || importPath.startsWith('@/') || importPath.startsWith('~/')) {
            const basePath = importPath.startsWith('@/')
              ? importPath.replace('@/', '')
              : importPath.startsWith('~/')
                ? importPath.replace('~/', '')
                : resolvePath(path, importPath)
            const candidates = [basePath, `${basePath}.ts`, `${basePath}.tsx`, `${basePath}/index.ts`, `${basePath}/index.tsx`, `${basePath}.js`, `${basePath}.jsx`]
            const found = candidates.some(c => vfs.exists(c))
            if (!found) {
              errors.push(`Import not found: '${importPath}' — no matching file in project`)
            }
          }
        }

        if (isTsx) {
          const imgWithoutAlt = content.match(/<img\s+(?![^>]*\balt\b)[^>]*>/g)
          if (imgWithoutAlt) {
            warnings.push(`${imgWithoutAlt.length} <img> tag(s) missing alt attribute — add descriptive alt text for accessibility`)
          }
        }

        const consoleLogs = (content.match(/console\.(log|debug)\(/g) || []).length
        if (consoleLogs > 0) {
          warnings.push(`${consoleLogs} console.log/debug call(s) found — remove before production`)
        }

        if (isTs) {
          const anyTypes = (content.match(/:\s*any\b/g) || []).length
          if (anyTypes > 2) {
            warnings.push(`${anyTypes} uses of 'any' type — consider using specific types`)
          }
        }

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
      description: 'Request a screenshot capture of the current preview panel. The client will capture the iframe content and return it as a base64 data URL. Use this after building or modifying UI components to visually verify your output looks correct.',
      inputSchema: z.object({
        reason: z.string().optional().describe('Why you want to capture the preview'),
      }),
      execute: async ({ reason }) => ({
        action: 'capture_preview',
        reason: reason || 'Visual review of current output',
        instruction: 'The preview capture has been requested. The client will respond with a screenshot. Review it carefully for layout, styling, and accessibility issues.',
      }),
    }),

    check_coherence: tool({
      description: 'Check cross-file consistency: verify imports resolve, shared types match, and API routes align with frontend expectations. Call after creating or modifying multiple related files.',
      inputSchema: z.object({
        paths: z.array(z.string()).describe('File paths to check for cross-file coherence'),
      }),
      execute: async ({ paths }) => {
        const issues: string[] = []
        const fileContents = new Map<string, string>()

        for (const p of paths) {
          const content = vfs.read(p)
          if (content) fileContents.set(p, content)
          else issues.push(`File not found: ${p}`)
        }

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

        const exports = new Map<string, string[]>()
        for (const [filePath, content] of fileContents) {
          const exportMatches = content.matchAll(/export\s+(?:interface|type|function|const)\s+(\w+)/g)
          for (const m of exportMatches) {
            if (!exports.has(m[1])) exports.set(m[1], [])
            exports.get(m[1])!.push(filePath)
          }
        }

        const warnings: string[] = []
        for (const [filePath, content] of fileContents) {
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

        for (const [typeName, exportFiles] of exports) {
          const importedAnywhere = [...fileContents].some(([fp, content]) =>
            !exportFiles.includes(fp) && new RegExp(`\\b${typeName}\\b`).test(content)
          )
          if (!importedAnywhere && fileContents.size > 1) {
            warnings.push(`${exportFiles[0]}: exports '${typeName}' but it's not imported by any other checked file`)
          }
        }

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

    search_references: tool({
      description: 'Search the reference component library for high-quality examples. Use before generating any UI component to find proven patterns to adapt.',
      inputSchema: z.object({
        query: z.string().describe('What type of component or pattern to search for'),
        category: z.string().optional().describe('Filter by category'),
        source: z.string().optional().describe('Filter by source codebase'),
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
      description: 'Get the full source code of a reference component by name. Use after search_references finds a relevant match.',
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
  }
}
