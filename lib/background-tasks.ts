/**
 * Background task management for long-running operations.
 *
 * Two modes:
 * 1. In-request TaskStore — Map-based, lives in closure during streamText() execution
 * 2. Persistent tasks — Supabase-backed, survives across HTTP requests
 */

// Type for the supabaseFetch helper used in chat/route.ts
type SupabaseFetch = (path: string, options?: RequestInit) => Promise<{ data: unknown; status: number; ok: boolean }>

// Module-level map: taskId → AbortController for persistent tasks
const persistentControllers = new Map<string, AbortController>()

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
    operation: (onProgress: (msg: string) => Promise<void>) => Promise<unknown>,
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

    // Create an AbortController for this task
    const controller = new AbortController()
    persistentControllers.set(taskId, controller)

    // Progress callback — patches the task row's progress field
    const onProgress = async (msg: string) => {
      await sbFetch(`/forge_tasks?id=eq.${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify({ progress: msg }),
      })
    }

    // Fire-and-forget: run operation and update the row when done
    ;(async () => {
      try {
        const result = await operation(onProgress)
        if (controller.signal.aborted) return // cancelled while running
        await sbFetch(`/forge_tasks?id=eq.${taskId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'completed',
            result: typeof result === 'object' ? result : { value: result },
          }),
        })
      } catch (err) {
        if (controller.signal.aborted) return // cancelled — row already patched
        try {
          await sbFetch(`/forge_tasks?id=eq.${taskId}`, {
            method: 'PATCH',
            body: JSON.stringify({
              status: 'failed',
              error: err instanceof Error ? err.message : String(err),
            }),
          })
        } catch {
          // Status update failed — task will stay "running" in DB
          console.error(`Failed to update task ${taskId} status:`, err)
        }
      } finally {
        persistentControllers.delete(taskId)
      }
    })()

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

  /**
   * Cancel a running persistent task. Aborts the controller and patches the DB row.
   */
  static async cancelPersistent(
    sbFetch: SupabaseFetch,
    taskId: string,
  ): Promise<{ ok: boolean; error?: string }> {
    const controller = persistentControllers.get(taskId)
    if (controller) {
      controller.abort()
      persistentControllers.delete(taskId)
    }

    // Patch the row regardless — covers cases where the controller already finished
    const result = await sbFetch(`/forge_tasks?id=eq.${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'failed',
        error: 'Cancelled by user',
      }),
    })

    if (!result.ok) {
      return { ok: false, error: 'Failed to update task record' }
    }
    return { ok: true }
  }

  /**
   * Get the AbortSignal for a persistent task (pass to fetch calls, etc.)
   */
  static getSignal(taskId: string): AbortSignal | undefined {
    return persistentControllers.get(taskId)?.signal
  }

  /**
   * Clean up stale persistent tasks — marks any "running" tasks older than
   * maxAge as failed. Call periodically (e.g. on app boot or before listing tasks).
   */
  static async cleanupStale(
    sbFetch: SupabaseFetch,
    maxAgeMinutes: number = 10,
  ): Promise<{ cleaned: number }> {
    const cutoff = new Date(Date.now() - maxAgeMinutes * 60 * 1000).toISOString()

    // Step 1: Find stale task IDs before patching, so we know which controllers to abort
    const listResult = await sbFetch(
      `/forge_tasks?status=eq.running&created_at=lt.${cutoff}&select=id`,
      { method: 'GET' },
    )
    let staleIds: Set<string> = new Set()
    if (listResult.ok && Array.isArray(listResult.data)) {
      const rows = listResult.data as Array<{ id: string }>
      staleIds = new Set(rows.map(r => r.id))
    }

    // Step 2: Patch stale DB rows to "failed"
    let patched = 0
    if (staleIds.size > 0) {
      const patchResult = await sbFetch(
        `/forge_tasks?status=eq.running&created_at=lt.${cutoff}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'failed',
            error: `Stale task: no completion after ${maxAgeMinutes} minutes`,
          }),
        },
      )
      patched = patchResult.ok ? staleIds.size : 0
    }

    // Step 3: Only abort controllers for tasks we just marked as stale
    for (const staleId of staleIds) {
      const controller = persistentControllers.get(staleId)
      if (controller) {
        if (!controller.signal.aborted) controller.abort('Stale cleanup')
        persistentControllers.delete(staleId)
      }
    }

    return { cleaned: patched }
  }
}
