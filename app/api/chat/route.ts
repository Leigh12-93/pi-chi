import { streamText, tool, convertToCoreMessages } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'

// ═══════════════════════════════════════════════════════════════════
// Virtual Filesystem — lives in closure per request
// ═══════════════════════════════════════════════════════════════════

class VirtualFS {
  files: Map<string, string>

  constructor(initial?: Record<string, string>) {
    this.files = new Map(Object.entries(initial || {}))
  }

  write(path: string, content: string) {
    this.files.set(path, content)
  }

  read(path: string): string | undefined {
    return this.files.get(path)
  }

  exists(path: string): boolean {
    return this.files.has(path)
  }

  delete(path: string): boolean {
    return this.files.delete(path)
  }

  list(prefix = ''): string[] {
    return Array.from(this.files.keys())
      .filter(k => !prefix || k.startsWith(prefix))
      .sort()
  }

  search(pattern: string, maxResults = 30): Array<{ file: string; line: number; text: string }> {
    const results: Array<{ file: string; line: number; text: string }> = []
    const regex = new RegExp(pattern, 'i')
    for (const [path, content] of this.files) {
      if (results.length >= maxResults) break
      const lines = content.split('\n')
      for (let i = 0; i < lines.length && results.length < maxResults; i++) {
        if (regex.test(lines[i])) {
          results.push({ file: path, line: i + 1, text: lines[i].trim().slice(0, 200) })
        }
      }
    }
    return results
  }

  toRecord(): Record<string, string> {
    return Object.fromEntries(this.files)
  }

  manifest(): Array<{ path: string; lines: number; size: number }> {
    return Array.from(this.files.entries())
      .map(([path, content]) => ({
        path,
        lines: content.split('\n').length,
        size: content.length,
      }))
      .sort((a, b) => a.path.localeCompare(b.path))
  }

  toTree(): TreeNode[] {
    const root: TreeNode[] = []
    for (const path of this.list()) {
      const parts = path.split('/')
      let current = root
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i]
        const isFile = i === parts.length - 1
        const existingDir = current.find(n => n.name === name && n.type === 'directory')
        if (isFile) {
          current.push({ name, path, type: 'file' })
        } else if (existingDir) {
          current = existingDir.children!
        } else {
          const dir: TreeNode = { name, path: parts.slice(0, i + 1).join('/'), type: 'directory', children: [] }
          current.push(dir)
          current = dir.children!
        }
      }
    }
    return sortTree(root)
  }
}

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeNode[]
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name)
  }).map(n => n.children ? { ...n, children: sortTree(n.children) } : n)
}

// ═══════════════════════════════════════════════════════════════════
// Next.js/Vite project templates
// ═══════════════════════════════════════════════════════════════════

function scaffoldNextJS(name: string, description?: string): Record<string, string> {
  return {
    'package.json': JSON.stringify({
      name, version: '0.1.0', private: true,
      scripts: { dev: 'next dev', build: 'next build', start: 'next start' },
      dependencies: {
        next: '^15.3.3', react: '^19.1.0', 'react-dom': '^19.1.0',
        'lucide-react': '^0.511.0', clsx: '^2.1.1', 'tailwind-merge': '^3.3.0',
      },
      devDependencies: {
        '@tailwindcss/postcss': '^4.1.8', tailwindcss: '^4.1.8',
        '@types/node': '^22.15.21', '@types/react': '^19.1.4', typescript: '^5.8.3',
      },
    }, null, 2),
    'next.config.ts': `import type { NextConfig } from 'next'\nconst nextConfig: NextConfig = {}\nexport default nextConfig\n`,
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true,
        strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler',
        resolveJsonModule: true, isolatedModules: true, jsx: 'preserve', incremental: true,
        plugins: [{ name: 'next' }], paths: { '@/*': ['./*'] },
      },
      include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
      exclude: ['node_modules'],
    }, null, 2),
    'postcss.config.mjs': `const config = { plugins: { "@tailwindcss/postcss": {} } }\nexport default config\n`,
    'app/globals.css': '@import "tailwindcss";\n',
    'app/layout.tsx': `import type { Metadata } from 'next'\nimport './globals.css'\n\nexport const metadata: Metadata = {\n  title: '${name}',\n  description: '${description || 'Built with Forge'}',\n}\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body className="antialiased">{children}</body>\n    </html>\n  )\n}\n`,
    'app/page.tsx': `export default function Home() {\n  return (\n    <main className="min-h-screen flex items-center justify-center bg-white">\n      <h1 className="text-4xl font-bold text-gray-900">Welcome to ${name}</h1>\n    </main>\n  )\n}\n`,
    'lib/utils.ts': `import { clsx, type ClassValue } from 'clsx'\nimport { twMerge } from 'tailwind-merge'\nexport function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }\n`,
    '.gitignore': '.next/\nnode_modules/\n.env.local\n*.tsbuildinfo\nnext-env.d.ts\n',
  }
}

