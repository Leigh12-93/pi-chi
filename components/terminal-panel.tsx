'use client'

import { useEffect, useRef, useState, memo } from 'react'
import { Terminal as TerminalIcon, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import '@xterm/xterm/css/xterm.css'

interface TerminalPanelProps {
  getShellProcess: () => Promise<any>
  wcReady: boolean
  className?: string
}

export const TerminalPanel = memo(function TerminalPanel({ getShellProcess, wcReady, className }: TerminalPanelProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const shellRef = useRef<any>(null)
  const writerRef = useRef<WritableStreamDefaultWriter | null>(null)
  const [ready, setReady] = useState(false)
  const [maximized, setMaximized] = useState(false)
  const [waitingTooLong, setWaitingTooLong] = useState(false)

  // Show "unavailable" message after 10s of !wcReady
  useEffect(() => {
    if (wcReady) {
      setWaitingTooLong(false)
      return
    }
    const timer = setTimeout(() => setWaitingTooLong(true), 10_000)
    return () => clearTimeout(timer)
  }, [wcReady])

  // Initialize xterm + connect to WebContainer shell
  useEffect(() => {
    if (!wcReady || !terminalRef.current) return

    let cancelled = false

    async function init() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')

      if (cancelled || !terminalRef.current) return

      const fitAddon = new FitAddon()
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: 'JetBrains Mono, Menlo, Monaco, Courier New, monospace',
        theme: {
          background: '#0a0a0f',
          foreground: '#e4e4e7',
          cursor: '#a78bfa',
          selectionBackground: '#a78bfa40',
          black: '#18181b',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
          blue: '#3b82f6',
          magenta: '#a78bfa',
          cyan: '#06b6d4',
          white: '#e4e4e7',
          brightBlack: '#52525b',
          brightRed: '#f87171',
          brightGreen: '#4ade80',
          brightYellow: '#facc15',
          brightBlue: '#60a5fa',
          brightMagenta: '#c4b5fd',
          brightCyan: '#22d3ee',
          brightWhite: '#fafafa',
        },
        allowProposedApi: true,
      })

      terminal.loadAddon(fitAddon)
      terminal.open(terminalRef.current!)
      fitAddon.fit()

      xtermRef.current = terminal
      fitAddonRef.current = fitAddon

      try {
        const shell = await getShellProcess()
        shellRef.current = shell

        // Pipe shell output to xterm
        shell.output.pipeTo(new WritableStream({
          write(data: string) {
            if (!cancelled) terminal.write(data)
          },
        }))

        // Pipe xterm input to shell
        const writer = shell.input.getWriter()
        writerRef.current = writer

        terminal.onData((data: string) => {
          writer.write(data)
        })

        if (!cancelled) setReady(true)
      } catch (err) {
        terminal.writeln('\r\n\x1b[31mFailed to start shell. WebContainer may not be ready.\x1b[0m')
      }
    }

    init()

    return () => {
      cancelled = true
      if (writerRef.current) {
        try { writerRef.current.close() } catch (e) { console.warn('[pi:terminal] Error closing writer:', e) }
      }
      if (xtermRef.current) {
        xtermRef.current.dispose()
        xtermRef.current = null
      }
    }
  }, [wcReady, getShellProcess])

  // Fit terminal on resize
  useEffect(() => {
    if (!fitAddonRef.current) return

    const observer = new ResizeObserver(() => {
      try { fitAddonRef.current?.fit() } catch (e) { console.warn('[pi:terminal] Error fitting terminal:', e) }
    })

    if (terminalRef.current) {
      observer.observe(terminalRef.current)
    }

    return () => observer.disconnect()
  }, [ready])

  return (
    <div className={cn(
      'flex flex-col bg-[#0a0a0f] h-full',
      maximized && 'fixed inset-0 z-50',
      className,
    )}>
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-pi-border bg-pi-panel">
        <div className="flex items-center gap-2 text-xs text-pi-text-dim">
          <TerminalIcon className="w-3.5 h-3.5" />
          <span>Terminal</span>
          {!wcReady && !waitingTooLong && (
            <span className="text-yellow-500 animate-pulse">Starting...</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMaximized(prev => !prev)}
            className="p-1 text-pi-text-dim hover:text-pi-text rounded transition-colors"
          >
            {maximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
      {!wcReady && waitingTooLong && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center max-w-xs">
            <TerminalIcon className="w-8 h-8 text-pi-text-dim/30 mx-auto mb-3" />
            <p className="text-xs text-pi-text-dim mb-1">Terminal unavailable</p>
            <p className="text-[10px] text-pi-text-dim/50">
              The v0 sandbox is handling your preview. Terminal requires WebContainer which is not currently active.
            </p>
          </div>
        </div>
      )}
      <div ref={terminalRef} className={cn('flex-1 p-1', !wcReady && waitingTooLong && 'hidden')} />
    </div>
  )
})
