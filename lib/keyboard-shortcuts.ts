import { useEffect, useRef } from 'react'

export interface KeyboardShortcut {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
  action: () => void
  description: string
}

/**
 * Register keyboard shortcuts. Uses a stable ref so the keydown listener
 * is only attached once — callers can pass inline arrays without causing
 * listener churn, and callbacks always see the latest closure values.
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const shortcutsRef = useRef(shortcuts)
  shortcutsRef.current = shortcuts

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcutsRef.current) {
        const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase()
        const ctrlMatches = !!shortcut.ctrlKey === event.ctrlKey
        const metaMatches = !!shortcut.metaKey === event.metaKey
        const shiftMatches = !!shortcut.shiftKey === event.shiftKey
        const altMatches = !!shortcut.altKey === event.altKey

        if (keyMatches && ctrlMatches && metaMatches && shiftMatches && altMatches) {
          event.preventDefault()
          shortcut.action()
          break
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])
}

export const COMMON_SHORTCUTS = {
  SAVE: { key: 's', ctrlKey: true, description: 'Save current file' },
  NEW_FILE: { key: 'n', ctrlKey: true, description: 'New file' },
  OPEN_FILE: { key: 'o', ctrlKey: true, description: 'Open file' },
  CLOSE_FILE: { key: 'w', ctrlKey: true, description: 'Close current file' },
  TOGGLE_PREVIEW: { key: 'p', ctrlKey: true, shiftKey: true, description: 'Toggle preview' },
  TOGGLE_SIDEBAR: { key: 'b', ctrlKey: true, description: 'Toggle sidebar' },
  COMMAND_PALETTE: { key: 'p', ctrlKey: true, description: 'Command palette' },
  FOCUS_CHAT: { key: '/', ctrlKey: true, description: 'Focus chat input' },
} as const