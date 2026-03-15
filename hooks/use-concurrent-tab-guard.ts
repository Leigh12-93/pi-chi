import { useState, useEffect } from 'react'

/**
 * Detects when the same project is being edited in multiple browser tabs.
 * Uses BroadcastChannel API to coordinate between tabs.
 */
export function useConcurrentTabGuard(projectId: string | null) {
  const [concurrentTabWarning, setConcurrentTabWarning] = useState(false)

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return
    const bc = new BroadcastChannel('pi_project_edit')
    // Announce when we start editing a project
    if (projectId) {
      bc.postMessage({ type: 'editing', projectId })
    }
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'editing' && e.data.projectId === projectId && projectId) {
        setConcurrentTabWarning(true)
      }
      // Other tab is asking who's editing — respond
      if (e.data?.type === 'ping' && e.data.projectId === projectId && projectId) {
        bc.postMessage({ type: 'editing', projectId })
      }
    }
    bc.addEventListener('message', handler)
    // Ask if anyone else is already editing this project
    if (projectId) {
      bc.postMessage({ type: 'ping', projectId })
    }
    return () => { bc.removeEventListener('message', handler); bc.close() }
  }, [projectId])

  return { concurrentTabWarning, setConcurrentTabWarning }
}
