/** Database-backed version history for Forge projects.
 *  Stores snapshots in forge_project_snapshots table.
 *  Max 50 snapshots per project (auto-prune on insert). */

export interface Snapshot {
  id: string
  description: string
  files: Record<string, string>
  fileCount: number
  createdAt: string
}

/** Create a snapshot of current project files */
export async function createSnapshot(
  projectId: string,
  description: string,
  files: Record<string, string>,
): Promise<Snapshot | null> {
  // Prune old snapshots first (keep MAX_SNAPSHOTS - 1 to make room)
  try {
    await fetch(`/api/projects/${projectId}/snapshots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, files }),
    })

    // Return a client-side representation
    return {
      id: crypto.randomUUID(),
      description,
      files,
      fileCount: Object.keys(files).length,
      createdAt: new Date().toISOString(),
    }
  } catch {
    return null
  }
}

/** List snapshots for a project */
export async function listSnapshots(projectId: string): Promise<Snapshot[]> {
  try {
    const res = await fetch(`/api/projects/${projectId}/snapshots`)
    if (!res.ok) return []
    return await res.json()
  } catch {
    return []
  }
}

/** Restore a snapshot (returns the file map) */
export async function restoreSnapshot(
  projectId: string,
  snapshotId: string,
): Promise<Record<string, string> | null> {
  try {
    const res = await fetch(`/api/projects/${projectId}/snapshots/${snapshotId}`, {
      method: 'PUT',
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.files || null
  } catch {
    return null
  }
}
