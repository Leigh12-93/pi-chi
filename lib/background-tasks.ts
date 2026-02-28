/**
 * Background task management for long-running operations.
 *
 * Two modes:
 * 1. In-request TaskStore — Map-based, lives in closure during streamText() execution
 * 2. Persistent tasks — Supabase-backed, survives across HTTP requests
 */

// Type for the supabaseFetch helper used in chat/route.ts
type SupabaseFetch = (path: string, options?: RequestInit) => Promise<{ data: unknown; status: number; ok: boolean }>

export interface TaskStatus {
  id: string
  type: string
  status: 'running' | 'completed' | 'failed'
  progress?: string
  result?: unknown
  error?: string
  created_at?: string
  updated_at?: string
}

interface InFlightTask {
  promise: Promise<unknown>
  status: 'running' | 'completed' | 'failed'
  result?: unknown
  error?: string
}

/**
 * In-request task store. Create one per request (in the POST handler closure).
 * Tracks fire-and-forget promises so the AI can poll them via check_task_status.
 */
export class TaskStore {
  private tasks = new Map<string, InFlightTask>()

  /**
   * Launch an async operation and track it. Returns immediately with the task ID.
   */
  launch(id: string, operation: () => Promise<unknown>): string {
    const entry: InFlightTask = {
      promise: Promise.resolve(),
      status: 'running',
    }

    entry.promise = operation()
      .then((result) => {
        entry.status = 'completed'
        entry.result = result
      })
      .catch((err) => {
        entry.status = 'failed'
        entry.error = err instanceof Error ? err.message : String(err)
      })

    this.tasks.set(id, entry)
    return id
  }

  /**
   * Check the status of an in-request task.
   */
  check(id: string): TaskStatus | null {
    const entry = this.tasks.get(id)
    if (!entry) return null
    return {
      id,
      type: 'in-request',
      status: entry.status,
      result: entry.result,
      error: entry.error,
    }
  }

  /**
   * Create a persistent task in Supabase and fire off the operation.
   * The operation updates the row when done (fire-and-forget within the request).
   */
  static async createPersistent(
    sbFetch: SupabaseFetch,
    projectId: string | null,
    type: string,
    operation: () => Promise<unknown>,
  ): Promise<{ taskId: string; error?: string }> {
    // Insert the task row
    const insertResult = await sbFetch('/forge_tasks', {
      method: 'POST',
      body: JSON.stringify({
        project_id: projectId,
        type,
        status: 'running',
      }),
    })

    if (!insertResult.ok || !Array.isArray(insertResult.data) || insertResult.data.length === 0) {
      return { taskId: '', error: 'Failed to create task record' }
    }

    const taskId = (insertResult.data[0] as { id: string }).id

    // Fire-and-forget: run operation and update the row when done
    operation()
      .then(async (result) => {
        await sbFetch(`/forge_tasks?id=eq.${taskId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'completed',
            result: typeof result === 'object' ? result : { value: result },
          }),
        })
      })
      .catch(async (err) => {
        await sbFetch(`/forge_tasks?id=eq.${taskId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
          }),
        })
      })

    return { taskId }
  }

  /**
   * Check a persistent task's status from Supabase.
   */
  static async checkPersistent(sbFetch: SupabaseFetch, taskId: string): Promise<TaskStatus | null> {
    const result = await sbFetch(`/forge_tasks?id=eq.${taskId}&select=*`)
    if (!result.ok || !Array.isArray(result.data) || result.data.length === 0) return null

    const row = result.data[0] as Record<string, unknown>
    return {
      id: row.id as string,
      type: row.type as string,
      status: row.status as TaskStatus['status'],
      progress: row.progress as string | undefined,
      result: row.result,
      error: row.error as string | undefined,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    }
  }
}
