import { tool } from 'ai'
import { z } from 'zod'
import { VirtualFS } from '@/lib/virtual-fs'
import { TEMPLATES, type TemplateName } from '@/lib/templates'
import type { ToolContext } from './types'

export function createProjectTools(ctx: ToolContext) {
  const { vfs, projectName, clientEnvVars } = ctx

  return {
    create_project: tool({
      description: 'Scaffold a new project from a template. Always call this FIRST for new projects. Templates: nextjs (blank), vite-react, static, saas (landing page with hero/features/pricing), blog, dashboard (admin panel with sidebar/stats), ecommerce (product grid with cart), portfolio (developer portfolio), docs (documentation site with sidebar).',
      inputSchema: z.object({
        template: z.enum(['nextjs', 'vite-react', 'static', 'saas', 'blog', 'dashboard', 'ecommerce', 'portfolio', 'docs']).describe('Project template'),
        description: z.string().optional().describe('Project description'),
      }),
      execute: async ({ template, description }) => {
        const scaffold = TEMPLATES[template as TemplateName](projectName, description)
        for (const [path, content] of Object.entries(scaffold)) {
          vfs.write(path, content)
        }
        return { ok: true, template, files: Object.keys(scaffold), allFiles: scaffold }
      },
    }),

    add_dependency: tool({
      description: 'Add an npm package to package.json. Validates the package exists on npm first. ALWAYS use this when importing a package not already in package.json.',
      inputSchema: z.object({
        name: z.string().describe('npm package name, e.g. "framer-motion"'),
        version: z.string().optional().describe('Version range (default: ^latest)'),
        dev: z.boolean().optional().describe('Add to devDependencies instead of dependencies'),
      }),
      execute: async ({ name, version, dev }) => {
        try {
          const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
            headers: { Accept: 'application/json' },
          })
          if (res.status === 404) return { error: `Package "${name}" does not exist on npm. Do NOT import it.` }
          if (!res.ok) return { error: `npm registry error: ${res.status}` }
          const data = await res.json()
          const latest = data['dist-tags']?.latest
          // Validate version format if provided
          if (version && !/^[\^~>=<*]?\d/.test(version) && version !== 'latest' && version !== '*') {
            return { error: `Invalid version format: "${version}". Use semver (e.g., "^1.0.0", "~2.3.0", ">=1.0.0")` }
          }
          const ver = version || `^${latest}`

          const pkgPath = 'package.json'
          const pkgContent = vfs.read(pkgPath)
          if (!pkgContent) return { error: 'No package.json found. Create one first with create_project.' }

          const pkg = JSON.parse(pkgContent)
          const field = dev ? 'devDependencies' : 'dependencies'
          if (!pkg[field]) pkg[field] = {}
          if (pkg[field][name]) return { ok: true, path: pkgPath, note: `${name} already in ${field} (${pkg[field][name]})`, skipped: true }
          pkg[field][name] = ver
          vfs.write(pkgPath, JSON.stringify(pkg, null, 2))
          return { ok: true, path: pkgPath, added: name, version: ver, field }
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to check npm' }
        }
      },
    }),

    scaffold_component: tool({
      description: 'Generate a reusable UI component in shadcn/ui style. Creates the component file with proper TypeScript types, variants, and Tailwind styling.',
      inputSchema: z.object({
        name: z.string().describe('Component name in PascalCase, e.g. "Button", "Card", "Dialog"'),
        type: z.enum(['button', 'card', 'input', 'modal', 'badge', 'alert', 'tabs', 'dropdown', 'avatar', 'tooltip', 'custom']).describe('Component type'),
        variants: z.array(z.string()).optional().describe('Style variants, e.g. ["default", "destructive", "outline", "ghost"]'),
        description: z.string().optional().describe('What the component should do'),
      }),
      execute: async ({ name, type, variants }) => {
        const variantList = variants || ['default']
        const kebab = name.replace(/([A-Z])/g, (m, c, i) => (i > 0 ? '-' : '') + c.toLowerCase())
        const path = `components/ui/${kebab}.tsx`

        const variantStyles = variantList.map(v => {
          switch (v) {
            case 'default': return `      default: 'bg-blue-600 text-white hover:bg-blue-700'`
            case 'destructive': return `      destructive: 'bg-red-600 text-white hover:bg-red-700'`
            case 'outline': return `      outline: 'border border-zinc-300 bg-transparent hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800'`
            case 'ghost': return `      ghost: 'hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-50'`
            case 'secondary': return `      secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-50 dark:hover:bg-zinc-700'`
            default: return `      '${v}': ''`
          }
        }).join(',\n')

        const sizeStyles = `      default: 'h-10 px-4 py-2',
      sm: 'h-9 rounded-md px-3',
      lg: 'h-11 rounded-md px-8',
      icon: 'h-10 w-10'`

        let content: string
        if (type === 'card') {
          content = `import { cn } from '@/lib/utils'\n\ninterface ${name}Props extends React.HTMLAttributes<HTMLDivElement> {\n  children: React.ReactNode\n}\n\nexport function ${name}({ className, children, ...props }: ${name}Props) {\n  return (\n    <div className={cn('rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900', className)} {...props}>\n      {children}\n    </div>\n  )\n}\n\nexport function ${name}Header({ className, children, ...props }: ${name}Props) {\n  return <div className={cn('flex flex-col space-y-1.5 pb-4', className)} {...props}>{children}</div>\n}\n\nexport function ${name}Title({ className, children, ...props }: ${name}Props) {\n  return <h3 className={cn('text-lg font-semibold leading-none', className)} {...props}>{children}</h3>\n}\n\nexport function ${name}Content({ className, children, ...props }: ${name}Props) {\n  return <div className={cn('text-sm text-zinc-500 dark:text-zinc-400', className)} {...props}>{children}</div>\n}\n\nexport function ${name}Footer({ className, children, ...props }: ${name}Props) {\n  return <div className={cn('flex items-center pt-4', className)} {...props}>{children}</div>\n}\n`
        } else if (type === 'input') {
          content = `import { forwardRef } from 'react'\nimport { cn } from '@/lib/utils'\n\nexport interface ${name}Props extends React.InputHTMLAttributes<HTMLInputElement> {\n  label?: string\n  error?: string\n}\n\nexport const ${name} = forwardRef<HTMLInputElement, ${name}Props>(\n  ({ className, label, error, ...props }, ref) => {\n    return (\n      <div className="space-y-1.5">\n        {label && <label className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</label>}\n        <input\n          ref={ref}\n          className={cn(\n            'flex h-10 w-full rounded-lg border bg-white px-3 py-2 dark:bg-zinc-900 text-sm',\n            'placeholder:text-zinc-400 outline-none transition-colors',\n            error ? 'border-red-500' : 'border-zinc-300 focus:border-blue-500 dark:border-zinc-700',\n            className,\n          )}\n          {...props}\n        />\n        {error && <p className="text-xs text-red-500">{error}</p>}\n      </div>\n    )\n  }\n)\n${name}.displayName = '${name}'\n`
        } else if (type === 'modal') {
          content = `'use client'\n\nimport { useEffect, useRef } from 'react'\nimport { X } from 'lucide-react'\nimport { cn } from '@/lib/utils'\n\ninterface ${name}Props {\n  open: boolean\n  onClose: () => void\n  title?: string\n  children: React.ReactNode\n  className?: string\n}\n\nexport function ${name}({ open, onClose, title, children, className }: ${name}Props) {\n  const overlayRef = useRef<HTMLDivElement>(null)\n\n  useEffect(() => {\n    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }\n    if (open) document.addEventListener('keydown', handleEsc)\n    return () => document.removeEventListener('keydown', handleEsc)\n  }, [open, onClose])\n\n  if (!open) return null\n\n  return (\n    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === overlayRef.current) onClose() }}>\n      <div className="fixed inset-0 bg-black/50" />\n      <div className={cn('relative z-50 w-full max-w-lg rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950 shadow-xl animate-fade-in', className)}>\n        <div className="flex items-center justify-between mb-4">\n          {title && <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>}\n          <button onClick={onClose} className="p-1 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-colors">\n            <X className="w-4 h-4" />\n          </button>\n        </div>\n        {children}\n      </div>\n    </div>\n  )\n}\n`
        } else if (type === 'badge') {
          content = `import { cn } from '@/lib/utils'\n\nconst variants = {\n${variantStyles}\n} as const\n\ninterface ${name}Props extends React.HTMLAttributes<HTMLSpanElement> {\n  variant?: keyof typeof variants\n  children: React.ReactNode\n}\n\nexport function ${name}({ variant = 'default', className, children, ...props }: ${name}Props) {\n  return (\n    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors', variants[variant], className)} {...props}>\n      {children}\n    </span>\n  )\n}\n`
        } else if (type === 'alert') {
          content = `import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react'\nimport { cn } from '@/lib/utils'\n\nconst variants = {\n  info: { icon: Info, className: 'bg-blue-50 text-blue-800 border-blue-200' },\n  success: { icon: CheckCircle, className: 'bg-green-50 text-green-800 border-green-200' },\n  warning: { icon: AlertTriangle, className: 'bg-yellow-50 text-yellow-800 border-yellow-200' },\n  error: { icon: XCircle, className: 'bg-red-50 text-red-800 border-red-200' },\n}\n\ninterface ${name}Props {\n  variant?: keyof typeof variants\n  title?: string\n  children: React.ReactNode\n  className?: string\n}\n\nexport function ${name}({ variant = 'info', title, children, className }: ${name}Props) {\n  const { icon: Icon, className: variantClass } = variants[variant]\n  return (\n    <div className={cn('flex gap-3 rounded-lg border p-4', variantClass, className)}>\n      <Icon className="w-5 h-5 shrink-0 mt-0.5" />\n      <div>\n        {title && <p className="font-medium mb-1">{title}</p>}\n        <div className="text-sm">{children}</div>\n      </div>\n    </div>\n  )\n}\n`
        } else {
          // Default: button-style component with variants
          content = `import { cn } from '@/lib/utils'\n\nconst variants = {\n${variantStyles}\n} as const\n\nconst sizes = {\n${sizeStyles}\n} as const\n\ninterface ${name}Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {\n  variant?: keyof typeof variants\n  size?: keyof typeof sizes\n}\n\nexport function ${name}({ variant = 'default', size = 'default', className, children, ...props }: ${name}Props) {\n  return (\n    <button\n      className={cn(\n        'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors',\n        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50',\n        'disabled:pointer-events-none disabled:opacity-50',\n        variants[variant],\n        sizes[size],\n        className,\n      )}\n      {...props}\n    >\n      {children}\n    </button>\n  )\n}\n`
        }

        vfs.write(path, content)
        return { ok: true, path, component: name, type, variants: variantList, lines: content.split('\n').length }
      },
    }),

    generate_env_file: tool({
      description: 'Analyze project files and generate a .env.example file listing all required environment variables.',
      inputSchema: z.object({}),
      execute: async () => {
        const envVars = new Map<string, string>()
        for (const [path, content] of vfs.files) {
          const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)
          for (const match of matches) {
            if (!envVars.has(match[1])) envVars.set(match[1], path)
          }
          const metaMatches = content.matchAll(/import\.meta\.env\.([A-Z_][A-Z0-9_]*)/g)
          for (const match of metaMatches) {
            if (!envVars.has(match[1])) envVars.set(match[1], path)
          }
        }
        if (envVars.size === 0) return { ok: true, path: '.env.example', note: 'No environment variables found in project files' }
        const lines = ['# Environment Variables', '# Generated from project source code', '']
        const sorted = Array.from(envVars.entries()).sort((a, b) => a[0].localeCompare(b[0]))
        for (const [name, source] of sorted) {
          lines.push(`# Used in: ${source}`)
          lines.push(name.startsWith('NEXT_PUBLIC_') ? `${name}=  # Public (exposed to browser)` : `${name}=  # Server-side only`)
          lines.push('')
        }
        const content = lines.join('\n')
        vfs.write('.env.example', content)
        return { ok: true, path: '.env.example', variables: sorted.map(([name]) => name), count: envVars.size }
      },
    }),

    add_image: tool({
      description: 'Find a free image from Unsplash for the project. Returns a working image URL you can use in img tags or CSS backgrounds. If UNSPLASH_ACCESS_KEY is not set, returns placeholder guidance instead.',
      inputSchema: z.object({
        query: z.string().describe('Search query (e.g. "mountain landscape", "coffee shop", "team meeting")'),
        orientation: z.enum(['landscape', 'portrait', 'squarish']).default('landscape').describe('Image orientation'),
        size: z.enum(['raw', 'full', 'regular', 'small', 'thumb']).default('regular').describe('Image size variant'),
      }),
      execute: async ({ query, orientation, size }) => {
        const accessKey = clientEnvVars.UNSPLASH_ACCESS_KEY || process.env.UNSPLASH_ACCESS_KEY
        if (!accessKey) {
          const sizeMap: Record<string, string> = { raw: '1600x900', full: '1200x800', regular: '800x600', small: '400x300', thumb: '150x150' }
          const dims = sizeMap[size] || '800x600'
          const placeholderUrl = `https://placehold.co/${dims}/1a1a2e/eaeaea?text=${encodeURIComponent(query.slice(0, 20))}`
          return { ok: true, url: placeholderUrl, suggestion: `Use: <img src="${placeholderUrl}" alt="${query}" />`, tip: 'This is a placeholder. Set UNSPLASH_ACCESS_KEY env var (free at unsplash.com/developers) for real photos.' }
        }
        try {
          const params = new URLSearchParams({ query, orientation, per_page: '1' })
          const res = await fetch(`https://api.unsplash.com/search/photos?${params}`, {
            headers: { Authorization: `Client-ID ${accessKey}` },
            signal: AbortSignal.timeout(10000),
          })
          if (!res.ok) return { error: `Unsplash API error: ${res.status}` }
          const data = await res.json()
          if (!data.results?.length) return { error: `No images found for "${query}". Try a broader search term.` }
          const photo = data.results[0]
          const imageUrl = photo.urls?.[size] || photo.urls?.regular
          return { ok: true, url: imageUrl, downloadUrl: photo.links?.download_location, author: photo.user?.name, authorUrl: photo.user?.links?.html, suggestion: `Use: <img src="${imageUrl}" alt="${query}" />`, attribution: `Photo by ${photo.user?.name} on Unsplash` }
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'Failed to search Unsplash' }
        }
      },
    }),
  }
}
