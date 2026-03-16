/* ─── SIM7600 USB Modem Driver ────────────────────────────────── */

import { EventEmitter } from 'node:events'

// serialport + parser-readline are only installed on the Pi (ARM prebuilds).
// We use dynamic imports via a runtime helper so tsc passes on Windows
// without the modules present.

/* eslint-disable @typescript-eslint/no-explicit-any */
type SerialPortType = any
type ReadlineParserType = any

// Bypass tsc static module resolution for Pi-only deps
async function requireSerial(): Promise<{ SerialPort: any }> {
  const mod = 'serialport'
  return import(mod)
}
async function requireParser(): Promise<{ ReadlineParser: any }> {
  const mod = '@serialport/parser-readline'
  return import(mod)
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface ModemStatus {
  connected: boolean
  port: string | null
  signalStrength: number
  simReady: boolean
  registered: boolean
}

interface ReceivedSms {
  from: string
  body: string
  receivedAt: string
}

interface PendingCommand {
  command: string
  resolve: (lines: string[]) => void
  reject: (err: Error) => void
  timer: ReturnType<typeof setTimeout>
  responseLines: string[]
}

const PROBE_PORTS = ['/dev/ttyUSB0', '/dev/ttyUSB1', '/dev/ttyUSB2', '/dev/ttyUSB3']
const COMMAND_TIMEOUT_MS = 10_000
const SEND_PROMPT_TIMEOUT_MS = 15_000
const RECONNECT_BASE_MS = 10_000
const RECONNECT_MAX_MS = 120_000

export class Sim7600 extends EventEmitter {
  private port: SerialPortType | null = null
  private parser: ReadlineParserType | null = null
  private pending: PendingCommand | null = null
  private status: ModemStatus = {
    connected: false,
    port: null,
    signalStrength: 0,
    simReady: false,
    registered: false,
  }
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private closing = false
  private sendCount = 0
  private errorCount = 0

  // ── Public API ──────────────────────────────────────────────────

  async connect(): Promise<void> {
    const detectedPort = await this.probePort()
    if (!detectedPort) {
      throw new Error('No SIM7600 modem found on /dev/ttyUSB0-3')
    }
    await this.openPort(detectedPort)
    await this.initModem()
    this.status.connected = true
    this.reconnectAttempts = 0
    this.emit('status-change', this.getStatus())
    console.log(`[sim7600] Connected on ${detectedPort}`)
  }

  async sendSms(to: string, body: string): Promise<void> {
    if (!this.status.connected || !this.port) {
      throw new Error('Modem not connected')
    }

    // Sanitize: single line, max 160 chars for single SMS
    const clean = body.replace(/[\r\n]+/g, ' ').trim().slice(0, 300)
    if (!clean) throw new Error('Empty message')

    // AT+CMGS="<number>"
    const response = await this.sendCommandRaw(`AT+CMGS="${to}"\r\n`, SEND_PROMPT_TIMEOUT_MS, '>')
    if (!response.includes('>')) {
      throw new Error('Modem did not send > prompt')
    }

    // Write body + Ctrl-Z
    const sendResult = await new Promise<string[]>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending = null
        reject(new Error('SMS send timeout'))
      }, SEND_PROMPT_TIMEOUT_MS)

      this.pending = {
        command: 'SMS_BODY',
        resolve,
        reject,
        timer,
        responseLines: [],
      }

      this.port!.write(`${clean}\x1A`)
    })

    const cmgsLine = sendResult.find(l => l.includes('+CMGS:'))
    if (!cmgsLine) {
      const errorLine = sendResult.find(l => l.includes('ERROR'))
      throw new Error(`SMS send failed: ${errorLine || 'no +CMGS response'}`)
    }

    this.sendCount++
    console.log(`[sim7600] SMS sent to ${to}: ${clean.slice(0, 50)}...`)
  }

  getStatus(): ModemStatus & { sendCount: number; errorCount: number } {
    return { ...this.status, sendCount: this.sendCount, errorCount: this.errorCount }
  }

  async close(): Promise<void> {
    this.closing = true
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.pending) {
      clearTimeout(this.pending.timer)
      this.pending.reject(new Error('Modem closing'))
      this.pending = null
    }
    if (this.port?.isOpen) {
      await new Promise<void>((resolve) => {
        this.port!.close((err: Error | null) => {
          if (err) console.error('[sim7600] Close error:', err.message)
          resolve()
        })
      })
    }
    this.port = null
    this.parser = null
    this.status.connected = false
    this.emit('status-change', this.getStatus())
    console.log('[sim7600] Closed')
  }

  // ── Port Detection ──────────────────────────────────────────────

  private async probePort(): Promise<string | null> {
    const { SerialPort } = await requireSerial()

    for (const path of PROBE_PORTS) {
      try {
        const ok = await new Promise<boolean>((resolve) => {
          const probe = new SerialPort({ path, baudRate: 115200, autoOpen: false })
          const timeout = setTimeout(() => {
            try { probe.close() } catch { /* */ }
            resolve(false)
          }, 3000)

          probe.open((err: Error | null) => {
            if (err) { clearTimeout(timeout); resolve(false); return }

            let buf = ''
            probe.on('data', (data: Buffer) => { buf += data.toString() })

            probe.write('AT\r\n')
            setTimeout(() => {
              clearTimeout(timeout)
              const hasOk = buf.includes('OK')
              try { probe.close() } catch { /* */ }
              resolve(hasOk)
            }, 1500)
          })
        })

        if (ok) {
          console.log(`[sim7600] Found modem at ${path}`)
          return path
        }
      } catch {
        // Port doesn't exist or busy
      }
    }
    return null
  }

  // ── Port Management ─────────────────────────────────────────────

  private async openPort(path: string): Promise<void> {
    const { SerialPort } = await requireSerial()
    const { ReadlineParser } = await requireParser()

    this.port = new SerialPort({ path, baudRate: 115200, autoOpen: false })
    this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }))

    // Wire up data handler
    this.parser.on('data', (line: string) => this.handleLine(line))

    // Wire up error/close for reconnection
    this.port.on('error', (err: Error) => {
      console.error('[sim7600] Port error:', err.message)
      this.errorCount++
      this.handleDisconnect()
    })
    this.port.on('close', () => {
      if (!this.closing) {
        console.log('[sim7600] Port closed unexpectedly')
        this.handleDisconnect()
      }
    })

    // Open
    await new Promise<void>((resolve, reject) => {
      this.port!.open((err: Error | null) => {
        if (err) reject(new Error(`Failed to open ${path}: ${err.message}`))
        else resolve()
      })
    })

    this.status.port = path
  }

  // ── AT Command Queue ────────────────────────────────────────────

  private sendCommand(cmd: string, timeoutMs = COMMAND_TIMEOUT_MS): Promise<string[]> {
    return this.sendCommandRaw(`${cmd}\r\n`, timeoutMs)
  }

  private sendCommandRaw(raw: string, timeoutMs: number, earlyMatch?: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      if (!this.port?.isOpen) {
        reject(new Error('Port not open'))
        return
      }

      // Wait for any pending command
      const waitAndSend = () => {
        if (this.pending) {
          setTimeout(waitAndSend, 100)
          return
        }

        const timer = setTimeout(() => {
          this.pending = null
          reject(new Error(`AT command timeout: ${raw.trim()}`))
        }, timeoutMs)

        this.pending = { command: raw.trim(), resolve, reject, timer, responseLines: [] }
        if (earlyMatch) {
          (this.pending as PendingCommand & { earlyMatch?: string }).earlyMatch = earlyMatch
        }
        this.port!.write(raw)
      }

      waitAndSend()
    })
  }

  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return

    // Unsolicited notification: incoming SMS
    if (trimmed.startsWith('+CMTI:')) {
      this.handleIncomingSmsNotification(trimmed)
      return
    }

    // Feed to pending command
    if (this.pending) {
      this.pending.responseLines.push(trimmed)

      // Check early match (for > prompt)
      const earlyMatch = (this.pending as PendingCommand & { earlyMatch?: string }).earlyMatch
      if (earlyMatch && trimmed.includes(earlyMatch)) {
        clearTimeout(this.pending.timer)
        const result = this.pending.responseLines
        this.pending.resolve(result)
        this.pending = null
        return
      }

      // Check for terminal responses
      if (trimmed === 'OK' || trimmed.startsWith('ERROR') || trimmed.startsWith('+CMS ERROR') || trimmed.startsWith('+CMGS:')) {
        clearTimeout(this.pending.timer)
        const result = this.pending.responseLines
        if (trimmed.startsWith('ERROR') || trimmed.startsWith('+CMS ERROR')) {
          this.pending.reject(new Error(`AT error: ${trimmed}`))
        } else {
          this.pending.resolve(result)
        }
        this.pending = null
      }
    }
  }

  // ── Init Sequence ───────────────────────────────────────────────

  private async initModem(): Promise<void> {
    console.log('[sim7600] Running init sequence...')

    // Enable full functionality
    await this.sendCommand('AT+CFUN=1')

    // Check SIM
    const pinResponse = await this.sendCommand('AT+CPIN?')
    this.status.simReady = pinResponse.some(l => l.includes('READY'))
    if (!this.status.simReady) {
      console.warn('[sim7600] SIM not ready:', pinResponse.join(' '))
    }

    // Wait for network registration (up to 30s)
    for (let i = 0; i < 6; i++) {
      const regResponse = await this.sendCommand('AT+CREG?')
      const regLine = regResponse.find(l => l.includes('+CREG:'))
      if (regLine) {
        const match = regLine.match(/\+CREG:\s*\d+,(\d+)/)
        const regStatus = match ? parseInt(match[1], 10) : 0
        if (regStatus === 1 || regStatus === 5) {
          this.status.registered = true
          break
        }
      }
      if (i < 5) await new Promise(r => setTimeout(r, 5000))
    }

    if (!this.status.registered) {
      console.warn('[sim7600] Not registered on network — SMS may fail')
    }

    // Text mode
    await this.sendCommand('AT+CMGF=1')

    // GSM charset
    await this.sendCommand('AT+CSCS="GSM"')

    // Enable +CMTI notifications for incoming SMS
    await this.sendCommand('AT+CNMI=2,1,0,0,0')

    // Signal strength
    const csqResponse = await this.sendCommand('AT+CSQ')
    const csqLine = csqResponse.find(l => l.includes('+CSQ:'))
    if (csqLine) {
      const match = csqLine.match(/\+CSQ:\s*(\d+)/)
      this.status.signalStrength = match ? parseInt(match[1], 10) : 0
    }

    // Clear old messages from SIM storage
    try {
      await this.sendCommand('AT+CMGDA="DEL ALL"')
    } catch {
      // Some modems don't support CMGDA — try deleting individually
      console.log('[sim7600] CMGDA not supported, skipping old message cleanup')
    }

    console.log(`[sim7600] Init complete — SIM: ${this.status.simReady}, Reg: ${this.status.registered}, Signal: ${this.status.signalStrength}`)
  }

  // ── Incoming SMS ────────────────────────────────────────────────

  private async handleIncomingSmsNotification(line: string): Promise<void> {
    // +CMTI: "SM",<index>
    const match = line.match(/\+CMTI:\s*"[^"]*",\s*(\d+)/)
    if (!match) return

    const index = parseInt(match[1], 10)
    console.log(`[sim7600] Incoming SMS at index ${index}`)

    try {
      const readResponse = await this.sendCommand(`AT+CMGR=${index}`)
      // Parse: +CMGR: "REC UNREAD","+61412345678","","26/03/16,10:30:00+40"
      // Next line is the body
      const headerLine = readResponse.find(l => l.includes('+CMGR:'))
      if (!headerLine) return

      const fromMatch = headerLine.match(/\+CMGR:\s*"[^"]*","([^"]+)"/)
      const from = fromMatch ? fromMatch[1] : 'unknown'

      // Body is the line after +CMGR header, before OK
      const headerIdx = readResponse.indexOf(headerLine)
      const bodyLines: string[] = []
      for (let i = headerIdx + 1; i < readResponse.length; i++) {
        if (readResponse[i] === 'OK') break
        bodyLines.push(readResponse[i])
      }
      const body = bodyLines.join(' ').trim()

      if (body) {
        const sms: ReceivedSms = {
          from,
          body,
          receivedAt: new Date().toISOString(),
        }
        this.emit('sms-received', sms)
        console.log(`[sim7600] Received SMS from ${from}: ${body.slice(0, 50)}`)
      }

      // Delete the read message
      try {
        await this.sendCommand(`AT+CMGD=${index}`)
      } catch {
        console.warn(`[sim7600] Failed to delete message at index ${index}`)
      }
    } catch (err) {
      console.error('[sim7600] Failed to read incoming SMS:', err instanceof Error ? err.message : err)
      this.errorCount++
    }
  }

  // ── Reconnection ────────────────────────────────────────────────

  private handleDisconnect(): void {
    if (this.closing) return

    this.status.connected = false
    this.status.registered = false
    this.emit('status-change', this.getStatus())

    // Clear pending command
    if (this.pending) {
      clearTimeout(this.pending.timer)
      this.pending.reject(new Error('Modem disconnected'))
      this.pending = null
    }

    this.scheduleReconnect()
  }

  private scheduleReconnect(): void {
    if (this.closing || this.reconnectTimer) return

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(1.5, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    )
    this.reconnectAttempts++

    console.log(`[sim7600] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})...`)

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      try {
        // Clean up old port
        if (this.port) {
          try { this.port.removeAllListeners(); this.port.close() } catch { /* */ }
          this.port = null
          this.parser = null
        }
        await this.connect()
      } catch (err) {
        console.error('[sim7600] Reconnect failed:', err instanceof Error ? err.message : err)
        this.scheduleReconnect()
      }
    }, delay)
  }
}

export type { ReceivedSms, ModemStatus }
