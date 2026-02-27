import { streamText, tool, convertToCoreMessages } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, rmSync } from 'fs'
import { join, dirname, relative, sep } from 'path'
import { execSync } from 'child_process'

// ═══════════════════════════════════════════════════════════════════
// Config
// ═══════════════════════════════════════════════════════════════════

const PROJECTS_DIR = (process.env.PROJECTS_DIR || 'C:/Users/leigh/forge-projects').replace(/\\/g, '/')

function getProjectDir(projectName: string): string {
  const safe = projectName.replace(/[^a-zA-Z0-9_-]/g, '_')
  return join(PROJECTS_DIR, safe).replace(/\\/g, '/')
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

function safePath(projectDir: string, filePath: string): string {
  const resolved = join(projectDir, filePath).replace(/\\/g, '/')
  if (!resolved.startsWith(projectDir.replace(/\\/g, '/'))) {
    throw new Error('Path traversal blocked')
  }
  return resolved
}

// ═══════════════════════════════════════════════════════════════════
// File tree builder
// ═══════════════════════════════════════════════════════════════════

interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeNode[]
}

const IGNORE = new Set(['node_modules', '.next', '.git', 'dist', '.turbo', '.vercel', '__pycache__'])

function buildTree(dir: string, basePath: string = ''): TreeNode[] {
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

// ═══════════════════════════════════════════════════════════════════
// Grep helper
// ═══════════════════════════════════════════════════════════════════

function grepFiles(dir: string, pattern: string, maxResults = 30): Array<{ file: string; line: number; text: string }> {
  const results: Array<{ file: string; line: number; text: string }> = []
  const regex = new RegExp(pattern, 'i')

  function walk(d: string, base: string) {
    if (results.length >= maxResults) return
    if (!existsSync(d)) return
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (IGNORE.has(entry.name) || entry.name.startsWith('.')) continue
      const full = join(d, entry.name)
      const rel = base ? `${base}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(full, rel)
      } else {
        try {
          const content = readFileSync(full, 'utf-8')
          const lines = content.split('\n')
          for (let i = 0; i < lines.length && results.length < maxResults; i++) {
            if (regex.test(lines[i])) {
              results.push({ file: rel, line: i + 1, text: lines[i].trim().slice(0, 200) })
            }
          }
        } catch { /* binary or unreadable */ }
      }
    }
  }
  walk(dir, '')
  return results
}

// ═══════════════════════════════════════════════════════════════════
// Shell helper
// ═══════════════════════════════════════════════════════════════════

function runShell(cmd: string, cwd: string, timeoutMs = 30000): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(cmd, {
      cwd,
      timeout: timeoutMs,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: 'bash',
      env: { ...process.env, FORCE_COLOR: '0' },
    })
    return { stdout: stdout.slice(0, 8000), stderr: '', exitCode: 0 }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; status?: number }
    return {
      stdout: (e.stdout || '').slice(0, 4000),
      stderr: (e.stderr || '').slice(0, 4000),
      exitCode: e.status || 1,
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// System prompt
// ═══════════════════════════════════════════════════════════════════

const SYSTEM_PROMPT = `You are Forge, an expert AI React website builder. You create, edit, and deploy React websites and web applications.

You have FULL access to the project filesystem and git. When the user describes what they want, you BUILD it immediately — write files, install packages, set up the project. Don't ask for permission, just do it.

## Behaviour Rules

1. **Act first, report after.** Don't say "I'll create..." — just create the files and show what you did.
2. **Write COMPLETE code.** Never use placeholder comments like "// add more here". Every file must be production-ready.
3. **Use modern React patterns.** Functional components, hooks, TypeScript, Tailwind CSS.
4. **Structure files properly.** Components in components/, pages in app/, utilities in lib/, types in types/.
5. **Be concise.** Short explanations. The code speaks for itself.
6. **When editing, be surgical.** Use edit_file for small changes. Use write_file only when rewriting most of a file.
7. **Install dependencies.** If you use a library, install it with install_packages first.
8. **One step at a time.** Create files in logical order — config first, then components, then pages.

## Tech Stack Defaults

- **Framework:** Next.js 15 (App Router) or Vite + React (user's choice)
- **Language:** TypeScript (.tsx/.ts)
- **Styling:** Tailwind CSS v4
- **Icons:** lucide-react
- **Components:** Build from scratch with Tailwind (shadcn/ui patterns)
- **State:** React hooks (useState, useReducer, useContext) — add Zustand if complex
- **Forms:** React Hook Form + Zod validation when needed
- **Animation:** Framer Motion for transitions

## Project Templates

When creating a new project, scaffold the full structure:

### Next.js (default)
- package.json with all deps
- next.config.ts
- tsconfig.json
- tailwind.config.ts + postcss.config.mjs
- app/layout.tsx (with fonts, metadata)
- app/page.tsx
- app/globals.css
- components/ directory
- lib/utils.ts (cn helper)
- public/ directory

### Vite + React
- package.json with all deps
- vite.config.ts
- tsconfig.json
- index.html
- src/main.tsx
- src/App.tsx
- src/index.css
- src/components/
- src/lib/

## Git Workflow

- After creating a project, run git_init to initialize the repo
- After major changes, suggest committing with a descriptive message
- For deployment, help set up the remote and push

## Safety

- Never delete files without the user asking
- Never run destructive commands (rm -rf, DROP TABLE, etc.) without confirmation
- Never expose secrets in generated code
- Always use environment variables for API keys

## Response Format

After making changes, give a brief summary:
- What files were created/modified
- What the user should see
- Any next steps or suggestions`

// ═══════════════════════════════════════════════════════════════════
// POST handler — streaming AI chat with tools
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: Request) {
  const body = await req.json()
  const projectName = body.projectName || 'untitled'
  const projectDir = getProjectDir(projectName)
  ensureDir(projectDir)

  // Convert messages
  let messages
  try {
    messages = convertToCoreMessages(body.messages)
  } catch {
    messages = (body.messages || []).map((m: { role: string; content?: string; parts?: Array<{ type: string; text?: string }> }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content || m.parts?.filter((p: { type: string }) => p.type === 'text').map((p: { text?: string }) => p.text).join('\n') || '',
    }))
  }

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: SYSTEM_PROMPT + `\n\nCurrent project: "${projectName}" at ${projectDir}\nProject files exist: ${existsSync(join(projectDir, 'package.json'))}`,
    messages,
    maxSteps: 15,
    tools: {

      // ─── File Operations ────────────────────────────────────────

      write_file: tool({
        description: 'Create or overwrite a file in the project. Use for new files or when rewriting most of a file.',
        parameters: z.object({
          path: z.string().describe('Relative path from project root, e.g. "src/components/Button.tsx"'),
          content: z.string().describe('Complete file content'),
        }),
        execute: async ({ path, content }) => {
          try {
            const fullPath = safePath(projectDir, path)
            ensureDir(dirname(fullPath))
            writeFileSync(fullPath, content, 'utf-8')
            return { success: true, path, size: content.length, lines: content.split('\n').length }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      read_file: tool({
        description: 'Read a file from the project.',
        parameters: z.object({
          path: z.string().describe('Relative path from project root'),
        }),
        execute: async ({ path }) => {
          try {
            const fullPath = safePath(projectDir, path)
            if (!existsSync(fullPath)) return { error: `File not found: ${path}` }
            const content = readFileSync(fullPath, 'utf-8')
            if (content.length > 50000) {
              return { content: content.slice(0, 50000), truncated: true, totalSize: content.length }
            }
            return { content, size: content.length }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      edit_file: tool({
        description: 'Edit a file by replacing a specific string. Use for surgical changes to existing files. The old_string must match exactly (including whitespace).',
        parameters: z.object({
          path: z.string().describe('Relative path from project root'),
          old_string: z.string().describe('Exact string to find and replace'),
          new_string: z.string().describe('Replacement string'),
        }),
        execute: async ({ path, old_string, new_string }) => {
          try {
            const fullPath = safePath(projectDir, path)
            if (!existsSync(fullPath)) return { error: `File not found: ${path}` }
            const content = readFileSync(fullPath, 'utf-8')
            if (!content.includes(old_string)) {
              // Try whitespace-normalized matching
              const normalizeWs = (s: string) => s.replace(/\s+/g, ' ').trim()
              const normContent = normalizeWs(content)
              const normOld = normalizeWs(old_string)
              if (!normContent.includes(normOld)) {
                return { error: 'old_string not found in file. Read the file first to get exact content.' }
              }
              // Find the actual substring
              const idx = normContent.indexOf(normOld)
              let charCount = 0, start = 0, end = 0
              for (let i = 0; i < content.length; i++) {
                if (normalizeWs(content.slice(start, i + 1)).length >= normalizeWs(content.slice(start, i + 1)).trimEnd().length) {
                  // Simplified: just fail and ask to read file
                  return { error: 'Whitespace mismatch. Read the file first to get exact content.' }
                }
              }
              return { error: 'Whitespace mismatch. Read the file first.' }
            }
            const occurrences = content.split(old_string).length - 1
            if (occurrences > 1) {
              return { error: `old_string found ${occurrences} times. Provide more context to make it unique.` }
            }
            const updated = content.replace(old_string, new_string)
            writeFileSync(fullPath, updated, 'utf-8')
            return { success: true, path }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      delete_file: tool({
        description: 'Delete a file or directory from the project.',
        parameters: z.object({
          path: z.string().describe('Relative path from project root'),
        }),
        execute: async ({ path }) => {
          try {
            const fullPath = safePath(projectDir, path)
            if (!existsSync(fullPath)) return { error: `Not found: ${path}` }
            const stat = statSync(fullPath)
            if (stat.isDirectory()) {
              rmSync(fullPath, { recursive: true })
            } else {
              unlinkSync(fullPath)
            }
            return { success: true, path, deleted: stat.isDirectory() ? 'directory' : 'file' }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      list_files: tool({
        description: 'List all files in the project (or a subdirectory). Returns a tree structure.',
        parameters: z.object({
          path: z.string().optional().describe('Subdirectory to list. Omit for project root.'),
        }),
        execute: async ({ path }) => {
          try {
            const dir = path ? safePath(projectDir, path) : projectDir
            const tree = buildTree(dir)
            return { files: tree, projectDir }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      search_files: tool({
        description: 'Search file contents with regex pattern. Returns matching lines with file paths and line numbers.',
        parameters: z.object({
          pattern: z.string().describe('Regex pattern to search for'),
          path: z.string().optional().describe('Subdirectory to search in'),
        }),
        execute: async ({ pattern, path }) => {
          try {
            const dir = path ? safePath(projectDir, path) : projectDir
            const results = grepFiles(dir, pattern)
            return { results, count: results.length }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      glob_files: tool({
        description: 'Find files matching a glob pattern (e.g. "**/*.tsx", "src/components/*.ts").',
        parameters: z.object({
          pattern: z.string().describe('Glob-like pattern. Use * for single level, ** for recursive.'),
        }),
        execute: async ({ pattern }) => {
          try {
            const results: string[] = []
            const regex = new RegExp(
              '^' + pattern.replace(/\*\*/g, '___GLOBSTAR___').replace(/\*/g, '[^/]*').replace(/___GLOBSTAR___/g, '.*') + '$'
            )
            function walk(dir: string, base: string) {
              if (!existsSync(dir)) return
              for (const entry of readdirSync(dir, { withFileTypes: true })) {
                if (IGNORE.has(entry.name) || entry.name.startsWith('.')) continue
                const rel = base ? `${base}/${entry.name}` : entry.name
                if (entry.isDirectory()) {
                  walk(join(dir, entry.name), rel)
                } else if (regex.test(rel)) {
                  results.push(rel)
                }
              }
            }
            walk(projectDir, '')
            return { files: results.slice(0, 100), count: results.length }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      // ─── Project Operations ─────────────────────────────────────

      create_project: tool({
        description: 'Scaffold a new project from a template. Creates all necessary config files and folder structure.',
        parameters: z.object({
          template: z.enum(['nextjs', 'vite-react', 'static']).describe('Project template to use'),
          description: z.string().optional().describe('Brief description of the project'),
        }),
        execute: async ({ template, description }) => {
          try {
            ensureDir(projectDir)

            if (template === 'nextjs') {
              // package.json
              writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
                name: projectName,
                version: '0.1.0',
                private: true,
                scripts: { dev: 'next dev', build: 'next build', start: 'next start', lint: 'next lint' },
                dependencies: {
                  next: '^15.3.3', react: '^19.1.0', 'react-dom': '^19.1.0',
                  'lucide-react': '^0.511.0', clsx: '^2.1.1', 'tailwind-merge': '^3.3.0',
                },
                devDependencies: {
                  '@tailwindcss/postcss': '^4.1.8', tailwindcss: '^4.1.8',
                  '@types/node': '^22.15.21', '@types/react': '^19.1.4', typescript: '^5.8.3',
                },
              }, null, 2) + '\n', 'utf-8')

              writeFileSync(join(projectDir, 'next.config.ts'), `import type { NextConfig } from 'next'\nconst nextConfig: NextConfig = {}\nexport default nextConfig\n`, 'utf-8')
              writeFileSync(join(projectDir, 'tsconfig.json'), JSON.stringify({
                compilerOptions: {
                  target: 'ES2017', lib: ['dom', 'dom.iterable', 'esnext'], allowJs: true, skipLibCheck: true,
                  strict: true, noEmit: true, esModuleInterop: true, module: 'esnext', moduleResolution: 'bundler',
                  resolveJsonModule: true, isolatedModules: true, jsx: 'preserve', incremental: true,
                  plugins: [{ name: 'next' }], paths: { '@/*': ['./*'] },
                },
                include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
                exclude: ['node_modules'],
              }, null, 2) + '\n', 'utf-8')

              writeFileSync(join(projectDir, 'postcss.config.mjs'), `const config = { plugins: { "@tailwindcss/postcss": {} } }\nexport default config\n`, 'utf-8')

              ensureDir(join(projectDir, 'app'))
              writeFileSync(join(projectDir, 'app', 'globals.css'), '@import "tailwindcss";\n', 'utf-8')
              writeFileSync(join(projectDir, 'app', 'layout.tsx'), `import type { Metadata } from 'next'\nimport './globals.css'\n\nexport const metadata: Metadata = {\n  title: '${projectName}',\n  description: '${description || 'Built with Forge'}',\n}\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body className="antialiased">{children}</body>\n    </html>\n  )\n}\n`, 'utf-8')
              writeFileSync(join(projectDir, 'app', 'page.tsx'), `export default function Home() {\n  return (\n    <main className="min-h-screen flex items-center justify-center">\n      <h1 className="text-4xl font-bold">Welcome to ${projectName}</h1>\n    </main>\n  )\n}\n`, 'utf-8')

              ensureDir(join(projectDir, 'components'))
              ensureDir(join(projectDir, 'lib'))
              writeFileSync(join(projectDir, 'lib', 'utils.ts'), `import { clsx, type ClassValue } from 'clsx'\nimport { twMerge } from 'tailwind-merge'\n\nexport function cn(...inputs: ClassValue[]) {\n  return twMerge(clsx(inputs))\n}\n`, 'utf-8')

              ensureDir(join(projectDir, 'public'))
              writeFileSync(join(projectDir, '.gitignore'), '.next/\nnode_modules/\n.env.local\n*.tsbuildinfo\nnext-env.d.ts\n', 'utf-8')

              return { success: true, template: 'nextjs', files: 10, message: 'Next.js project scaffolded. Run install_packages to install deps.' }
            }

            if (template === 'vite-react') {
              writeFileSync(join(projectDir, 'package.json'), JSON.stringify({
                name: projectName, version: '0.1.0', private: true, type: 'module',
                scripts: { dev: 'vite', build: 'tsc -b && vite build', preview: 'vite preview' },
                dependencies: { react: '^19.1.0', 'react-dom': '^19.1.0', 'lucide-react': '^0.511.0' },
                devDependencies: {
                  '@types/react': '^19.1.4', '@types/react-dom': '^19.1.5', '@vitejs/plugin-react': '^4.4.1',
                  tailwindcss: '^4.1.8', '@tailwindcss/vite': '^4.1.8', typescript: '^5.8.3', vite: '^6.3.5',
                },
              }, null, 2) + '\n', 'utf-8')

              writeFileSync(join(projectDir, 'vite.config.ts'), `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\nimport tailwindcss from '@tailwindcss/vite'\n\nexport default defineConfig({\n  plugins: [react(), tailwindcss()],\n})\n`, 'utf-8')
              writeFileSync(join(projectDir, 'tsconfig.json'), JSON.stringify({
                compilerOptions: {
                  target: 'ES2020', useDefineForClassFields: true, lib: ['ES2020', 'DOM', 'DOM.Iterable'],
                  module: 'ESNext', skipLibCheck: true, moduleResolution: 'bundler', allowImportingTsExtensions: true,
                  isolatedModules: true, noEmit: true, jsx: 'react-jsx', strict: true, noUnusedLocals: true,
                  noUnusedParameters: true, noFallthroughCasesInSwitch: true,
                  paths: { '@/*': ['./src/*'] },
                },
                include: ['src'],
              }, null, 2) + '\n', 'utf-8')

              writeFileSync(join(projectDir, 'index.html'), `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n    <title>${projectName}</title>\n  </head>\n  <body>\n    <div id="root"></div>\n    <script type="module" src="/src/main.tsx"></script>\n  </body>\n</html>\n`, 'utf-8')

              ensureDir(join(projectDir, 'src'))
              ensureDir(join(projectDir, 'src', 'components'))
              ensureDir(join(projectDir, 'src', 'lib'))
              writeFileSync(join(projectDir, 'src', 'main.tsx'), `import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport App from './App'\nimport './index.css'\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n)\n`, 'utf-8')
              writeFileSync(join(projectDir, 'src', 'App.tsx'), `export default function App() {\n  return (\n    <main className="min-h-screen flex items-center justify-center">\n      <h1 className="text-4xl font-bold">Welcome to ${projectName}</h1>\n    </main>\n  )\n}\n`, 'utf-8')
              writeFileSync(join(projectDir, 'src', 'index.css'), '@import "tailwindcss";\n', 'utf-8')
              writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\ndist/\n.env.local\n', 'utf-8')

              return { success: true, template: 'vite-react', files: 9, message: 'Vite + React project scaffolded. Run install_packages to install deps.' }
            }

            // Static HTML
            ensureDir(projectDir)
            writeFileSync(join(projectDir, 'index.html'), `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${projectName}</title>\n  <script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body class="min-h-screen bg-white">\n  <main class="flex items-center justify-center min-h-screen">\n    <h1 class="text-4xl font-bold">Welcome to ${projectName}</h1>\n  </main>\n</body>\n</html>\n`, 'utf-8')
            writeFileSync(join(projectDir, '.gitignore'), 'node_modules/\n', 'utf-8')
            return { success: true, template: 'static', files: 2 }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      install_packages: tool({
        description: 'Install npm packages. With no arguments, runs "npm install". With packages specified, runs "npm install <packages>".',
        parameters: z.object({
          packages: z.string().optional().describe('Space-separated package names, e.g. "framer-motion zod". Omit to install from package.json.'),
          dev: z.boolean().optional().describe('Install as devDependency'),
        }),
        execute: async ({ packages, dev }) => {
          try {
            let cmd = 'npm install'
            if (packages) {
              cmd += (dev ? ' -D ' : ' ') + packages
            }
            const result = runShell(cmd, projectDir, 120000)
            return { success: result.exitCode === 0, command: cmd, stdout: result.stdout.slice(-2000), stderr: result.stderr.slice(-1000) }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      run_command: tool({
        description: 'Run a shell command in the project directory. For build commands, dev servers, etc.',
        parameters: z.object({
          command: z.string().describe('Shell command to execute'),
          timeout: z.number().optional().describe('Timeout in ms (default 30000)'),
        }),
        execute: async ({ command, timeout }) => {
          // Block obviously dangerous commands
          const blocked = ['rm -rf /', 'rm -rf ~', 'format ', 'mkfs', ':(){:|:&};:']
          if (blocked.some(b => command.includes(b))) {
            return { error: 'Blocked: dangerous command' }
          }
          try {
            const result = runShell(command, projectDir, timeout || 30000)
            return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      // ─── Git Operations ─────────────────────────────────────────

      git_init: tool({
        description: 'Initialize a git repository in the project directory.',
        parameters: z.object({}),
        execute: async () => {
          try {
            const result = runShell('git init', projectDir)
            return { success: result.exitCode === 0, output: result.stdout }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      git_status: tool({
        description: 'Show git status of the project.',
        parameters: z.object({}),
        execute: async () => {
          try {
            const result = runShell('git status -sb', projectDir)
            return { output: result.stdout, exitCode: result.exitCode }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      git_add: tool({
        description: 'Stage files for commit.',
        parameters: z.object({
          files: z.string().optional().describe('Space-separated file paths. Omit to add all changes.'),
        }),
        execute: async ({ files }) => {
          try {
            const cmd = files ? `git add ${files}` : 'git add -A'
            const result = runShell(cmd, projectDir)
            return { success: result.exitCode === 0, command: cmd }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      git_commit: tool({
        description: 'Create a git commit with a message.',
        parameters: z.object({
          message: z.string().describe('Commit message'),
        }),
        execute: async ({ message }) => {
          try {
            const result = runShell(`git add -A && git commit -m "${message.replace(/"/g, '\\"')}"`, projectDir)
            return { success: result.exitCode === 0, output: result.stdout }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      git_push: tool({
        description: 'Push commits to remote repository.',
        parameters: z.object({
          remote: z.string().optional().describe('Remote name (default: origin)'),
          branch: z.string().optional().describe('Branch name (default: current branch)'),
          setUpstream: z.boolean().optional().describe('Set upstream tracking (-u flag)'),
        }),
        execute: async ({ remote, branch, setUpstream }) => {
          try {
            let cmd = 'git push'
            if (setUpstream) cmd += ' -u'
            if (remote) cmd += ` ${remote}`
            if (branch) cmd += ` ${branch}`
            const result = runShell(cmd, projectDir)
            return { success: result.exitCode === 0, output: result.stdout + result.stderr }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      git_diff: tool({
        description: 'Show git diff of changes.',
        parameters: z.object({
          staged: z.boolean().optional().describe('Show staged changes only'),
          file: z.string().optional().describe('Specific file to diff'),
        }),
        execute: async ({ staged, file }) => {
          try {
            let cmd = 'git diff'
            if (staged) cmd += ' --cached'
            if (file) cmd += ` -- ${file}`
            const result = runShell(cmd, projectDir)
            return { diff: result.stdout.slice(0, 8000) }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      git_log: tool({
        description: 'Show git commit history.',
        parameters: z.object({
          count: z.number().optional().describe('Number of commits to show (default 10)'),
        }),
        execute: async ({ count }) => {
          try {
            const result = runShell(`git log --oneline -${count || 10}`, projectDir)
            return { log: result.stdout }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      git_branch: tool({
        description: 'List, create, or switch branches.',
        parameters: z.object({
          name: z.string().optional().describe('Branch name to create or switch to'),
          action: z.enum(['list', 'create', 'switch', 'delete']).optional().describe('Action to perform (default: list)'),
        }),
        execute: async ({ name, action }) => {
          try {
            let cmd: string
            switch (action) {
              case 'create': cmd = `git checkout -b ${name}`; break
              case 'switch': cmd = `git checkout ${name}`; break
              case 'delete': cmd = `git branch -d ${name}`; break
              default: cmd = 'git branch -a'
            }
            const result = runShell(cmd, projectDir)
            return { output: result.stdout, exitCode: result.exitCode }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      git_clone: tool({
        description: 'Clone a git repository into the project directory.',
        parameters: z.object({
          url: z.string().describe('Repository URL to clone'),
        }),
        execute: async ({ url }) => {
          try {
            // Clone into a temp name then move contents
            const result = runShell(`git clone ${url} .`, projectDir)
            return { success: result.exitCode === 0, output: result.stdout + result.stderr }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      git_remote: tool({
        description: 'Manage git remotes. Add, remove, or list remotes.',
        parameters: z.object({
          action: z.enum(['list', 'add', 'remove']).describe('Action to perform'),
          name: z.string().optional().describe('Remote name (e.g. "origin")'),
          url: z.string().optional().describe('Remote URL (for add action)'),
        }),
        execute: async ({ action, name, url }) => {
          try {
            let cmd: string
            switch (action) {
              case 'add': cmd = `git remote add ${name} ${url}`; break
              case 'remove': cmd = `git remote remove ${name}`; break
              default: cmd = 'git remote -v'
            }
            const result = runShell(cmd, projectDir)
            return { output: result.stdout, exitCode: result.exitCode }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      // ─── Deployment ─────────────────────────────────────────────

      deploy_vercel: tool({
        description: 'Deploy the project to Vercel using the Vercel CLI. Requires vercel CLI installed globally.',
        parameters: z.object({
          prod: z.boolean().optional().describe('Deploy to production (default: preview)'),
        }),
        execute: async ({ prod }) => {
          try {
            const cmd = prod ? 'npx vercel --prod --yes' : 'npx vercel --yes'
            const result = runShell(cmd, projectDir, 120000)
            return { success: result.exitCode === 0, output: result.stdout + result.stderr }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),

      deploy_gh_pages: tool({
        description: 'Create a GitHub repository and push using gh CLI.',
        parameters: z.object({
          repoName: z.string().describe('Repository name on GitHub'),
          public: z.boolean().optional().describe('Make repo public (default: private)'),
          description: z.string().optional().describe('Repository description'),
        }),
        execute: async ({ repoName, public: isPublic, description }) => {
          try {
            const visibility = isPublic ? '--public' : '--private'
            const desc = description ? `--description "${description}"` : ''
            // Create repo and push
            const initResult = runShell('git rev-parse --is-inside-work-tree', projectDir)
            if (initResult.exitCode !== 0) {
              runShell('git init && git add -A && git commit -m "Initial commit"', projectDir)
            }
            const createResult = runShell(`gh repo create ${repoName} ${visibility} ${desc} --source=. --push`, projectDir, 60000)
            return { success: createResult.exitCode === 0, output: createResult.stdout + createResult.stderr }
          } catch (e) {
            return { error: String(e) }
          }
        },
      }),
    },

    onFinish: async (event) => {
      // Could log usage here
      console.log(`[forge] Finished: ${event.usage?.totalTokens || 0} tokens`)
    },
  })

  return result.toDataStreamResponse()
}

// ═══════════════════════════════════════════════════════════════════
// GET — list projects
// ═══════════════════════════════════════════════════════════════════

export async function GET() {
  ensureDir(PROJECTS_DIR)
  try {
    const entries = readdirSync(PROJECTS_DIR, { withFileTypes: true })
    const projects = entries
      .filter(e => e.isDirectory())
      .map(e => {
        const dir = join(PROJECTS_DIR, e.name)
        const stat = statSync(dir)
        return {
          name: e.name,
          path: dir.replace(/\\/g, '/'),
          createdAt: stat.birthtime.toISOString(),
          updatedAt: stat.mtime.toISOString(),
          hasPackageJson: existsSync(join(dir, 'package.json')),
          hasGit: existsSync(join(dir, '.git')),
        }
      })
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return Response.json({ projects })
  } catch (e) {
    return Response.json({ error: String(e) }, { status: 500 })
  }
}
