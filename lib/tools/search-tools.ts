import { tool } from 'ai'
import { z } from 'zod'
import type { ToolContext } from './types'

export function createSearchTools(_ctx: ToolContext) {
  return {
    web_search: tool({
      description: 'Search the web for documentation, API references, library info, or solutions. Returns top results with title, URL, and snippet.',
      inputSchema: z.object({
        query: z.string().describe('Search query — be specific for better results'),
        count: z.number().optional().default(5).describe('Number of results to return (max 10)'),
      }),
      execute: async ({ query, count }) => {
        const numResults = Math.min(count || 5, 10)
        try {
          const braveKey = (process.env.BRAVE_SEARCH_API_KEY || '').trim()
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

          const serperKey = (process.env.SERPER_API_KEY || '').trim()
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
  }
}
