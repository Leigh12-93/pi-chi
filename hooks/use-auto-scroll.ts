'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import type { UIMessage } from 'ai'

export function useAutoScroll(messages: UIMessage[], isLoading: boolean) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const [showNewMessageIndicator, setShowNewMessageIndicator] = useState(false)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 150
    isNearBottomRef.current = nearBottom
    setShowNewMessageIndicator(!nearBottom)
  }, [])

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    setShowNewMessageIndicator(false)
  }, [])

  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isLoading])

  return { messagesEndRef, showNewMessageIndicator, handleScroll, scrollToBottom }
}
