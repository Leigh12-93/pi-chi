'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import type { WebContainer } from '@webcontainer/api'
import {
  getWebContainer,
  teardownWebContainer,
  mountAndStart,
  filesToFileSystemTree,
  type WcStatus,
} from '@/lib/webcontainer'

export interface UseWebcontainerOptions {
  files: Record<string, string>
  enabled?: boolean
  onTerminalOutput?: (data: string) => void
}

export interface UseWebcontainerReturn {
  status: WcStatus
  previewUrl: string | null
  error: string | null
  instance: WebContainer | null
  /** Write a single file to the running WebContainer */
  syncFile: (path: string, content: string) => Promise<void>
  /** Delete a file from the running WebContainer */
  deleteFile: (path: string) => Promise<void>
  /** Remount all files (e.g., after project scaffold) */
  remount: (files: Record<string, string>) => Promise<void>
  /** Spawn a shell command, return output */
  spawn: (cmd: string, args?: string[]) => Promise<{ output: string; exitCode: number }>
  /** Get a writable shell process for the terminal */
  getShellProcess: () => Promise<any>
  /** Restart the dev server */
  restartDevServer: () => Promise<void>
}

export function useWebcontainer({ files, enabled = true, onTerminalOutput }: UseWebcontainerOptions): UseWebcontainerReturn {
  const [status, setStatus] = useState<WcStatus>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const instanceRef = useRef<WebContainer | null>(null)
  const serverProcessRef = useRef<any>(null)
  const bootedRef = useRef(false)
  const mountedFilesRef = useRef<Record<string, string>>({})
  const outputCallbackRef = useRef(onTerminalOutput)
  outputCallbackRef.current = onTerminalOutput

  // Boot WebContainer once
  useEffect(() => {
    if (!enabled || bootedRef.current) return
    bootedRef.current = true

    let cancelled = false

    async function boot() {
      try {
        setStatus('booting')
        setError(null)

        const wc = await getWebContainer()
        if (cancelled) return

        instanceRef.current = wc

        const result = await mountAndStart(wc, files, {
          onInstallOutput: (data) => outputCallbackRef.current?.(data),
          onServerOutput: (data) => outputCallbackRef.current?.(data),
          onServerReady: (url, port) => {
            if (!cancelled) {
              setPreviewUrl(url)
              setStatus('ready')
            }
          },
          onError: (err) => {
            if (!cancelled) setError(err)
          },
          onStatusChange: (s) => {
            if (!cancelled) setStatus(s)
          },
        })

        if (!cancelled) {
          serverProcessRef.current = result.serverProcess
          mountedFilesRef.current = { ...files }
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to boot WebContainer')
          setStatus('error')
        }
      }
    }

    boot()

    return () => {
      cancelled = true
    }
  }, [enabled]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync individual file to WebContainer
  const syncFile = useCallback(async (path: string, content: string) => {
    const wc = instanceRef.current
    if (!wc) return

    try {
      // Ensure parent directories exist
      const parts = path.split('/')
      if (parts.length > 1) {
        const dirPath = parts.slice(0, -1).join('/')
        await wc.fs.mkdir(dirPath, { recursive: true })
      }
      await wc.fs.writeFile(path, content)
      mountedFilesRef.current[path] = content
    } catch (err: any) {
      console.warn(`WebContainer syncFile failed for ${path}:`, err.message)
    }
  }, [])

  // Delete a file
  const deleteFile = useCallback(async (path: string) => {
    const wc = instanceRef.current
    if (!wc) return
    try {
      await wc.fs.rm(path)
      delete mountedFilesRef.current[path]
    } catch {
      // File may not exist in WebContainer
    }
  }, [])

  // Full remount (e.g., after create_project)
  const remount = useCallback(async (newFiles: Record<string, string>) => {
    const wc = instanceRef.current
    if (!wc) return

    // Kill existing server
    if (serverProcessRef.current) {
      serverProcessRef.current.kill()
      serverProcessRef.current = null
    }

    setPreviewUrl(null)
    setStatus('mounting')

    const tree = filesToFileSystemTree(newFiles)
    await wc.mount(tree)
    mountedFilesRef.current = { ...newFiles }

    // Re-install and restart
    const result = await mountAndStart(wc, newFiles, {
      onInstallOutput: (data) => outputCallbackRef.current?.(data),
      onServerOutput: (data) => outputCallbackRef.current?.(data),
      onServerReady: (url) => {
        setPreviewUrl(url)
        setStatus('ready')
      },
      onError: (err) => setError(err),
      onStatusChange: setStatus,
    })

    serverProcessRef.current = result.serverProcess
  }, [])

  // Spawn a command
  const spawn = useCallback(async (cmd: string, args: string[] = []): Promise<{ output: string; exitCode: number }> => {
    const wc = instanceRef.current
    if (!wc) return { output: 'WebContainer not ready', exitCode: 1 }

    const process = await wc.spawn(cmd, args)
    let output = ''

    process.output.pipeTo(new WritableStream({
      write(data) {
        output += data
        outputCallbackRef.current?.(data)
      },
    }))

    const exitCode = await process.exit
    return { output, exitCode }
  }, [])

  // Get an interactive shell (for terminal panel)
  const getShellProcess = useCallback(async () => {
    const wc = instanceRef.current
    if (!wc) throw new Error('WebContainer not ready')
    return wc.spawn('jsh', [], { terminal: { cols: 80, rows: 24 } })
  }, [])

  // Restart dev server
  const restartDevServer = useCallback(async () => {
    const wc = instanceRef.current
    if (!wc) return

    if (serverProcessRef.current) {
      serverProcessRef.current.kill()
      serverProcessRef.current = null
    }

    setPreviewUrl(null)
    setStatus('starting')

    const serverProcess = await wc.spawn('npm', ['run', 'dev'])
    serverProcessRef.current = serverProcess

    serverProcess.output.pipeTo(new WritableStream({
      write(data) { outputCallbackRef.current?.(data) },
    }))

    wc.on('server-ready', (port: number, url: string) => {
      setPreviewUrl(url)
      setStatus('ready')
    })
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (serverProcessRef.current) {
        serverProcessRef.current.kill()
      }
    }
  }, [])

  return {
    status,
    previewUrl,
    error,
    instance: instanceRef.current,
    syncFile,
    deleteFile,
    remount,
    spawn,
    getShellProcess,
    restartDevServer,
  }
}
