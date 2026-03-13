'use client'

import { useEffect } from 'react'
import { toast } from 'sonner'

declare global {
  interface Window {
    __pichiShowUpdateToast?: () => void
  }
}

export function SWUpdateToast() {
  useEffect(() => {
    window.__pichiShowUpdateToast = () => {
      toast('New version available', {
        description: 'Refresh to get the latest updates.',
        action: {
          label: 'Refresh',
          onClick: () => window.location.reload(),
        },
        duration: Infinity,
      })
    }
    return () => { delete window.__pichiShowUpdateToast }
  }, [])

  return null
}