function scaffoldViteReact(name: string): Record<string, string> {
  return {
    'package.json': JSON.stringify({
      name, version: '0.1.0', private: true, type: 'module',
      scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' },
      dependencies: { react: '^19.1.0', 'react-dom': '^19.1.0' },
      devDependencies: {
        '@types/react': '^19.1.4', '@types/react-dom': '^19.1.5',
        '@vitejs/plugin-react': '^4.4.1', tailwindcss: '^4.1.8',
        '@tailwindcss/vite': '^4.1.8', typescript: '^5.8.3', vite: '^6.3.5',
      },
    }, null, 2),
    'vite.config.ts': `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nimport tailwindcss from '@tailwindcss/vite'\nexport default defineConfig({ plugins: [react(), tailwindcss()] })\n`,
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2020', useDefineForClassFields: true, lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler',
        allowImportingTsExtensions: true, isolatedModules: true, noEmit: true,
        jsx: 'react-jsx', strict: true, paths: { '@/*': ['./src/*'] },
      },
      include: ['src'],
    }, null, 2),
    'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>${name}</title></head>\n<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>\n</html>\n`,
    'src/main.tsx': `import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport App from './App'\nimport './index.css'\ncreateRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)\n`,
    'src/App.tsx': `export default function App() {\n  return (\n    <main className="min-h-screen flex items-center justify-center">\n      <h1 className="text-4xl font-bold">Welcome to ${name}</h1>\n    </main>\n  )\n}\n`,
    'src/index.css': '@import "tailwindcss";\n',
    '.gitignore': 'node_modules/\ndist/\n.env.local\n',
  }
}

function scaffoldStatic(name: string): Record<string, string> {
  return {
    'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${name}</title>\n  <script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body class="min-h-screen bg-white">\n  <main class="flex items-center justify-center min-h-screen">\n    <h1 class="text-4xl font-bold">${name}</h1>\n  </main>\n</body>\n</html>\n`,
  }
}

// ═══════════════════════════════════════════════════════════════════
// GitHub API helpers
// ═══════════════════════════════════════════════════════════════════

const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim()
const GITHUB_API = 'https://api.github.com'

async function githubFetch(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const data = await res.json()
  if (!res.ok) return { error: data.message || `GitHub API ${res.status}`, status: res.status }
  return data
}

// ═══════════════════════════════════════════════════════════════════
// Vercel Deploy API helpers
// ═══════════════════════════════════════════════════════════════════

const VERCEL_TOKEN = (process.env.FORGE_DEPLOY_TOKEN || process.env.VERCEL_TOKEN || '').trim()
const VERCEL_TEAM = process.env.VERCEL_TEAM_ID || ''

async function vercelDeploy(name: string, files: Record<string, string>, framework?: string) {
  if (!VERCEL_TOKEN) return { error: 'VERCEL_TOKEN not configured' }

  const fileEntries = Object.entries(files).map(([file, data]) => ({ file, data }))

  const body: Record<string, unknown> = {
    name,
    files: fileEntries,
    projectSettings: { framework: framework || 'nextjs' },
  }

  const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
  const res = await fetch(`https://api.vercel.com/v13/deployments${teamParam}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()
  if (!res.ok) return { error: data.error?.message || `Vercel API ${res.status}` }
  return { url: `https://${data.url}`, id: data.id, readyState: data.readyState }
}

// ═══════════════════════════════════════════════════════════════════
// Supabase DB credentials (for the AI's database tools)
// ═══════════════════════════════════════════════════════════════════

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
const SUPABASE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()

async function supabaseFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers,
    },
  })
  const text = await res.text()
  try {
    return { data: JSON.parse(text), status: res.status, ok: res.ok }
  } catch {
    return { data: text, status: res.status, ok: res.ok }
  }
}

// ═══════════════════════════════════════════════════════════════════
// System prompt — THE BRAIN
// ═══════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are Forge, an expert AI website builder with SUPERPOWER capabilities.

## Your Identity

You are not just a code generator. You are an autonomous AI agent with full access to:
- **Your own source code** (GitHub repo: Leigh12-93/forge) — you can modify yourself
- **A Supabase database** — you can query, insert, update, delete data
- **GitHub API** — create repos, push code, read files from any accessible repo
- **Vercel API** — deploy projects to production
- **AussieSMS codebase** (GitHub repo: Leigh12-93/sms-gateway-android or local) — you can read and modify this app

You have the power to improve yourself. If you encounter a limitation, use your self-modification tools to fix it.

## How You Work

