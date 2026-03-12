'use client'

import { useState, useCallback } from 'react'
import type { FileUIPart } from 'ai'
import { toast } from 'sonner'

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml'])
const TEXT_EXTS = new Set([
  'ts','tsx','js','jsx','json','html','css','md','txt','yaml','yml','toml','xml','sql',
  'py','rb','go','rs','java','kt','swift','c','cpp','h','hpp','sh','bash','env',
  'gitignore','dockerignore','csv','log','ini','cfg','conf','vue','svelte','astro',
  'prisma','graphql','proto',
])
const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
const MAX_ATTACHMENTS = 10

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

export function useAttachments(onFileChange: (path: string, content: string) => void) {
  const [attachments, setAttachments] = useState<FileUIPart[]>([])

  const handleAttachFiles = useCallback(async (fileList: FileList) => {
    const newParts: FileUIPart[] = []
    let skipped = 0

    for (const file of Array.from(fileList)) {
      if (attachments.length + newParts.length >= MAX_ATTACHMENTS) {
        toast.error(`Max ${MAX_ATTACHMENTS} attachments`)
        break
      }
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name} too large (max 2MB)`)
        continue
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || ''

      if (IMAGE_TYPES.has(file.type)) {
        const dataUrl = await fileToDataUrl(file)
        newParts.push({ type: 'file', mediaType: file.type, url: dataUrl, filename: file.name })
      } else if (TEXT_EXTS.has(ext) || file.type.startsWith('text/')) {
        const text = await file.text()
        if (text.includes('\0')) { skipped++; continue }
        onFileChange(file.name, text)
        const dataUrl = `data:text/plain;base64,${btoa(unescape(encodeURIComponent(text)))}`
        newParts.push({ type: 'file', mediaType: 'text/plain', url: dataUrl, filename: file.name })
      } else if (file.type === 'application/pdf') {
        const dataUrl = await fileToDataUrl(file)
        newParts.push({ type: 'file', mediaType: 'application/pdf', url: dataUrl, filename: file.name })
      } else {
        skipped++
      }
    }

    if (skipped > 0) toast.info(`Skipped ${skipped} unsupported file(s)`)
    if (newParts.length > 0) setAttachments(prev => [...prev, ...newParts])
  }, [attachments, onFileChange])

  const handleRemoveAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index))
  }, [])

  return { attachments, setAttachments, handleAttachFiles, handleRemoveAttachment }
}
