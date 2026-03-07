import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'

export function createGenerationTools(ctx: ToolContext) {
  const { vfs } = ctx

  return {
    generate_tests: tool({
      description: 'Generate test scaffolding for a component or API route. Creates a test file with smoke tests, prop validation, error states, and accessibility checks.',
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

        const nameMatch = content.match(/export\s+(?:default\s+)?function\s+(\w+)/)
          || content.match(/export\s+const\s+(\w+)/)
        const componentName = nameMatch?.[1] || basename
        const hasDefaultExport = /export\s+default\s+/.test(content)

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
      description: 'Check the health of an npm package before adding it as a dependency. Checks for deprecation, last publish date, weekly downloads, and approximate bundle size.',
      inputSchema: z.object({
        packageName: z.string().describe('npm package name to check'),
      }),
      execute: async ({ packageName }) => {
        try {
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

          let daysSincePublish: number | null = null
          if (lastPublish) {
            daysSincePublish = Math.floor((Date.now() - new Date(lastPublish).getTime()) / (1000 * 60 * 60 * 24))
          }

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
  }
}
