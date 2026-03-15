import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

interface VitalsResponse {
  cpu: number
  memory: { used: number; total: number }
  disk: { used: number; total: number }
  temp?: number
  uptime: number
  ip?: string
  ssid?: string
  timestamp: string
}

/** Run a shell command, returning stdout or null on failure */
async function run(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(cmd, { timeout: 5000 })
    return stdout.trim()
  } catch {
    return null
  }
}

/** Parse CPU usage from `top -bn1` output */
function parseCpu(raw: string | null): number {
  if (!raw) return -1
  // Format: %Cpu(s):  5.9 us,  1.2 sy,  0.0 ni, 92.5 id, ...
  const match = raw.match(/(\d+\.?\d*)\s*id/)
  if (match) return Math.round((100 - parseFloat(match[1])) * 10) / 10
  // Alternative: sum us + sy
  const us = raw.match(/(\d+\.?\d*)\s*us/)
  const sy = raw.match(/(\d+\.?\d*)\s*sy/)
  if (us && sy) return Math.round((parseFloat(us[1]) + parseFloat(sy[1])) * 10) / 10
  return -1
}

/** Parse memory from `free -m` output */
function parseMemory(raw: string | null): { used: number; total: number } {
  if (!raw) return { used: -1, total: -1 }
  // Mem:  total  used  free  shared  buff/cache  available
  const lines = raw.split('\n')
  const memLine = lines.find(l => l.startsWith('Mem:'))
  if (!memLine) return { used: -1, total: -1 }
  const parts = memLine.split(/\s+/)
  const total = parseInt(parts[1], 10)
  const used = parseInt(parts[2], 10)
  return { used, total }
}

/** Parse disk usage from `df -h /` output */
function parseDisk(raw: string | null): { used: number; total: number } {
  if (!raw) return { used: -1, total: -1 }
  // Filesystem  Size  Used  Avail  Use%  Mounted on
  const lines = raw.split('\n')
  const dataLine = lines.find(l => l.includes('/'))
  if (!dataLine) return { used: -1, total: -1 }
  const parts = dataLine.split(/\s+/)
  // Convert human-readable (e.g. "29G", "15G") to MB
  const toMB = (s: string): number => {
    const num = parseFloat(s)
    if (s.endsWith('T')) return num * 1024 * 1024
    if (s.endsWith('G')) return num * 1024
    if (s.endsWith('M')) return num
    if (s.endsWith('K')) return num / 1024
    return num
  }
  return { used: Math.round(toMB(parts[2])), total: Math.round(toMB(parts[1])) }
}

/** Parse temperature from thermal zone (millidegrees) */
function parseTemp(raw: string | null): number | undefined {
  if (!raw) return undefined
  const val = parseInt(raw, 10)
  if (isNaN(val)) return undefined
  // Value is in millidegrees Celsius
  return Math.round(val / 100) / 10
}

/** Parse uptime in seconds from `uptime -s` (boot timestamp) */
function parseUptime(raw: string | null): number {
  if (!raw) return -1
  const bootTime = new Date(raw)
  if (isNaN(bootTime.getTime())) return -1
  return Math.round((Date.now() - bootTime.getTime()) / 1000)
}

/** GET /api/vitals — system vitals (CPU, memory, disk, temperature, uptime) */
export async function GET() {
  // Run all commands in parallel for speed
  const [cpuRaw, memRaw, diskRaw, tempRaw, uptimeRaw, ipRaw, ssidRaw] = await Promise.all([
    run("top -bn1 | grep 'Cpu'"),
    run('free -m'),
    run('df -h /'),
    run('cat /sys/class/thermal/thermal_zone0/temp'),
    run('uptime -s'),
    run("hostname -I 2>/dev/null | awk '{print $1}'"),
    run('iwgetid -r 2>/dev/null'),
  ])

  const vitals: VitalsResponse = {
    cpu: parseCpu(cpuRaw),
    memory: parseMemory(memRaw),
    disk: parseDisk(diskRaw),
    temp: parseTemp(tempRaw),
    uptime: parseUptime(uptimeRaw),
    ip: ipRaw || undefined,
    ssid: ssidRaw || undefined,
    timestamp: new Date().toISOString(),
  }

  return NextResponse.json(vitals, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
