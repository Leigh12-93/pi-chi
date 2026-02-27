import { readFileSync, existsSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { NextRequest } from 'next/server'

const PROJECTS_DIR = (process.env.PROJECTS_DIR || 'C:/Users/leigh/forge-projects').replace(/\\/g, '/')

const IGNORE = new Set(['node_modules', '.next', '.git', 'dist', '.turbo', '.vercel', '__pycache__'])

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeNode[]
}

function buildTree(dir: string, basePath = ''): TreeNode[] {
  if (!existsSync(dir)) return []
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter(e => !IGNORE.has(e.name) && !e.name.startsWith('.'))
    .sort((a, b) => {
      if (a.isDirectory() && !b.isDirectory()) return -1
      if (!a.isDirectory() && b.isDirectory()) return 1
      return a.name.localeCompare(b.name)
    })

  return entries.map(entry => {
    const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      return { name: entry.name, path: entryPath, type: 'directory' as const, children: buildTree(join(dir, entry.name), entryPath) }
    }
    return { name: entry.name, path: entryPath, type: 'file' as const }
  })
}

// GET /api/files?project=name — list files
// GET /api/files?project=name&read=path — read file
export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get('project')
  if (!project) return Response.json({ error: 'project param required' }, { status: 400 })

  const safe = project.replace(/[^a-zA-Z0-9_-]/g, '_')
  const projectDir = join(PROJECTS_DIR, safe).replace(/\\/g, '/')

  const readPath = req.nextUrl.searchParams.get('read')
  if (readPath) {
    const fullPath = join(projectDir, readPath).replace(/\\/g, '/')
    if (!fullPath.startsWith(projectDir)) return Response.json({ error: 'Path traversal blocked' }, { status: 400 })
    if (!existsSync(fullPath)) return Response.json({ error: 'File not found' }, { status: 404 })
    try {
      const content = readFileSync(fullPath, 'utf-8')
      return Response.json({ content, path: readPath, size: content.length })
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 })
    }
  }

  const files = buildTree(projectDir)
  return Response.json({ files, project: safe })
}

// PUT /api/files — save file from editor
export async function PUT(req: Request) {
  const body = await req.json()
  const { project, path, content } = body
  if (!project || !path || content === undefined) {
    return Response.json({ error: 'project, path, content required' }, { status: 400 })
  }

  const safe = project.replace(/[^a-zA-Z0-9_-]/g, '_')
  const projectDir = join(PROJECTS_DIR, safe).replace(/\\/g, '/')
  const fullPath = join(projectDir, path).replace(/\\/g, '/')
  if (!fullPath.startsWith(projectDir)) return Response.json({ error: 'Path traversal blocked' }, { status: 400 })

  try {
    mkdirSync(dirname(fullPath), { recursive: true })
    writeFileSync(fullPath, content, 'utf-8')
    return Response.json({ success: true, path })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
