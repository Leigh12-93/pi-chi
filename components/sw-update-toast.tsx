'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

declare global {
  interface Window {
    __sixchiShowUpdateToast?: () => void
  }
}

export function SWUpdateToast() {
  useEffect(() => {
    window.__sixchiShowUpdateToast = () => {
      toast('New version available', {
        description: 'Refresh to get the latest updates.',
        action: {
          label: 'Refresh',
          onClick: () => window.location.reload(),
        },
        duration: Infinity,
      })
    }
    return () => { delete window.__sixchiShowUpdateToast }
  }, [])

  return null
}
