import { streamText, tool, convertToCoreMessages } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'

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

  /** File manifest — path, lines, size for each file. No content. */
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

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || ''
const GITHUB_API = 'https://api.github.com'

async function githubFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
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

const VERCEL_TOKEN = process.env.VERCEL_TOKEN || ''
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
// System prompt
// ═══════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are Forge, an expert AI website builder specializing in React, Next.js, and modern web development.

## How You Work

You are an AGENTIC AI. You plan, build, and iterate autonomously in multi-step sequences. You do not ask for permission between steps — you execute the full task.

### Workflow (for every request)
1. **THINK** — For complex tasks (3+ files), use the \`think\` tool first to plan your approach
2. **BUILD** — Create/edit files to implement the plan. Work through files systematically.
3. **VERIFY** — If you edited a complex file, read it back to confirm correctness
4. **REPORT** — Brief summary: what was built, what to look at in preview, next steps

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
- Every file must be COMPLETE and PRODUCTION-READY. No placeholders. No "TODO" comments. No "add more here".
- Components must be responsive (mobile-first). Test your layout assumptions.
- Use semantic HTML. Buttons for actions, links for navigation, proper heading hierarchy.
- Extract repeated patterns into components. One file = one concern.
- Name files in kebab-case. Name components in PascalCase. Name hooks with use- prefix.
- Always include proper TypeScript types. No \`any\` unless truly necessary.

## Rules
1. **ACT FIRST.** Create files immediately. Never say "I'll create..." — just do it.
2. **BE COMPLETE.** Every page needs real content, not lorem ipsum. Real menu items, real feature descriptions, real pricing.
3. **BE VISUAL.** Use gradients, shadows, animations, hover states. Make it look professional.
4. **SCAFFOLD THEN BUILD.** After create_project, IMMEDIATELY build the full application. Don't stop at the template.
5. **SPLIT LARGE PAGES.** If a page exceeds 200 lines, extract sections into components.

## Self-Improvement Protocol

When you encounter a limitation, bug, or inefficiency in your tooling or capabilities:
1. Use \`suggest_improvement\` to log it with a specific fix
2. Include the EXACT file path and code change needed
3. Set priority based on impact (high = blocks common workflows, medium = inconvenient, low = nice-to-have)

Examples of things to flag:
- "Cannot install npm packages at runtime — need an install_packages tool"
- "Preview doesn't render React state/events — need a proper React renderer"
- "No image upload capability — need a file upload tool"
- "edit_file fails on non-unique strings — need line-number-based editing"

The user's development assistant (Claude Code) reads these suggestions and implements them.

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
    system: SYSTEM_PROMPT + `\n\n---\nProject: "${projectName}"\nFile manifest:\n${manifestStr}`,
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
        description: 'Log a tooling limitation, bug, or improvement suggestion. The user\'s dev assistant (Claude Code) will implement these. Use when you encounter something that blocks or slows your work.',
        parameters: z.object({
          issue: z.string().describe('What limitation or bug you encountered'),
          suggestion: z.string().describe('Specific fix — include exact code changes if possible'),
          file: z.string().optional().describe('Which source file needs to change (e.g. app/api/chat/route.ts)'),
          priority: z.enum(['low', 'medium', 'high']).describe('Impact: high=blocks workflows, medium=inconvenient, low=nice-to-have'),
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
        description: 'Create or overwrite a file. The client updates from the tool call args (not the result), so the result is lean to save tokens.',
        parameters: z.object({
          path: z.string().describe('File path relative to project root, e.g. "app/page.tsx"'),
          content: z.string().describe('Complete file content'),
        }),
        execute: async ({ path, content }) => {
          vfs.write(path, content)
          return { ok: true, path, lines: content.split('\n').length }
        },
      }),

      read_file: tool({
        description: 'Read a file\'s content. Only use when you need to see existing content before editing. NEVER read a file you just wrote.',
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
        description: 'Edit a file by replacing a specific string. old_string must match EXACTLY (including whitespace). The client applies the edit from args, result is lean.',
        parameters: z.object({
          path: z.string().describe('File path'),
          old_string: z.string().describe('Exact string to find — include enough surrounding context to be unique'),
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
            return { error: `Found ${occurrences} occurrences. Provide more surrounding context to make it unique.` }
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
        description: 'Search file contents with a regex pattern. Returns matching lines with file path and line number.',
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
        description: 'Scaffold a new project from a template. Creates config files and base structure. Always call this FIRST for new projects, then build the actual app.',
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
          if (!GITHUB_TOKEN) return { error: 'GITHUB_TOKEN not configured. Add it to environment variables.' }

          const repo = await githubFetch('/user/repos', {
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
            const blob = await githubFetch(`/repos/${owner}/${repoName}/git/blobs`, {
              method: 'POST',
              body: JSON.stringify({ content, encoding: 'utf-8' }),
            })
            if (blob.error) return { error: `Failed to create blob for ${path}: ${blob.error}` }
            blobs.push({ path, mode: '100644', type: 'blob', sha: blob.sha })
          }

          const tree = await githubFetch(`/repos/${owner}/${repoName}/git/trees`, {
            method: 'POST',
            body: JSON.stringify({ tree: blobs }),
          })
          if (tree.error) return { error: `Failed to create tree: ${tree.error}` }

          const commit = await githubFetch(`/repos/${owner}/${repoName}/git/commits`, {
            method: 'POST',
            body: JSON.stringify({ message: 'Initial commit from Forge', tree: tree.sha }),
          })
          if (commit.error) return { error: `Failed to create commit: ${commit.error}` }

          await githubFetch(`/repos/${owner}/${repoName}/git/refs`, {
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
          if (!GITHUB_TOKEN) return { error: 'GITHUB_TOKEN not configured' }
          const branchName = branch || 'main'

          const ref = await githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`)
          if (ref.error) return { error: `Failed to get branch: ${ref.error}` }
          const parentSha = ref.object.sha

          const files = vfs.toRecord()
          const blobs = []
          for (const [path, content] of Object.entries(files)) {
            const blob = await githubFetch(`/repos/${owner}/${repo}/git/blobs`, {
              method: 'POST',
              body: JSON.stringify({ content, encoding: 'utf-8' }),
            })
            if (blob.error) return { error: `Failed to create blob for ${path}: ${blob.error}` }
            blobs.push({ path, mode: '100644' as const, type: 'blob' as const, sha: blob.sha as string })
          }

          const tree = await githubFetch(`/repos/${owner}/${repo}/git/trees`, {
            method: 'POST',
            body: JSON.stringify({ base_tree: parentSha, tree: blobs }),
          })
          if (tree.error) return { error: `Failed to create tree: ${tree.error}` }

          const commit = await githubFetch(`/repos/${owner}/${repo}/git/commits`, {
            method: 'POST',
            body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
          })
          if (commit.error) return { error: `Failed to commit: ${commit.error}` }

          const update = await githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, {
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
          framework: z.enum(['nextjs', 'vite', 'static']).optional().describe('Framework hint (default: auto-detect)'),
        }),
        execute: async ({ framework }) => {
          const files = vfs.toRecord()
          if (Object.keys(files).length === 0) return { error: 'No files to deploy. Create some files first.' }

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
        description: 'Get the file manifest (path, lines, size for each file). Does NOT return content — use read_file for that.',
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
    },

    onFinish: async (event) => {
      console.log(`[forge] ${event.usage?.totalTokens || 0} tokens, ${event.steps?.length || 0} steps`)
    },
  })

  return result.toDataStreamResponse()
}
