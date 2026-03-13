'use client'

import { useRef, useEffect } from 'react'

export function usePreviewEvents(sendMessage: (opts: { text: string }) => void) {
  const diagnosedUrls = useRef(new Set<string>())

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail) return
      const parts: string[] = ['[Preview Capture Result]']
      if (detail.error) {
        parts.push(`Error: ${detail.error}`)
      } else {
        if (detail.title) parts.push(`Title: ${detail.title}`)
        if (detail.elementCount) parts.push(`Elements: ${detail.elementCount}`)
        if (detail.viewport) parts.push(`Viewport: ${detail.viewport.width}x${detail.viewport.height}`)
        if (detail.bodyText) parts.push(`\nVisible content:\n${detail.bodyText}`)
      }
      sendMessage({ text: parts.join('\n') })
    }
    window.addEventListener('pi:preview-captured', handler)
    return () => window.removeEventListener('pi:preview-captured', handler)
  }, [sendMessage])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.url) return
      const key = `preview-error:${detail.url}`
      if (diagnosedUrls.current.has(key)) return
      diagnosedUrls.current.add(key)
      sendMessage({
        text: `[PREVIEW ERROR] The preview at ${detail.url} failed to load (${detail.errorType || 'unknown'}). Please use diagnose_preview to check the headers and suggest fixes.`,
      })
    }
    window.addEventListener('pi:preview-error', handler)
    return () => window.removeEventListener('pi:preview-error', handler)
  }, [sendMessage])

  return { diagnosedUrls }
}
