'use client'

import { useRef, useEffect, useCallback } from 'react'

/* ─── Types ──────────────────────────────────────── */

interface UsePiTerminalOptions {
  /** Whether the terminal tab/panel is currently visible */
  isVisible: boolean
  /** Welcome banner lines (defaults to "Pi-Chi Agent Terminal") */
  banner?: string[]
  /** Prompt color escape code (default: cyan \x1b[36m) */
  promptColor?: string
}

interface UsePiTerminalReturn {
  /** Ref to attach to the terminal container div */
  containerRef: React.RefObject<HTMLDivElement | null>
  /** Whether the terminal has been initialized */
  isReady: boolean
  /** Programmatically run a command */
  runCommand: (cmd: string) => Promise<void>
  /** Clear the terminal screen */
  clear: () => void
}

/* ─── Hook ───────────────────────────────────────── */

export function usePiTerminal({
  isVisible,
  banner = [
    '\x1b[36m  Pi-Chi Agent Terminal\x1b[0m',
    '\x1b[90m  Real system shell — commands execute on the host.\x1b[0m',
    '',
  ],
  promptColor = '\x1b[36m',
}: UsePiTerminalOptions): UsePiTerminalReturn {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const xtermRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const inputBufferRef = useRef('')
  const cwdRef = useRef('~')
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(-1)
  const runningRef = useRef(false)
  const isReadyRef = useRef(false)

  // Prompt helper — uses ref so it always reads the latest cwd
  const PROMPT = useCallback(
    () => `${promptColor}pi-chi\x1b[0m:\x1b[34m${cwdRef.current}\x1b[0m$ `,
    [promptColor],
  )

  // Execute a command against /api/terminal
  const executeCommand = useCallback(
    async (terminal: any, cmd: string) => {
      // Handle built-in commands
      if (/^cd\s/.test(cmd) || cmd === 'cd') {
        const dir = cmd.replace(/^cd\s*/, '').trim() || '~'
        cwdRef.current = dir.startsWith('/')
          ? dir
          : dir === '~'
            ? '~'
            : `${cwdRef.current === '~' ? '~' : cwdRef.current}/${dir}`
        terminal.write(PROMPT())
        return
      }
      if (cmd === 'clear') {
        terminal.clear()
        terminal.write(PROMPT())
        return
      }

      runningRef.current = true
      terminal.write('\x1b[90m running...\x1b[0m\r\n')

      try {
        const res = await fetch('/api/terminal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            command: cmd,
            cwd: cwdRef.current === '~' ? undefined : cwdRef.current,
            timeout: 30000,
          }),
        })
        const result = await res.json()
        terminal.write('\x1b[A\x1b[2K')

        if (result.stdout) terminal.writeln(result.stdout.replace(/\n$/, ''))
        if (result.stderr)
          terminal.writeln(
            `\x1b[31m${result.stderr.replace(/\n$/, '')}\x1b[0m`,
          )
        if (result.error && !result.stdout && !result.stderr)
          terminal.writeln(`\x1b[31m${result.error}\x1b[0m`)
        if (result.warnings)
          result.warnings.forEach((w: string) =>
            terminal.writeln(`\x1b[33m${w}\x1b[0m`),
          )
        if (result.exitCode !== 0)
          terminal.writeln(`\x1b[90mexit code: ${result.exitCode}\x1b[0m`)
        if (result.cwd)
          cwdRef.current = result.cwd.replace(/^.*[/\\]/, '') || '/'
      } catch (err) {
        terminal.write('\x1b[A\x1b[2K')
        terminal.writeln(
          `\x1b[31mFetch error: ${err instanceof Error ? err.message : 'unknown'}\x1b[0m`,
        )
      }

      runningRef.current = false
      terminal.write(PROMPT())
    },
    [PROMPT],
  )

  // Initialize xterm when the terminal becomes visible
  useEffect(() => {
    if (!isVisible || !containerRef.current || xtermRef.current) return

    let cancelled = false

    async function initTerminal() {
      const { Terminal } = await import('@xterm/xterm')
      const { FitAddon } = await import('@xterm/addon-fit')
      if (cancelled || !containerRef.current) return

      const fitAddon = new FitAddon()
      const terminal = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily:
          'Geist Mono, JetBrains Mono, Menlo, Monaco, Courier New, monospace',
        theme: {
          background: '#0a0a0f',
          foreground: '#e4e4e7',
          cursor: '#00d4ff',
          selectionBackground: '#00d4ff30',
          black: '#18181b',
          red: '#ef4444',
          green: '#22c55e',
          yellow: '#eab308',
          blue: '#3b82f6',
          magenta: '#a78bfa',
          cyan: '#06b6d4',
          white: '#e4e4e7',
        },
        allowProposedApi: true,
      })

      terminal.loadAddon(fitAddon)
      terminal.open(containerRef.current!)
      fitAddon.fit()
      xtermRef.current = terminal
      fitAddonRef.current = fitAddon
      isReadyRef.current = true

      // Banner
      for (const line of banner) {
        terminal.writeln(line)
      }
      terminal.write(PROMPT())

      // Input handler
      terminal.onData(async (data: string) => {
        if (runningRef.current) return
        const code = data.charCodeAt(0)

        if (data === '\r') {
          // Enter
          terminal.writeln('')
          const cmd = inputBufferRef.current.trim()
          inputBufferRef.current = ''
          historyIndexRef.current = -1

          if (!cmd) {
            terminal.write(PROMPT())
            return
          }

          historyRef.current.unshift(cmd)
          if (historyRef.current.length > 100) historyRef.current.pop()

          await executeCommand(terminal, cmd)
        } else if (data === '\x7f' || data === '\b') {
          // Backspace
          if (inputBufferRef.current.length > 0) {
            inputBufferRef.current = inputBufferRef.current.slice(0, -1)
            terminal.write('\b \b')
          }
        } else if (data === '\x1b[A') {
          // Up arrow — history
          if (historyRef.current.length > 0) {
            const idx = Math.min(
              historyIndexRef.current + 1,
              historyRef.current.length - 1,
            )
            historyIndexRef.current = idx
            terminal.write(
              '\r' +
                PROMPT() +
                ' '.repeat(inputBufferRef.current.length) +
                '\r' +
                PROMPT(),
            )
            inputBufferRef.current = historyRef.current[idx]
            terminal.write(inputBufferRef.current)
          }
        } else if (data === '\x1b[B') {
          // Down arrow — history
          if (historyIndexRef.current > 0) {
            historyIndexRef.current--
            terminal.write(
              '\r' +
                PROMPT() +
                ' '.repeat(inputBufferRef.current.length) +
                '\r' +
                PROMPT(),
            )
            inputBufferRef.current =
              historyRef.current[historyIndexRef.current]
            terminal.write(inputBufferRef.current)
          } else if (historyIndexRef.current === 0) {
            historyIndexRef.current = -1
            terminal.write(
              '\r' +
                PROMPT() +
                ' '.repeat(inputBufferRef.current.length) +
                '\r' +
                PROMPT(),
            )
            inputBufferRef.current = ''
          }
        } else if (code === 3) {
          // Ctrl+C
          inputBufferRef.current = ''
          terminal.writeln('^C')
          terminal.write(PROMPT())
        } else if (code >= 32) {
          // Printable character
          inputBufferRef.current += data
          terminal.write(data)
        }
      })

      // Auto-fit on resize
      const observer = new ResizeObserver(() => {
        try {
          fitAddon.fit()
        } catch {}
      })
      observer.observe(containerRef.current!)
    }

    initTerminal()
    return () => {
      cancelled = true
    }
  }, [isVisible, banner, PROMPT, executeCommand])

  // Programmatic command execution
  const runCommand = useCallback(
    async (cmd: string) => {
      if (!xtermRef.current) return
      await executeCommand(xtermRef.current, cmd)
    },
    [executeCommand],
  )

  // Clear the terminal
  const clear = useCallback(() => {
    if (!xtermRef.current) return
    xtermRef.current.clear()
    xtermRef.current.write(PROMPT())
  }, [PROMPT])

  return {
    containerRef,
    isReady: isReadyRef.current,
    runCommand,
    clear,
  }
}