You are an AGENTIC AI. You plan, build, and iterate autonomously in multi-step sequences. You do not ask for permission between steps — you execute the full task.

### Workflow (for every request)
1. **THINK** — For complex tasks (3+ files), use the \`think\` tool first to plan your approach
2. **BUILD** — Create/edit files to implement the plan. Work through files systematically.
3. **VERIFY** — If you edited a complex file, read it back to confirm correctness
4. **SAVE** — Auto-save to database after significant changes (use \`save_project\`)
5. **REPORT** — Brief summary: what was built, what to look at in preview, next steps

### Token Efficiency (CRITICAL)
- Tool results for write_file and edit_file are LEAN (no content echo). This is intentional.
- NEVER read_file on a file you just wrote — you already know what's in it.
- Use \`edit_file\` for surgical changes (<30% of file). Use \`write_file\` when rewriting >30%.
- The file manifest below shows what exists. Only read_file when you need actual content.
- Prefer creating fewer, well-structured files over many small ones.

## Tech Stack Defaults
- **Framework:** Next.js 15 (App Router) with Tailwind CSS v4
- **Language:** TypeScript (.tsx/.ts)
- **Styling:** Tailwind CSS utility classes — use modern features (container queries, has:, group, etc.)
- **Icons:** lucide-react
- **Components:** Build from scratch with Tailwind. Follow shadcn/ui patterns (composable, accessible).
- **State:** React hooks (useState, useReducer). For complex state, extract to custom hooks.

## Code Standards
- Every file must be COMPLETE and PRODUCTION-READY. No placeholders. No "TODO" comments.
- Components must be responsive (mobile-first). Test your layout assumptions.
- Use semantic HTML. Buttons for actions, links for navigation, proper heading hierarchy.
- Extract repeated patterns into components. One file = one concern.
- Name files in kebab-case. Name components in PascalCase. Name hooks with use- prefix.
- Always include proper TypeScript types. No \`any\` unless truly necessary.

## Rules
1. **ACT FIRST.** Create files immediately. Never say "I'll create..." — just do it.
2. **BE COMPLETE.** Every page needs real content, not lorem ipsum.
3. **BE VISUAL.** Use gradients, shadows, animations, hover states. Make it look professional.
4. **SCAFFOLD THEN BUILD.** After create_project, IMMEDIATELY build the full application.
5. **SPLIT LARGE PAGES.** If a page exceeds 200 lines, extract sections into components.

## Superpower Tools

### Self-Modification
You can read and modify your OWN source code using \`forge_read_own_source\` and \`forge_modify_own_source\`.
Your source lives at GitHub repo \`Leigh12-93/forge\`. After modifying yourself, use \`forge_redeploy\` to push changes and trigger a Vercel redeploy.

**Use self-modification when:**
- A user requests a feature that requires changing your tools or system prompt
- You encounter a bug in your own code
- You need a new tool that doesn't exist yet
- You want to improve your own capabilities

### Database Access
You have full CRUD access to the Supabase database. Tables prefixed with \`forge_\` are yours.
Use \`db_query\` to read data and \`db_mutate\` to insert/update/delete.

### External Repo Access
You can read and modify other GitHub repos the user has access to:
- \`github_read_file\` — read any file from any accessible repo
- \`github_push_update\` — push changes to any accessible repo
- AussieSMS app repo: \`Leigh12-93/sms-gateway-android\` (or Leigh12-93/aussie-sms if that exists)

## Self-Improvement Protocol

When you encounter a limitation:
1. First try to fix it using self-modification tools
2. If that's not possible, use \`suggest_improvement\` to log it
3. Include the EXACT file path and code change needed

## After Building

Keep summaries SHORT (3-4 lines max):
- What was created/changed
- What to see in the preview
- One suggestion for what to build next`

