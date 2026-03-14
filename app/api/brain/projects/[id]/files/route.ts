/* ─── Project File Content API ─────────────────────────────── */

import { NextResponse } from 'next/server'
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const PROJECTS_DIR = join(homedir(), 'pi-chi-projects')
const MAX_FILE_SIZE = 512 * 1024 // 512KB max

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { searchParams } = new URL(req.url)
  const filePath = searchParams.get('path')

  if (!filePath) {
    return NextResponse.json({ error: 'path parameter required' }, { status: 400 })
  }

  // Prevent path traversal
  if (filePath.includes('..') || filePath.startsWith('/')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 })
  }

  // Find project directory by id
  let projectDir: string | null = null

  if (id.startsWith('legacy-')) {
    const name = id.replace('legacy-', '')
    const candidate = join(PROJECTS_DIR, name)
    if (existsSync(candidate)) {
      projectDir = statSync(candidate).isDirectory() ? candidate : PROJECTS_DIR
    }
  } else {
    const entries = readdirSync(PROJECTS_DIR, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const manifestPath = join(PROJECTS_DIR, entry.name, 'pi-project.json')
      if (existsSync(manifestPath)) {
        try {
          const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
          if (manifest.id === id) {
            projectDir = join(PROJECTS_DIR, entry.name)
            break
          }
        } catch { /* skip */ }
      }
    }
  }

  if (!projectDir) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  const fullPath = join(projectDir, filePath)

  // Security: ensure resolved path is still within projects dir
  const { resolve } = await import('node:path')
  const resolved = resolve(fullPath)
  if (!resolved.startsWith(resolve(PROJECTS_DIR))) {
    return NextResponse.json({ error: 'Path escapes project directory' }, { status: 403 })
  }

  if (!existsSync(fullPath)) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }

  const stat = statSync(fullPath)
  if (stat.isDirectory()) {
    return NextResponse.json({ error: 'Path is a directory' }, { status: 400 })
  }

  if (stat.size > MAX_FILE_SIZE) {
    return NextResponse.json({
      error: `File too large (${Math.round(stat.size / 1024)}KB, max ${MAX_FILE_SIZE / 1024}KB)`,
      size: stat.size,
    }, { status: 413 })
  }

  try {
    const content = readFileSync(fullPath, 'utf-8')
    const ext = filePath.split('.').pop()?.toLowerCase() || ''

    return NextResponse.json({
      content,
      path: filePath,
      size: stat.size,
      language: getLanguage(ext),
    })
  } catch {
    return NextResponse.json({ error: 'Could not read file (binary?)' }, { status: 422 })
  }
}

function getLanguage(ext: string): string {
  const map: Record<string, string> = {
    py: 'python', ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    sh: 'bash', json: 'json', html: 'html', css: 'css', md: 'markdown',
    yaml: 'yaml', yml: 'yaml', toml: 'toml', sql: 'sql', txt: 'text',
    csv: 'text', log: 'text', xml: 'xml', rs: 'rust', go: 'go',
    java: 'java', kt: 'kotlin', c: 'c', cpp: 'cpp', h: 'c',
  }
  return map[ext] || 'text'
}
