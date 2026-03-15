import { useState, useEffect, useRef } from 'react'
import { hashFileMapDeep } from '@/lib/utils'

interface RestoreResult {
  projectId: string | null
  projectName: string | null
  files: Record<string, string>
  activeFile: string | null
  githubRepoUrl: string | null
  vercelUrl: string | null
}

/**
 * Restores a project from sessionStorage on initial page load.
 * Also fetches the full project data from the API.
 */
export function useProjectRestore(
  onRestore: (result: RestoreResult, hash: string) => void,
) {
  const restoredRef = useRef(false)
  const [restoringProject, setRestoringProject] = useState(false)

  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    try {
      const raw = sessionStorage.getItem('pi_active_project')
      if (!raw) return
      const stored: { id?: string; name?: string; activeFile?: string } = JSON.parse(raw)
      const { id, name } = stored
      if (id && name) {
        // Load the saved project from API
        setRestoringProject(true)
        fetch(`/api/projects/${id}`)
          .then(res => res.ok ? res.json() : null)
          .then(data => {
            if (data) {
              const hash = hashFileMapDeep(data.files || {})
              onRestore({
                projectId: data.id,
                projectName: data.name,
                files: data.files || {},
                activeFile: (stored.activeFile && data.files?.[stored.activeFile]) ? stored.activeFile : null,
                githubRepoUrl: data.github_repo_url || null,
                vercelUrl: data.vercel_url || null,
              }, hash)
            } else {
              // Project was deleted — clear storage
              sessionStorage.removeItem('pi_active_project')
            }
          })
          .catch(() => sessionStorage.removeItem('pi_active_project'))
          .finally(() => setRestoringProject(false))
      } else if (name) {
        // Unsaved project — just restore the name (files are lost on refresh)
        onRestore({
          projectId: null,
          projectName: name,
          files: {},
          activeFile: null,
          githubRepoUrl: null,
          vercelUrl: null,
        }, '')
      }
    } catch { /* ignore corrupt storage */ }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { restoringProject, setRestoringProject, restoredRef }
}