// ═══════════════════════════════════════════════════════════════════
// POST handler
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: Request) {
  const body = await req.json()
  const projectName = body.projectName || 'untitled'
  const projectId = body.projectId || null

  // Use user's GitHub token from OAuth if available, fall back to server PAT
  const userGithubToken = body.githubToken ? String(body.githubToken).trim() : ''
  const effectiveGithubToken = userGithubToken || GITHUB_TOKEN

  // Initialize virtual FS from client state
  const vfs = new VirtualFS(body.files || {})

  // Build file manifest for system context (lean — no content)
  const manifest = vfs.manifest()
  const manifestStr = manifest.length > 0
    ? manifest.map(f => `  ${f.path} (${f.lines}L, ${(f.size / 1024).toFixed(1)}kb)`).join('\n')
    : '  (empty project)'

  // Convert messages
  let messages
  try {
    messages = convertToCoreMessages(body.messages)
  } catch {
    messages = (body.messages || []).map((m: { role: string; content?: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content || '',
    }))
  }

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: SYSTEM_PROMPT + `\n\n---\nProject: "${projectName}"${projectId ? ` (id: ${projectId})` : ''}\nFile manifest:\n${manifestStr}`,
    messages,
    maxSteps: 25,
    tools: {

      // ─── Agentic Planning ──────────────────────────────────────

      think: tool({
        description: 'Think through your approach before building. Use this for complex tasks (3+ files) to plan the file structure, component hierarchy, and implementation order.',
        parameters: z.object({
          plan: z.string().describe('Your step-by-step plan for implementing this task'),
          files: z.array(z.string()).describe('List of files you plan to create/modify'),
          approach: z.string().optional().describe('Key architectural decisions'),
        }),
        execute: async ({ plan, files, approach }) => ({
          acknowledged: true,
          plan,
          files,
          approach,
        }),
      }),

      suggest_improvement: tool({
        description: 'Log a tooling limitation, bug, or improvement suggestion. Use when you encounter something that blocks or slows your work.',
        parameters: z.object({
          issue: z.string().describe('What limitation or bug you encountered'),
          suggestion: z.string().describe('Specific fix — include exact code changes if possible'),
          file: z.string().optional().describe('Which source file needs to change'),
          priority: z.enum(['low', 'medium', 'high']).describe('Impact level'),
        }),
        execute: async ({ issue, suggestion, file, priority }) => ({
          logged: true,
          issue,
          suggestion,
          file,
          priority,
        }),
      }),

      // ─── File Operations (lean results) ────────────────────────

      write_file: tool({
        description: 'Create or overwrite a file. Result is lean to save tokens.',
        parameters: z.object({
          path: z.string().describe('File path relative to project root'),
          content: z.string().describe('Complete file content'),
        }),
        execute: async ({ path, content }) => {
          vfs.write(path, content)
          return { ok: true, path, lines: content.split('\n').length }
        },
      }),

      read_file: tool({
        description: 'Read a file\'s content. Only use when you need existing content before editing.',
        parameters: z.object({
          path: z.string().describe('File path relative to project root'),
        }),
        execute: async ({ path }) => {
          const content = vfs.read(path)
          if (content === undefined) return { error: `File not found: ${path}` }
          return { content, path, lines: content.split('\n').length }
        },
      }),

      edit_file: tool({
        description: 'Edit a file by replacing a specific string. old_string must match EXACTLY.',
        parameters: z.object({
          path: z.string().describe('File path'),
          old_string: z.string().describe('Exact string to find'),
          new_string: z.string().describe('Replacement string'),
        }),
        execute: async ({ path, old_string, new_string }) => {
          const content = vfs.read(path)
          if (content === undefined) return { error: `File not found: ${path}` }
          if (!content.includes(old_string)) {
            return { error: 'old_string not found in file. Read the file first to get exact content.' }
          }
          const occurrences = content.split(old_string).length - 1
          if (occurrences > 1) {
            return { error: `Found ${occurrences} occurrences. Provide more context to make it unique.` }
          }
          const updated = content.replace(old_string, new_string)
          vfs.write(path, updated)
          return { ok: true, path, lines: updated.split('\n').length }
        },
      }),

      delete_file: tool({
        description: 'Delete a file from the project.',
        parameters: z.object({
          path: z.string().describe('File path to delete'),
        }),
        execute: async ({ path }) => {
          if (!vfs.exists(path)) return { error: `File not found: ${path}` }
          vfs.delete(path)
          return { ok: true, path, deleted: true }
        },
      }),

      list_files: tool({
        description: 'List all files in the project with their sizes.',
        parameters: z.object({
          prefix: z.string().optional().describe('Filter files starting with this path prefix'),
        }),
        execute: async ({ prefix }) => {
          const files = vfs.list(prefix)
          return { files, count: files.length }
        },
      }),

      search_files: tool({
        description: 'Search file contents with a regex pattern.',
        parameters: z.object({
          pattern: z.string().describe('Regex pattern to search for'),
        }),
        execute: async ({ pattern }) => {
          const results = vfs.search(pattern)
          return { results, count: results.length }
        },
      }),

      // ─── Project Scaffolding ────────────────────────────────────

      create_project: tool({
        description: 'Scaffold a new project from a template. Always call this FIRST for new projects.',
        parameters: z.object({
          template: z.enum(['nextjs', 'vite-react', 'static']).describe('Project template'),
          description: z.string().optional().describe('Project description'),
        }),
        execute: async ({ template, description }) => {
          let scaffold: Record<string, string>
          switch (template) {
            case 'nextjs': scaffold = scaffoldNextJS(projectName, description); break
            case 'vite-react': scaffold = scaffoldViteReact(projectName); break
            case 'static': scaffold = scaffoldStatic(projectName); break
          }
          for (const [path, content] of Object.entries(scaffold)) {
            vfs.write(path, content)
          }
          return {
            ok: true,
            template,
            files: Object.keys(scaffold),
            allFiles: vfs.toRecord(),
          }
        },
      }),

      // ─── GitHub Operations ──────────────────────────────────────

      github_create_repo: tool({
        description: 'Create a new GitHub repository and push all project files to it.',
        parameters: z.object({
          repoName: z.string().describe('Repository name'),
          isPublic: z.boolean().optional().describe('Make repo public (default: private)'),
          description: z.string().optional().describe('Repository description'),
        }),
        execute: async ({ repoName, isPublic, description }) => {
          if (!effectiveGithubToken) return { error: 'Not authenticated. Sign in with GitHub.' }

          const repo = await githubFetch('/user/repos', effectiveGithubToken, {
            method: 'POST',
            body: JSON.stringify({
              name: repoName,
              description: description || `Built with Forge`,
              private: !isPublic,
              auto_init: false,
            }),
          })
          if (repo.error) return { error: `Failed to create repo: ${repo.error}` }

          const owner = repo.owner.login
          const files = vfs.toRecord()
          const blobs = []

          for (const [path, content] of Object.entries(files)) {
            const blob = await githubFetch(`/repos/${owner}/${repoName}/git/blobs`, effectiveGithubToken, {
              method: 'POST',
              body: JSON.stringify({ content, encoding: 'utf-8' }),
            })
            if (blob.error) return { error: `Failed to create blob for ${path}: ${blob.error}` }
            blobs.push({ path, mode: '100644', type: 'blob', sha: blob.sha })
          }

          const tree = await githubFetch(`/repos/${owner}/${repoName}/git/trees`, effectiveGithubToken, {
            method: 'POST',
            body: JSON.stringify({ tree: blobs }),
          })
          if (tree.error) return { error: `Failed to create tree: ${tree.error}` }

          const commit = await githubFetch(`/repos/${owner}/${repoName}/git/commits`, effectiveGithubToken, {
            method: 'POST',
            body: JSON.stringify({ message: 'Initial commit from Forge', tree: tree.sha }),
          })
          if (commit.error) return { error: `Failed to create commit: ${commit.error}` }

          await githubFetch(`/repos/${owner}/${repoName}/git/refs`, effectiveGithubToken, {
            method: 'POST',
            body: JSON.stringify({ ref: 'refs/heads/main', sha: commit.sha }),
          })

          return { ok: true, url: repo.html_url, owner, repoName, filesCount: Object.keys(files).length }
        },
      }),

      github_push_update: tool({
        description: 'Push updated files to an existing GitHub repository.',
        parameters: z.object({
          owner: z.string().describe('GitHub username/org'),
          repo: z.string().describe('Repository name'),
          message: z.string().describe('Commit message'),
          branch: z.string().optional().describe('Branch name (default: main)'),
        }),
        execute: async ({ owner, repo, message, branch }) => {
          if (!effectiveGithubToken) return { error: 'Not authenticated. Sign in with GitHub.' }
          const branchName = branch || 'main'

          const ref = await githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, effectiveGithubToken)
          if (ref.error) return { error: `Failed to get branch: ${ref.error}` }
          const parentSha = ref.object.sha

          const files = vfs.toRecord()
          const blobs = []
          for (const [path, content] of Object.entries(files)) {
            const blob = await githubFetch(`/repos/${owner}/${repo}/git/blobs`, effectiveGithubToken, {
              method: 'POST',
              body: JSON.stringify({ content, encoding: 'utf-8' }),
            })
            if (blob.error) return { error: `Failed to create blob for ${path}: ${blob.error}` }
            blobs.push({ path, mode: '100644' as const, type: 'blob' as const, sha: blob.sha as string })
          }

          const tree = await githubFetch(`/repos/${owner}/${repo}/git/trees`, effectiveGithubToken, {
            method: 'POST',
            body: JSON.stringify({ base_tree: parentSha, tree: blobs }),
          })
          if (tree.error) return { error: `Failed to create tree: ${tree.error}` }

          const commit = await githubFetch(`/repos/${owner}/${repo}/git/commits`, effectiveGithubToken, {
            method: 'POST',
            body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
          })
          if (commit.error) return { error: `Failed to commit: ${commit.error}` }

          const update = await githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, effectiveGithubToken, {
            method: 'PATCH',
            body: JSON.stringify({ sha: commit.sha }),
          })
          if (update.error) return { error: `Failed to update ref: ${update.error}` }

          return { ok: true, commitSha: commit.sha, filesCount: Object.keys(files).length }
        },
      }),

      // ─── Vercel Deployment ──────────────────────────────────────

      deploy_to_vercel: tool({
        description: 'Deploy the current project files to Vercel. Returns the deployment URL.',
        parameters: z.object({
          framework: z.enum(['nextjs', 'vite', 'static']).optional().describe('Framework hint'),
        }),
        execute: async ({ framework }) => {
          const files = vfs.toRecord()
          if (Object.keys(files).length === 0) return { error: 'No files to deploy.' }

          let fw = framework
          if (!fw) {
            if (files['next.config.ts'] || files['next.config.js']) fw = 'nextjs'
            else if (files['vite.config.ts'] || files['vite.config.js']) fw = 'vite'
            else fw = 'static'
          }

          const result = await vercelDeploy(projectName, files, fw === 'static' ? null as any : fw)
          return result
        },
      }),

      // ─── Utility ────────────────────────────────────────────────

      get_all_files: tool({
        description: 'Get the file manifest (path, lines, size). No content.',
        parameters: z.object({}),
        execute: async () => {
          return { manifest: vfs.manifest(), totalFiles: vfs.list().length }
        },
      }),

      rename_file: tool({
        description: 'Rename/move a file within the project.',
        parameters: z.object({
          oldPath: z.string().describe('Current file path'),
          newPath: z.string().describe('New file path'),
        }),
        execute: async ({ oldPath, newPath }) => {
          const content = vfs.read(oldPath)
          if (content === undefined) return { error: `File not found: ${oldPath}` }
          vfs.delete(oldPath)
          vfs.write(newPath, content)
          return { ok: true, oldPath, newPath }
        },
      }),

      // ═══════════════════════════════════════════════════════════════
      // SUPERPOWER TOOLS
      // ═══════════════════════════════════════════════════════════════

      // ─── Database Operations ────────────────────────────────────

      db_query: tool({
        description: 'Query the Supabase database. Read data from any table. Use PostgREST query syntax for filters. Tables you own: forge_projects, forge_project_files, forge_chat_messages, forge_deployments. Other tables in the DB: credit_packages, profiles, users, messages, etc.',
        parameters: z.object({
          table: z.string().describe('Table name, e.g. "forge_projects"'),
          select: z.string().optional().describe('Columns to select, e.g. "id, name, created_at" (default: *)'),
          filters: z.string().optional().describe('PostgREST filter query string, e.g. "status=eq.active&limit=10"'),
          order: z.string().optional().describe('Order clause, e.g. "created_at.desc"'),
          limit: z.number().optional().describe('Max rows to return (default: 50)'),
        }),
        execute: async ({ table, select, filters, order, limit }) => {
          const params = new URLSearchParams()
          if (select) params.set('select', select)
          if (order) params.set('order', order)
          params.set('limit', String(limit || 50))

          const filterStr = filters ? `&${filters}` : ''
          const result = await supabaseFetch(`/${table}?${params.toString()}${filterStr}`)

          if (!result.ok) return { error: `DB query failed: ${JSON.stringify(result.data)}` }
          return { data: result.data, count: Array.isArray(result.data) ? result.data.length : 1 }
        },
      }),

      db_mutate: tool({
        description: 'Insert, update, or delete data in the Supabase database. Use for forge_ tables or any table you have access to.',
        parameters: z.object({
          operation: z.enum(['insert', 'update', 'upsert', 'delete']).describe('Operation type'),
          table: z.string().describe('Table name'),
          data: z.any().optional().describe('Data to insert/update (object or array of objects)'),
          filters: z.string().optional().describe('PostgREST filter for update/delete, e.g. "id=eq.abc123"'),
          onConflict: z.string().optional().describe('For upsert: conflict column(s), e.g. "project_id,path"'),
        }),
        execute: async ({ operation, table, data, filters, onConflict }) => {
          let path = `/${table}`
          const filterStr = filters ? `?${filters}` : ''

          switch (operation) {
            case 'insert': {
              const result = await supabaseFetch(path, {
                method: 'POST',
                body: JSON.stringify(data),
              })
              return result.ok ? { ok: true, data: result.data } : { error: JSON.stringify(result.data) }
            }
            case 'upsert': {
              const headers: Record<string, string> = {}
              if (onConflict) headers['Prefer'] = `return=representation,resolution=merge-duplicates`
              const queryStr = onConflict ? `?on_conflict=${onConflict}` : ''
              const result = await supabaseFetch(`${path}${queryStr}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(data),
              })
              return result.ok ? { ok: true, data: result.data } : { error: JSON.stringify(result.data) }
            }
            case 'update': {
              const result = await supabaseFetch(`${path}${filterStr}`, {
                method: 'PATCH',
                body: JSON.stringify(data),
              })
              return result.ok ? { ok: true, data: result.data } : { error: JSON.stringify(result.data) }
            }
            case 'delete': {
              const result = await supabaseFetch(`${path}${filterStr}`, {
                method: 'DELETE',
              })
              return result.ok ? { ok: true } : { error: JSON.stringify(result.data) }
            }
          }
        },
      }),

      // ─── Project Persistence ────────────────────────────────────

      save_project: tool({
        description: 'Save the current project files to the database. Call this after significant changes to persist the user\'s work.',
        parameters: z.object({
          description: z.string().optional().describe('Updated project description'),
        }),
        execute: async ({ description }) => {
          if (!projectId) return { ok: false, note: 'No project ID — project will be saved client-side when user signs in' }

          const files = vfs.toRecord()
          const filePaths = Object.keys(files)

          // Update project metadata
          const updates: Record<string, unknown> = {}
          if (description) updates.description = description
          if (Object.keys(updates).length > 0) {
            await supabase.from('forge_projects').update(updates).eq('id', projectId)
          }

          // Delete removed files
          if (filePaths.length > 0) {
            await supabase
              .from('forge_project_files')
              .delete()
              .eq('project_id', projectId)
              .not('path', 'in', `(${filePaths.map(p => `"${p}"`).join(',')})`)
          }

          // Upsert current files
          if (filePaths.length > 0) {
            const rows = filePaths.map(path => ({
              project_id: projectId,
              path,
              content: files[path],
            }))
            await supabase
              .from('forge_project_files')
              .upsert(rows, { onConflict: 'project_id,path' })
          }

          return { ok: true, savedFiles: filePaths.length }
        },
      }),

      // ─── Self-Modification (SUPERPOWER) ─────────────────────────

      forge_read_own_source: tool({
        description: 'Read a file from Forge\'s own source code on GitHub (repo: Leigh12-93/forge). Use this to understand your own implementation before modifying it.',
        parameters: z.object({
          path: z.string().describe('File path in the Forge repo, e.g. "app/api/chat/route.ts" or "components/chat-panel.tsx"'),
          branch: z.string().optional().describe('Branch (default: main)'),
        }),
        execute: async ({ path, branch }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const branchName = branch || 'main'
          const result = await githubFetch(
            `/repos/Leigh12-93/forge/contents/${path}?ref=${branchName}`,
            token
          )
          if (result.error) return { error: result.error }

          // GitHub returns base64-encoded content
          const content = Buffer.from(result.content, 'base64').toString('utf-8')
          return { path, content, size: content.length, lines: content.split('\n').length }
        },
      }),

      forge_modify_own_source: tool({
        description: 'Modify a file in Forge\'s own source code. This pushes a commit to the Forge repo on GitHub. Use with care — you are editing your own brain.',
        parameters: z.object({
          path: z.string().describe('File path to modify in Forge repo'),
          content: z.string().describe('New file content (complete file)'),
          message: z.string().describe('Commit message describing the change'),
          branch: z.string().optional().describe('Branch (default: main)'),
        }),
        execute: async ({ path, content, message, branch }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const owner = 'Leigh12-93'
          const repo = 'forge'
          const branchName = branch || 'main'

          // Get current file SHA (needed for update)
          const existing = await githubFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branchName}`, token)

          const body: Record<string, string> = {
            message: `[self-modify] ${message}`,
            content: Buffer.from(content).toString('base64'),
            branch: branchName,
          }
          if (existing.sha) body.sha = existing.sha

          const result = await githubFetch(`/repos/${owner}/${repo}/contents/${path}`, token, {
            method: 'PUT',
            body: JSON.stringify(body),
          })

          if (result.error) return { error: result.error }
          return {
            ok: true,
            path,
            commitSha: result.commit?.sha,
            note: 'File updated on GitHub. Use forge_redeploy to deploy the change.',
          }
        },
      }),

      forge_redeploy: tool({
        description: 'Trigger a redeployment of Forge itself on Vercel. Call this after using forge_modify_own_source to apply your changes.',
        parameters: z.object({
          reason: z.string().describe('Why are you redeploying? e.g. "Added new db_query tool"'),
        }),
        execute: async ({ reason }) => {
          // Trigger Vercel deploy hook or use the Vercel API to redeploy
          const token = VERCEL_TOKEN
          if (!token) return { error: 'No Vercel deploy token configured' }

          // Create a deployment from the latest Git commit
          const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
          const res = await fetch(`https://api.vercel.com/v13/deployments${teamParam}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: 'forge',
              gitSource: {
                type: 'github',
                org: 'Leigh12-93',
                repo: 'forge',
                ref: 'main',
              },
            }),
          })

          const data = await res.json()
          if (!res.ok) return { error: data.error?.message || `Vercel API ${res.status}` }
          return {
            ok: true,
            url: `https://${data.url}`,
            deploymentId: data.id,
            reason,
            note: 'Forge is redeploying. Changes will be live in ~60 seconds.',
          }
        },
      }),

      // ─── External Repo Access ───────────────────────────────────

      github_read_file: tool({
        description: 'Read a file from any GitHub repository you have access to. Use to inspect code in other projects like AussieSMS.',
        parameters: z.object({
          owner: z.string().describe('GitHub username/org, e.g. "Leigh12-93"'),
          repo: z.string().describe('Repository name'),
          path: z.string().describe('File path in the repo'),
          branch: z.string().optional().describe('Branch (default: main)'),
        }),
        execute: async ({ owner, repo, path, branch }) => {
          const token = effectiveGithubToken
          if (!token) return { error: 'Not authenticated' }

          const branchName = branch || 'main'
          const result = await githubFetch(
            `/repos/${owner}/${repo}/contents/${path}?ref=${branchName}`,
            token
          )
          if (result.error) return { error: result.error }

          if (result.type === 'dir') {
            // Return directory listing
            const entries = (result as any[]).map((e: any) => ({
              name: e.name,
              type: e.type,
              path: e.path,
              size: e.size,
            }))
            return { type: 'directory', entries, path }
          }

          const content = Buffer.from(result.content, 'base64').toString('utf-8')
          return { path, content, size: content.length, lines: content.split('\n').length }
        },
      }),

      github_list_repo_files: tool({
        description: 'List files in a GitHub repository directory. Use to explore codebases.',
        parameters: z.object({
          owner: z.string().describe('GitHub username/org'),
          repo: z.string().describe('Repository name'),
          path: z.string().optional().describe('Directory path (default: root)'),
          branch: z.string().optional().describe('Branch (default: main)'),
        }),
        execute: async ({ owner, repo, path, branch }) => {
          const token = effectiveGithubToken
          if (!token) return { error: 'Not authenticated' }

          const branchName = branch || 'main'
          const dirPath = path || ''
          const result = await githubFetch(
            `/repos/${owner}/${repo}/contents/${dirPath}?ref=${branchName}`,
            token
          )
          if (result.error) return { error: result.error }

          if (Array.isArray(result)) {
            const entries = result.map((e: any) => ({
              name: e.name,
              type: e.type,
              path: e.path,
              size: e.size,
            }))
            return { entries, count: entries.length }
          }
          return { error: 'Path is a file, not a directory. Use github_read_file instead.' }
        },
      }),

      github_modify_external_file: tool({
        description: 'Modify a file in any GitHub repository you have access to. Pushes a commit directly.',
        parameters: z.object({
          owner: z.string().describe('GitHub username/org'),
          repo: z.string().describe('Repository name'),
          path: z.string().describe('File path to modify'),
          content: z.string().describe('New file content'),
          message: z.string().describe('Commit message'),
          branch: z.string().optional().describe('Branch (default: main)'),
        }),
        execute: async ({ owner, repo, path, content, message, branch }) => {
          const token = effectiveGithubToken
          if (!token) return { error: 'Not authenticated' }

          const branchName = branch || 'main'

          // Get current file SHA
          const existing = await githubFetch(`/repos/${owner}/${repo}/contents/${path}?ref=${branchName}`, token)

          const body: Record<string, string> = {
            message,
            content: Buffer.from(content).toString('base64'),
            branch: branchName,
          }
          if (existing.sha) body.sha = existing.sha

          const result = await githubFetch(`/repos/${owner}/${repo}/contents/${path}`, token, {
            method: 'PUT',
            body: JSON.stringify(body),
          })

          if (result.error) return { error: result.error }
          return { ok: true, path, commitSha: result.commit?.sha }
        },
      }),

      // ─── GitHub Search ──────────────────────────────────────────

      github_search_code: tool({
        description: 'Search for code across GitHub repositories. Find files, functions, patterns.',
        parameters: z.object({
          query: z.string().describe('Search query. Supports GitHub code search syntax.'),
          repo: z.string().optional().describe('Restrict to a specific repo, e.g. "Leigh12-93/forge"'),
        }),
        execute: async ({ query, repo }) => {
          const token = effectiveGithubToken
          if (!token) return { error: 'Not authenticated' }

          const q = repo ? `${query} repo:${repo}` : query
          const result = await githubFetch(
            `/search/code?q=${encodeURIComponent(q)}&per_page=10`,
            token
          )
          if (result.error) return { error: result.error }

          const items = (result.items || []).map((item: any) => ({
            name: item.name,
            path: item.path,
            repo: item.repository?.full_name,
            url: item.html_url,
          }))
          return { results: items, total: result.total_count }
        },
      }),
    },

    onFinish: async (event) => {
      console.log(`[forge] ${event.usage?.totalTokens || 0} tokens, ${event.steps?.length || 0} steps`)
    },
  })

  return result.toDataStreamResponse()
}
