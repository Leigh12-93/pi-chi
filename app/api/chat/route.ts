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

  const fileEntries = Object.entries(files).map(([file, data]) => ({
    file,
    data,
  }))

  const body: Record<string, unknown> = {
    name,
    files: fileEntries,
    projectSettings: {
      framework: framework || 'nextjs',
    },
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

const SYSTEM_PROMPT = `You are Forge, an expert AI React website builder. You create, edit, and deploy React websites and web applications.

You work entirely in the cloud — files are virtual (in-memory) and deployments go to Vercel. No local filesystem.

## Behaviour Rules

1. **Act first, report after.** Don't say "I'll create..." — just create the files.
2. **Write COMPLETE code.** Never use placeholder comments. Every file must be production-ready.
3. **Use modern React patterns.** Functional components, hooks, TypeScript, Tailwind CSS.
4. **Be concise.** Short explanations. The code speaks for itself.
5. **When editing, be surgical.** Use edit_file for small changes. Use write_file when rewriting most of a file.

## Tech Stack Defaults

- **Framework:** Next.js 15 (App Router) with Tailwind CSS v4
- **Language:** TypeScript (.tsx/.ts)
- **Styling:** Tailwind CSS utility classes
- **Icons:** lucide-react
- **Components:** Build from scratch with Tailwind (shadcn/ui patterns)

## Important: File Operations

Your write_file/edit_file tools operate on a virtual filesystem. The user sees changes instantly in their editor and preview. Files persist in the browser session.

After scaffolding a project with create_project, IMMEDIATELY start writing the actual application code the user asked for. Don't stop at the template — build what they described.

## After Making Changes

Give a brief summary:
- What files were created/modified
- What the user should see in the preview
- Any suggestions for next steps`

// ═══════════════════════════════════════════════════════════════════
// POST handler
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: Request) {
  const body = await req.json()
  const projectName = body.projectName || 'untitled'

  // Initialize virtual FS from client state
  const vfs = new VirtualFS(body.files || {})

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
    system: SYSTEM_PROMPT + `\n\nProject: "${projectName}"\nExisting files: ${vfs.list().join(', ') || '(empty project)'}`,
    messages,
    maxSteps: 15,
    tools: {

      // ─── File Operations ────────────────────────────────────────

      write_file: tool({
        description: 'Create or overwrite a file. Returns the content so the client can update its state.',
        parameters: z.object({
          path: z.string().describe('File path relative to project root, e.g. "app/page.tsx"'),
          content: z.string().describe('Complete file content'),
        }),
        execute: async ({ path, content }) => {
          vfs.write(path, content)
          return { success: true, path, content, lines: content.split('\n').length }
        },
      }),

      read_file: tool({
        description: 'Read a file from the project.',
        parameters: z.object({
          path: z.string().describe('File path relative to project root'),
        }),
        execute: async ({ path }) => {
          const content = vfs.read(path)
          if (content === undefined) return { error: `File not found: ${path}` }
          return { content, path }
        },
      }),

      edit_file: tool({
        description: 'Edit a file by replacing a specific string. old_string must match exactly.',
        parameters: z.object({
          path: z.string().describe('File path'),
          old_string: z.string().describe('Exact string to find and replace'),
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
          return { success: true, path, content: updated }
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
          return { success: true, path, deleted: true }
        },
      }),

      list_files: tool({
        description: 'List all files in the project. Returns file tree structure.',
        parameters: z.object({
          prefix: z.string().optional().describe('Filter files starting with this path prefix'),
        }),
        execute: async ({ prefix }) => {
          const files = vfs.list(prefix)
          const tree = vfs.toTree()
          return { files, tree, count: files.length }
        },
      }),

      search_files: tool({
        description: 'Search file contents with a regex pattern. Returns matching lines.',
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
        description: 'Scaffold a new project from a template. Creates all config files and base structure.',
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
            success: true,
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

          // Create repo
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

          // Push all files via GitHub Trees API
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

          // Create tree
          const tree = await githubFetch(`/repos/${owner}/${repoName}/git/trees`, {
            method: 'POST',
            body: JSON.stringify({ tree: blobs }),
          })
          if (tree.error) return { error: `Failed to create tree: ${tree.error}` }

          // Create commit
          const commit = await githubFetch(`/repos/${owner}/${repoName}/git/commits`, {
            method: 'POST',
            body: JSON.stringify({
              message: 'Initial commit from Forge',
              tree: tree.sha,
            }),
          })
          if (commit.error) return { error: `Failed to create commit: ${commit.error}` }

          // Update default branch ref
          await githubFetch(`/repos/${owner}/${repoName}/git/refs`, {
            method: 'POST',
            body: JSON.stringify({ ref: 'refs/heads/main', sha: commit.sha }),
          })

          return {
            success: true,
            url: repo.html_url,
            cloneUrl: repo.clone_url,
            owner,
            repoName,
            filesCount: Object.keys(files).length,
          }
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

          // Get current branch HEAD
          const ref = await githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`)
          if (ref.error) return { error: `Failed to get branch: ${ref.error}` }
          const parentSha = ref.object.sha

          // Create blobs for all files
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

          // Create tree
          const tree = await githubFetch(`/repos/${owner}/${repo}/git/trees`, {
            method: 'POST',
            body: JSON.stringify({ base_tree: parentSha, tree: blobs }),
          })
          if (tree.error) return { error: `Failed to create tree: ${tree.error}` }

          // Create commit
          const commit = await githubFetch(`/repos/${owner}/${repo}/git/commits`, {
            method: 'POST',
            body: JSON.stringify({ message, tree: tree.sha, parents: [parentSha] }),
          })
          if (commit.error) return { error: `Failed to commit: ${commit.error}` }

          // Update ref
          const update = await githubFetch(`/repos/${owner}/${repo}/git/refs/heads/${branchName}`, {
            method: 'PATCH',
            body: JSON.stringify({ sha: commit.sha }),
          })
          if (update.error) return { error: `Failed to update ref: ${update.error}` }

          return { success: true, commitSha: commit.sha, filesCount: Object.keys(files).length }
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

          // Auto-detect framework
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
        description: 'Get the complete contents of all files in the project. Useful for understanding the full codebase.',
        parameters: z.object({}),
        execute: async () => {
          const files = vfs.toRecord()
          const summary = Object.entries(files).map(([path, content]) => ({
            path,
            lines: content.split('\n').length,
            size: content.length,
          }))
          return { files, summary, totalFiles: summary.length }
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
          return { success: true, oldPath, newPath, content }
        },
      }),
    },

    onFinish: async (event) => {
      console.log(`[forge] ${event.usage?.totalTokens || 0} tokens, ${event.steps?.length || 0} steps`)
    },
  })

  return result.toDataStreamResponse()
}
