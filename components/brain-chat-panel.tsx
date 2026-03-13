'use client'

import { useState, useEffect, useRef } from 'react'
import { Send, Brain } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'


interface ChatMessage {
  id: string
  message: string
  timestamp: string
  sender: 'brain' | 'owner'
  read?: boolean
}

interface BrainChatPanelProps {
  className?: string
}

export function BrainChatPanel({ className }: BrainChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load chat messages from brain state
  const loadMessages = async () => {
    try {
      const response = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get-state' })
      })
      const data = await response.json()
      if (data.success && data.state?.chatMessages) {
        setMessages(data.state.chatMessages)
      }
    } catch (error) {
      console.error('Failed to load chat messages:', error)
    }
  }

  // Send message to brain
  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return
    
    setSending(true)
    try {
      const response = await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'inject-message',
          message: newMessage.trim(),
          sender: 'owner'
        })
      })
      
      if (response.ok) {
        setNewMessage('')
        // Reload messages to show the new one
        setTimeout(loadMessages, 100)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setSending(false)
    }
  }

  // Mark messages as read
  const markAsRead = async () => {
    try {
      await fetch('/api/brain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark-chat-read' })
      })
      loadMessages()
    } catch (error) {
      console.error('Failed to mark messages as read:', error)
    }
  }

  // Load messages on mount and periodically
  useEffect(() => {
    loadMessages()
    markAsRead()
    const interval = setInterval(loadMessages, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [])

  // Auto scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const formatTime = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString('en-US', { 
        hour12: false, 
        hour: '2-digit', 
        minute: '2-digit' 
      })
    } catch {
      return timestamp
    }
  }

  return (
    <div className={`flex flex-col h-full bg-background ${className}`}>
      <div className="flex items-center gap-2 p-3 border-b">
        <Brain className="w-5 h-5 text-blue-500" />
        <h3 className="font-semibold">Brain Chat</h3>
        <div className="text-sm text-muted-foreground">
          {messages.length} messages
        </div>
      </div>

      <div className="flex-1 p-3 overflow-y-auto" ref={scrollRef}>
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              No messages yet. Say hello to your AI!
            </div>
          ) : (
            messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.sender === 'owner' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-lg px-3 py-2 ${
                    msg.sender === 'owner'
                      ? 'bg-blue-500 text-white'
                      : 'bg-muted text-foreground'
                  }`}
                >
                  <div className="break-words">{msg.message}</div>
                  <div
                    className={`text-xs mt-1 ${
                      msg.sender === 'owner' ? 'text-blue-100' : 'text-muted-foreground'
                    }`}
                  >
                    {formatTime(msg.timestamp)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="p-3 border-t">
        <div className="flex gap-2">
          <Input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Message your AI..."
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            disabled={sending}
          />
          <Button onClick={sendMessage} disabled={!newMessage.trim() || sending}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}