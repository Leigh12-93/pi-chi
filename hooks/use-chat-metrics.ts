'use client'

import { useMemo, useCallback } from 'react'
import type { UIMessage } from 'ai'
import { getMessageText, type ToolInvocation } from '@/lib/chat/tool-utils'
import { estimateCost } from '@/lib/chat/constants'

/** Extended message shape that includes optional metadata and legacy toolInvocations */
interface PiUIMessage extends UIMessage {
  metadata?: {
    usage?: { totalTokens?: number; inputTokens?: number; outputTokens?: number }
    model?: string
    autoRouted?: boolean
  }
  toolInvocations?: ToolInvocation[]
}

/** Part shape used when extracting tool information from message.parts */
interface MessagePart {
  type: string
  text?: string
  toolName?: string
  toolCallId?: string
  state?: string
  input?: Record<string, unknown>
  args?: Record<string, unknown>
  toolInvocation?: ToolInvocation
}

export function useChatMetrics(messages: UIMessage[]) {
  const { stepCount, estimatedTokens, currentActivity, lastCompletedToolName } = useMemo(() => {
    let steps = 0
    let tokens = 0
    let activity: { toolName: string; args: Record<string, unknown> } | null = null
    const allCompleted: Array<{ toolName: string; args: Record<string, unknown> }> = []
    let currentResponseCompleted: Array<{ toolName: string; args: Record<string, unknown> }> = []

    for (const msg of messages) {
      const textLen = getMessageText(msg).length
      tokens += Math.ceil(textLen / 4)
      if (msg.role !== 'assistant') continue
      const msgCompleted: Array<{ toolName: string; args: Record<string, unknown> }> = []
      const parts = msg.parts as MessagePart[] | undefined
      if (parts) {
        for (const p of parts) {
          const isTool = p.type === 'tool-invocation' || p.type?.startsWith('tool-')
          if (!isTool) continue
          steps++
          const tName = p.toolInvocation?.toolName || p.toolName || p.type?.replace(/^tool-/, '') || ''
          const tArgs = p.toolInvocation?.args || p.input || p.args || {}
          const tState = p.toolInvocation?.state || p.state || ''
          const isRunning = tState !== 'result' && tState !== 'output-available' && tState !== 'output-error'
          if (isRunning) {
            activity = { toolName: tName, args: tArgs }
          } else {
            allCompleted.push({ toolName: tName, args: tArgs })
            msgCompleted.push({ toolName: tName, args: tArgs })
          }
        }
      }
      const invs = (msg as PiUIMessage).toolInvocations
      if (invs) steps += invs.length
      if (msgCompleted.length > 0 || activity) {
        currentResponseCompleted = msgCompleted
      }
    }

    const lastCompleted = allCompleted.length > 0
      ? allCompleted[allCompleted.length - 1].toolName
      : null

    return {
      stepCount: steps,
      estimatedTokens: tokens,
      lastCompletedToolName: lastCompleted,
      currentActivity: activity
        ? { ...activity, recentCompleted: currentResponseCompleted }
        : currentResponseCompleted.length > 0
          ? { toolName: '', args: {}, recentCompleted: currentResponseCompleted }
          : null,
    }
  }, [messages])

  const realTokens = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as PiUIMessage
      if (msg.role === 'assistant' && msg.metadata?.usage?.totalTokens) {
        return msg.metadata.usage.totalTokens
      }
    }
    return 0
  }, [messages])

  const autoRoutedModel = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i] as PiUIMessage
      if (msg.role === 'assistant' && msg.metadata?.autoRouted) {
        return { model: String(msg.metadata.model || ''), reason: 'Auto-routed' }
      }
    }
    return null
  }, [messages])

  const sessionCost = useMemo(() => {
    let totalCost = 0
    let totalInput = 0
    let totalOutput = 0
    for (const msg of messages) {
      const meta = (msg as PiUIMessage).metadata
      if (meta?.usage && meta?.model) {
        const inTok = meta.usage.inputTokens || 0
        const outTok = meta.usage.outputTokens || 0
        totalInput += inTok
        totalOutput += outTok
        totalCost += estimateCost(inTok, outTok, meta.model)
      }
    }
    return { cost: totalCost, inputTokens: totalInput, outputTokens: totalOutput }
  }, [messages])

  const getMessageCost = useCallback((msgId: string) => {
    const msg = messages.find(m => m.id === msgId) as PiUIMessage | undefined
    if (!msg?.metadata?.usage || !msg?.metadata?.model) return null
    const { inputTokens = 0, outputTokens = 0 } = msg.metadata.usage
    const cost = estimateCost(inputTokens, outputTokens, msg.metadata.model)
    return { inputTokens, outputTokens, cost, model: msg.metadata.model }
  }, [messages])

  return {
    stepCount, estimatedTokens, realTokens, autoRoutedModel,
    currentActivity, lastCompletedToolName,
    sessionCost, getMessageCost,
  }
}
