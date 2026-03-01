import { tool } from 'ai'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { SUPABASE_URL, SUPABASE_KEY } from '@/lib/supabase-fetch'
import type { ToolContext } from './types'

export function createDbTools(ctx: ToolContext) {
  const { vfs, projectId, supabaseFetch } = ctx

  return {
    db_query: tool({
      description: 'Query the Supabase database. Restricted to forge_* tables and credit_packages (read-only). Tables: forge_projects, forge_project_files, forge_chat_messages, forge_deployments, forge_tasks, credit_packages.',
      inputSchema: z.object({
        table: z.string().describe('Table name, e.g. "forge_projects"'),
        select: z.string().optional().describe('Columns to select, e.g. "id, name, created_at" (default: *)'),
        filters: z.string().optional().describe('PostgREST filter query string, e.g. "status=eq.active&limit=10"'),
        order: z.string().optional().describe('Order clause, e.g. "created_at.desc"'),
        limit: z.number().optional().describe('Max rows to return (default: 50)'),
      }),
      execute: async ({ table, select, filters, order, limit }) => {
        // Security: restrict to forge_* tables + credit_packages read-only
        const ALLOWED_TABLES = /^(forge_|credit_packages$)/
        if (!ALLOWED_TABLES.test(table)) {
          return { error: `Access denied: db_query restricted to forge_* tables. "${table}" is not allowed.` }
        }

        const params = new URLSearchParams()
        if (select) params.set('select', select)
        if (order) params.set('order', order)
        params.set('limit', String(limit || 50))

        const filterStr = filters ? `&${filters}` : ''
        const result = await supabaseFetch(`/${table}?${params.toString()}${filterStr}`)

        if (!result.ok) return { error: `DB query failed: ${JSON.stringify(result.data)}` }
        return { data: result.data, count: Array.isArray(result.data) ? result.data.length : 1 }
      },
    }),

    db_mutate: tool({
      description: 'Insert, update, or delete data in forge_* tables in the Supabase database.',
      inputSchema: z.object({
        operation: z.enum(['insert', 'update', 'upsert', 'delete']).describe('Operation type'),
        table: z.string().describe('Table name (must start with forge_)'),
        data: z.any().optional().describe('Data to insert/update (object or array of objects)'),
        filters: z.string().optional().describe('PostgREST filter for update/delete, e.g. "id=eq.abc123"'),
        onConflict: z.string().optional().describe('For upsert: conflict column(s), e.g. "project_id,path"'),
      }),
      execute: async ({ operation, table, data, filters, onConflict }) => {
        // Security: restrict to forge_* tables only
        if (!table.startsWith('forge_')) {
          return { error: `Access denied: can only mutate forge_* tables, got "${table}"` }
        }

        const path = `/${table}`
        const filterStr = filters ? `?${filters}` : ''

        switch (operation) {
          case 'insert': {
            const result = await supabaseFetch(path, {
              method: 'POST',
              body: JSON.stringify(data),
            })
            return result.ok ? { ok: true, data: result.data } : { error: JSON.stringify(result.data) }
          }
          case 'upsert': {
            const headers: Record<string, string> = {}
            if (onConflict) headers['Prefer'] = `return=representation,resolution=merge-duplicates`
            const queryStr = onConflict ? `?on_conflict=${onConflict}` : ''
            const result = await supabaseFetch(`${path}${queryStr}`, {
              method: 'POST',
              headers,
              body: JSON.stringify(data),
            })
            return result.ok ? { ok: true, data: result.data } : { error: JSON.stringify(result.data) }
          }
          case 'update': {
            const result = await supabaseFetch(`${path}${filterStr}`, {
              method: 'PATCH',
              body: JSON.stringify(data),
            })
            return result.ok ? { ok: true, data: result.data } : { error: JSON.stringify(result.data) }
          }
          case 'delete': {
            if (!filters || !filters.trim()) {
              return { error: 'DELETE requires at least one filter. Refusing to delete entire table.' }
            }
            const result = await supabaseFetch(`${path}${filterStr}`, {
              method: 'DELETE',
            })
            return result.ok ? { ok: true } : { error: JSON.stringify(result.data) }
          }
        }
      },
    }),

    db_introspect: tool({
      description: 'Discover the schema of a Supabase table — columns, types, constraints. Restricted to forge_* and credit_packages tables.',
      inputSchema: z.object({
        table: z.string().describe('Table name to inspect, e.g. "forge_projects"'),
      }),
      execute: async ({ table }) => {
        // Validate table name (alphanumeric + underscores only)
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table)) {
          return { error: 'Invalid table name. Use only letters, numbers, and underscores.' }
        }
        // Security: restrict to forge_* tables + credit_packages
        const ALLOWED_TABLES = /^(forge_|credit_packages$)/
        if (!ALLOWED_TABLES.test(table)) {
          return { error: `Access denied: db_introspect restricted to forge_* tables. "${table}" is not allowed.` }
        }

        // Step 1: Check table exists and get row count
        const countRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=0`, {
          method: 'GET',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Accept': 'application/json',
            'Prefer': 'count=exact',
          },
        })

        if (!countRes.ok) return { error: `Table "${table}" not found or not accessible (${countRes.status})` }

        const contentRange = countRes.headers.get('content-range')
        const totalRows = contentRange ? contentRange.split('/')[1] : 'unknown'

        // Step 2: Read 1 sample row and infer column names + types
        const sampleRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=1`, {
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Accept': 'application/json',
          },
        })

        if (sampleRes.ok) {
          const sample = await sampleRes.json()
          if (Array.isArray(sample) && sample.length > 0) {
            const columns = Object.entries(sample[0]).map(([name, value]) => ({
              column_name: name,
              inferred_type: value === null ? 'unknown' : Array.isArray(value) ? 'array' : typeof value,
              sample_value: typeof value === 'string' ? value.slice(0, 50) : value,
            }))
            return { table, totalRows, columns }
          }
        }

        return { table, totalRows, columns: [], note: 'Table exists but is empty — no columns could be inferred' }
      },
    }),

    save_project: tool({
      description: 'Save the current project files to the database. Call this after significant changes to persist the user\'s work.',
      inputSchema: z.object({
        description: z.string().optional().describe('Updated project description'),
      }),
      execute: async ({ description }) => {
        if (!projectId) return { ok: false, note: 'No project ID — project will be saved client-side when user signs in' }

        const files = vfs.toRecord()
        const filePaths = Object.keys(files)

        // Update project metadata
        const updates: Record<string, unknown> = {}
        if (description) updates.description = description
        if (Object.keys(updates).length > 0) {
          await supabase.from('forge_projects').update(updates).eq('id', projectId)
        }

        // Delete removed files — use safe parameterized filtering
        if (filePaths.length > 0) {
          const { data: existingFiles } = await supabase
            .from('forge_project_files')
            .select('path')
            .eq('project_id', projectId)

          const pathsToDelete = (existingFiles || [])
            .map((f: any) => f.path)
            .filter((p: string) => !filePaths.includes(p))

          if (pathsToDelete.length > 0) {
            await supabase
              .from('forge_project_files')
              .delete()
              .eq('project_id', projectId)
              .in('path', pathsToDelete)
          }
        }

        // Upsert current files in batches of 50 to avoid payload limits
        if (filePaths.length > 0) {
          const rows = filePaths.map(path => ({
            project_id: projectId,
            path,
            content: files[path],
          }))
          const BATCH_SIZE = 50
          for (let i = 0; i < rows.length; i += BATCH_SIZE) {
            const batch = rows.slice(i, i + BATCH_SIZE)
            const upsertRes = await supabaseFetch(`/forge_project_files`, {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify(batch),
            })
            if (!upsertRes.ok) return { error: `Failed to save files (batch ${Math.floor(i / BATCH_SIZE) + 1})` }
          }
        }

        return { ok: true, savedFiles: filePaths.length }
      },
    }),
  }
}
