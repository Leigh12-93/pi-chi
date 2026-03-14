/* ─── Projects API — List, detail, and run Pi-Chi projects ──── */

import { NextResponse } from 'next/server'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { execSync } from 'node:child_process'
import type { ProjectManifest } from '@/lib/brain/brain-types'

const PROJECTS_DIR = join(homedir(), 'pi-chi-projects')

function scanProjects(): Array<ProjectManifest & { legacy?: boolean }> {
  const results: Array<ProjectManifest & { legacy?: boolean }> = []

  if (!existsSync(PROJECTS_DIR)) return results

  const entries = readdirSync(PROJECTS_DIR, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      // Legacy flat file — wrap as unstructured project
      const filePath = join(PROJECTS_DIR, entry.name)
      const stat = statSync(filePath)
      results.push({
        id: `legacy-${entry.name}`,
        name: entry.name,
        description: `Unstructured file (${Math.round(stat.size / 1024)}KB)`,
        category: 'experiment',
        status: 'archived',
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
        outputs: [{
          type: guessOutputType(entry.name),
          path: entry.name,
          title: entry.name,
          createdAt: stat.mtime.toISOString(),
        }],
        tags: [],
        legacy: true,
      })
      continue
    }

    const manifestPath = join(PROJECTS_DIR, entry.name, 'pi-project.json')
    if (existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ProjectManifest
        results.push(manifest)
      } catch {
        // Invalid manifest — skip
      }
    } else {
      // Directory without manifest — list as unstructured
      const dirPath = join(PROJECTS_DIR, entry.name)
      const stat = statSync(dirPath)
      const files = readdirSync(dirPath).slice(0, 10)
      results.push({
        id: `legacy-${entry.name}`,
        name: entry.name,
        description: `Unstructured project (${files.length} files)`,
        category: 'experiment',
        status: 'archived',
        createdAt: stat.birthtime.toISOString(),
        updatedAt: stat.mtime.toISOString(),
        outputs: [],
        tags: [],
        legacy: true,
      })
    }
  }

  return results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

function guessOutputType(filename: string): 'text' | 'poem' | 'report' | 'data' | 'code' | 'log' | 'html' {
  const ext = filename.split('.').pop()?.toLowerCase()
  if (ext === 'py' || ext === 'ts' || ext === 'js' || ext === 'sh') return 'code'
  if (ext === 'json' || ext === 'csv') return 'data'
  if (ext === 'html') return 'html'
  if (ext === 'log') return 'log'
  if (ext === 'md' || ext === 'txt') return 'text'
  return 'text'
}

function listFiles(dir: string, prefix = ''): Array<{ path: string; size: number; isDir: boolean }> {
  const results: Array<{ path: string; size: number; isDir: boolean }> = []
  if (!existsSync(dir)) return results

  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.name === 'node_modules' || entry.name === '.git') continue

    if (entry.isDirectory()) {
      results.push({ path: relPath, size: 0, isDir: true })
      results.push(...listFiles(join(dir, entry.name), relPath))
    } else {
      const stat = statSync(join(dir, entry.name))
      results.push({ path: relPath, size: stat.size, isDir: false })
    }
  }
  return results
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (id) {
    // Single project detail
    const projects = scanProjects()
    const project = projects.find(p => p.id === id)
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Find the directory
    let projectDir: string | null = null
    if (project.legacy) {
      const name = id.replace('legacy-', '')
      projectDir = join(PROJECTS_DIR, name)
    } else {
      // Search for directory containing this manifest
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

    const files = projectDir && existsSync(projectDir) && statSync(projectDir).isDirectory()
      ? listFiles(projectDir)
      : []

    return NextResponse.json({ project, files })
  }

  // List all projects
  const projects = scanProjects()
  return NextResponse.json({ projects })
}

export async function POST(req: Request) {
  try {
    const body = await req.json()

    if (body.type === 'run' && body.id) {
      const projects = scanProjects()
      const project = projects.find(p => p.id === body.id)
      if (!project) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
      if (!project.runCommand) {
        return NextResponse.json({ error: 'No run command defined' }, { status: 400 })
      }

      // Find project directory
      let projectDir = PROJECTS_DIR
      const entries = readdirSync(PROJECTS_DIR, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        const manifestPath = join(PROJECTS_DIR, entry.name, 'pi-project.json')
        if (existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
            if (manifest.id === body.id) {
              projectDir = join(PROJECTS_DIR, entry.name)
              break
            }
          } catch { /* skip */ }
        }
      }

      try {
        const output = execSync(project.runCommand, {
          cwd: projectDir,
          timeout: 30000,
          encoding: 'utf-8',
          maxBuffer: 1024 * 1024,
        })
        return NextResponse.json({ success: true, output: output.slice(0, 10000) })
      } catch (err) {
        const error = err as { stdout?: string; stderr?: string; status?: number }
        return NextResponse.json({
          success: false,
          output: (error.stdout || '').slice(0, 10000),
          error: (error.stderr || '').slice(0, 5000),
          exitCode: error.status,
        })
      }
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
