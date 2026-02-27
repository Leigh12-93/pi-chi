import { streamText, tool, convertToCoreMessages } from 'ai'
import { anthropic } from '@ai-sdk/anthropic'
import { z } from 'zod'
import { supabase } from '@/lib/supabase'
import { SYSTEM_PROMPT } from '@/lib/system-prompt'
import { mcpClient } from '@/lib/mcp-client'
import { createSandbox, getSandboxStatus, destroySandbox } from '@/lib/e2b-sandbox'
import { chatLimiter } from '@/lib/rate-limit'

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

// ─── Extended Templates ──────────────────────────────────────────
// Each extends the Next.js base with real, production-ready content

function scaffoldSaaS(name: string): Record<string, string> {
  const base = scaffoldNextJS(name, 'SaaS landing page')
  return {
    ...base,
    'app/page.tsx': `import { ArrowRight, Zap, Shield, BarChart3, Check } from 'lucide-react'

const FEATURES = [
  { icon: Zap, title: 'Lightning Fast', desc: 'Built for speed with edge computing and smart caching.' },
  { icon: Shield, title: 'Secure by Default', desc: 'Enterprise-grade security with SOC 2 compliance.' },
  { icon: BarChart3, title: 'Analytics Built In', desc: 'Real-time dashboards and actionable insights.' },
]

const PLANS = [
  { name: 'Starter', price: '$9', features: ['5 projects', '10GB storage', 'Email support'] },
  { name: 'Pro', price: '$29', features: ['Unlimited projects', '100GB storage', 'Priority support', 'API access'], popular: true },
  { name: 'Enterprise', price: '$99', features: ['Everything in Pro', 'Custom integrations', 'Dedicated support', 'SLA guarantee'] },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">${name}</span>
        <div className="flex items-center gap-6">
          <a href="#features" className="text-sm text-gray-600 hover:text-gray-900">Features</a>
          <a href="#pricing" className="text-sm text-gray-600 hover:text-gray-900">Pricing</a>
          <button className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 transition-colors">Get Started</button>
        </div>
      </nav>

      {/* Hero */}
      <section className="px-6 pt-20 pb-32 text-center max-w-4xl mx-auto">
        <div className="inline-block px-3 py-1 bg-blue-50 text-blue-700 text-xs font-medium rounded-full mb-6">Now in public beta</div>
        <h1 className="text-5xl sm:text-6xl font-bold text-gray-900 tracking-tight mb-6">Build better products,<br /><span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">ship faster</span></h1>
        <p className="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">The all-in-one platform that helps teams build, deploy, and scale modern applications without the complexity.</p>
        <div className="flex gap-3 justify-center">
          <button className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 flex items-center gap-2 transition-colors">Start free trial <ArrowRight className="w-4 h-4" /></button>
          <button className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">Watch demo</button>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="px-6 py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Everything you need</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white p-6 rounded-xl border border-gray-200">
                <div className="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center mb-4"><Icon className="w-5 h-5 text-blue-600" /></div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-sm text-gray-600">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-6 py-20">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">Simple pricing</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div key={plan.name} className={\`p-6 rounded-xl border \${plan.popular ? 'border-blue-600 ring-1 ring-blue-600' : 'border-gray-200'}\`}>
                {plan.popular && <span className="text-xs font-medium text-blue-600 mb-2 block">Most popular</span>}
                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                <div className="mt-2 mb-4"><span className="text-4xl font-bold text-gray-900">{plan.price}</span><span className="text-gray-500 text-sm">/month</span></div>
                <ul className="space-y-2 mb-6">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-center gap-2 text-sm text-gray-600"><Check className="w-4 h-4 text-green-500 shrink-0" />{f}</li>
                  ))}
                </ul>
                <button className={\`w-full py-2 rounded-lg text-sm font-medium transition-colors \${plan.popular ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-900 hover:bg-gray-200'}\`}>Get started</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 py-8 border-t border-gray-200">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-sm text-gray-500">
          <span>&copy; ${new Date().getFullYear()} ${name}</span>
          <div className="flex gap-4"><a href="#" className="hover:text-gray-700">Privacy</a><a href="#" className="hover:text-gray-700">Terms</a></div>
        </div>
      </footer>
    </div>
  )
}
`,
  }
}

function scaffoldBlog(name: string): Record<string, string> {
  const base = scaffoldNextJS(name, 'Blog')
  return {
    ...base,
    'app/page.tsx': `const POSTS = [
  { slug: 'getting-started', title: 'Getting Started with ${name}', excerpt: 'Learn how to set up your development environment and build your first feature.', date: '2026-02-28', readTime: '5 min', tag: 'Tutorial' },
  { slug: 'best-practices', title: 'Best Practices for Modern Web Development', excerpt: 'A comprehensive guide to writing clean, maintainable, and performant code.', date: '2026-02-25', readTime: '8 min', tag: 'Guide' },
  { slug: 'whats-new', title: "What's New in 2026", excerpt: 'Exploring the latest trends and technologies shaping the web development landscape.', date: '2026-02-20', readTime: '4 min', tag: 'News' },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-bold text-gray-900">${name}</span>
          <nav className="flex gap-4 text-sm text-gray-600">
            <a href="#" className="hover:text-gray-900">Archive</a>
            <a href="#" className="hover:text-gray-900">About</a>
          </nav>
        </div>
      </header>
      <main className="max-w-3xl mx-auto px-6 py-12">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Latest Posts</h1>
        <div className="space-y-8">
          {POSTS.map(post => (
            <article key={post.slug} className="group cursor-pointer">
              <div className="flex items-center gap-3 text-sm text-gray-500 mb-2">
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{post.tag}</span>
                <time>{post.date}</time>
                <span>&middot;</span>
                <span>{post.readTime} read</span>
              </div>
              <h2 className="text-xl font-semibold text-gray-900 group-hover:text-blue-600 transition-colors mb-2">{post.title}</h2>
              <p className="text-gray-600">{post.excerpt}</p>
            </article>
          ))}
        </div>
      </main>
    </div>
  )
}
`,
  }
}

function scaffoldDashboard(name: string): Record<string, string> {
  const base = scaffoldNextJS(name, 'Dashboard')
  return {
    ...base,
    'app/page.tsx': `import { BarChart3, Users, DollarSign, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react'

const STATS = [
  { label: 'Revenue', value: '$45,231', change: '+20.1%', up: true, icon: DollarSign },
  { label: 'Users', value: '2,350', change: '+12.5%', up: true, icon: Users },
  { label: 'Active Now', value: '573', change: '-3.2%', up: false, icon: Activity },
  { label: 'Conversion', value: '3.2%', change: '+0.8%', up: true, icon: BarChart3 },
]

const RECENT = [
  { name: 'Sarah Chen', action: 'Upgraded to Pro', time: '2 min ago', amount: '+$29.00' },
  { name: 'Marcus Johnson', action: 'New signup', time: '5 min ago', amount: '$0.00' },
  { name: 'Emily Davis', action: 'Payment received', time: '12 min ago', amount: '+$99.00' },
  { name: 'Alex Kim', action: 'Subscription cancelled', time: '1 hr ago', amount: '-$9.00' },
  { name: 'Jordan Lee', action: 'Upgraded to Enterprise', time: '2 hr ago', amount: '+$99.00' },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-900 text-white p-4 hidden md:block">
        <div className="text-lg font-bold mb-8 px-2">${name}</div>
        <nav className="space-y-1">
          {['Dashboard', 'Analytics', 'Customers', 'Products', 'Settings'].map((item, i) => (
            <a key={item} href="#" className={\`block px-3 py-2 rounded-lg text-sm \${i === 0 ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'} transition-colors\`}>{item}</a>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="flex-1 p-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {STATS.map(({ label, value, change, up, icon: Icon }) => (
            <div key={label} className="bg-white p-4 rounded-xl border border-gray-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-500">{label}</span>
                <Icon className="w-4 h-4 text-gray-400" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{value}</div>
              <div className={\`flex items-center gap-1 text-xs mt-1 \${up ? 'text-green-600' : 'text-red-600'}\`}>
                {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                {change}
              </div>
            </div>
          ))}
        </div>

        {/* Recent Activity */}
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200"><h2 className="font-semibold text-gray-900">Recent Activity</h2></div>
          <div className="divide-y divide-gray-100">
            {RECENT.map((item, i) => (
              <div key={i} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-900">{item.name}</div>
                  <div className="text-xs text-gray-500">{item.action} &middot; {item.time}</div>
                </div>
                <span className={\`text-sm font-medium \${item.amount.startsWith('+') ? 'text-green-600' : item.amount.startsWith('-') ? 'text-red-600' : 'text-gray-500'}\`}>{item.amount}</span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
`,
  }
}

function scaffoldEcommerce(name: string): Record<string, string> {
  const base = scaffoldNextJS(name, 'E-commerce store')
  return {
    ...base,
    'app/page.tsx': `import { ShoppingCart, Star, Heart } from 'lucide-react'

const PRODUCTS = [
  { id: 1, name: 'Minimal Desk Lamp', price: 89, rating: 4.8, reviews: 124, image: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&h=400&fit=crop' },
  { id: 2, name: 'Ceramic Planter', price: 45, rating: 4.6, reviews: 89, image: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=400&h=400&fit=crop' },
  { id: 3, name: 'Linen Throw Pillow', price: 35, rating: 4.9, reviews: 203, image: 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?w=400&h=400&fit=crop' },
  { id: 4, name: 'Oak Side Table', price: 199, rating: 4.7, reviews: 67, image: 'https://images.unsplash.com/photo-1532372576444-dda954194ad0?w=400&h=400&fit=crop' },
  { id: 5, name: 'Woven Basket Set', price: 65, rating: 4.5, reviews: 45, image: 'https://images.unsplash.com/photo-1519710164239-da123dc03ef4?w=400&h=400&fit=crop' },
  { id: 6, name: 'Brass Candle Holder', price: 42, rating: 4.8, reviews: 156, image: 'https://images.unsplash.com/photo-1602028915047-37269d1a73f7?w=400&h=400&fit=crop' },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-xl font-bold text-gray-900">${name}</span>
          <div className="flex items-center gap-6">
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900">Shop</a>
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900">About</a>
            <button className="relative"><ShoppingCart className="w-5 h-5 text-gray-700" /><span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-900 text-white text-[10px] rounded-full flex items-center justify-center">3</span></button>
          </div>
        </div>
      </header>

      <section className="px-6 py-16 bg-gray-50 text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-3">Curated for your home</h1>
        <p className="text-gray-600 max-w-lg mx-auto">Thoughtfully designed pieces that bring warmth and character to every space.</p>
      </section>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6">
          {PRODUCTS.map(product => (
            <div key={product.id} className="group">
              <div className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden mb-3">
                <img src={product.image} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                <button className="absolute top-3 right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"><Heart className="w-4 h-4 text-gray-600" /></button>
              </div>
              <h3 className="font-medium text-gray-900">{product.name}</h3>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex items-center gap-0.5"><Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" /><span className="text-sm text-gray-600">{product.rating}</span></div>
                <span className="text-sm text-gray-400">({product.reviews})</span>
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="font-semibold text-gray-900">\${product.price}</span>
                <button className="px-3 py-1.5 bg-gray-900 text-white text-xs rounded-lg hover:bg-gray-800 transition-colors">Add to cart</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
`,
  }
}

function scaffoldPortfolio(name: string): Record<string, string> {
  const base = scaffoldNextJS(name, 'Portfolio')
  return {
    ...base,
    'app/page.tsx': `import { Github, Linkedin, Mail, ExternalLink } from 'lucide-react'

const PROJECTS = [
  { title: 'E-Commerce Platform', desc: 'Full-stack marketplace with payments, inventory, and admin dashboard.', tags: ['Next.js', 'Stripe', 'PostgreSQL'], link: '#' },
  { title: 'AI Chat Application', desc: 'Real-time chat with AI assistant, supporting multiple conversation threads.', tags: ['React', 'OpenAI', 'WebSocket'], link: '#' },
  { title: 'Analytics Dashboard', desc: 'Interactive data visualization platform with real-time metrics and reporting.', tags: ['TypeScript', 'D3.js', 'Redis'], link: '#' },
  { title: 'Mobile Fitness App', desc: 'Cross-platform fitness tracker with workout plans and progress charts.', tags: ['React Native', 'Firebase', 'Charts'], link: '#' },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <main className="max-w-3xl mx-auto px-6 py-20">
        {/* Intro */}
        <section className="mb-16">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">Hi, I'm Alex <span className="inline-block animate-[wave_1.5s_ease-in-out_infinite]">&#x1F44B;</span></h1>
          <p className="text-lg text-gray-600 mb-6">Full-stack developer passionate about building clean, performant web applications. Currently open to new opportunities.</p>
          <div className="flex gap-3">
            <a href="#" className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"><Github className="w-4 h-4" /></a>
            <a href="#" className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"><Linkedin className="w-4 h-4" /></a>
            <a href="#" className="w-9 h-9 bg-gray-100 rounded-lg flex items-center justify-center text-gray-600 hover:bg-gray-200 transition-colors"><Mail className="w-4 h-4" /></a>
          </div>
        </section>

        {/* Projects */}
        <section className="mb-16">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Projects</h2>
          <div className="grid gap-4">
            {PROJECTS.map(project => (
              <a key={project.title} href={project.link} className="block p-5 border border-gray-200 rounded-xl hover:border-gray-400 transition-colors group">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">{project.title}</h3>
                  <ExternalLink className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                </div>
                <p className="text-sm text-gray-600 mb-3">{project.desc}</p>
                <div className="flex gap-2 flex-wrap">
                  {project.tags.map(tag => (
                    <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-md">{tag}</span>
                  ))}
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Contact */}
        <section>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Get in touch</h2>
          <p className="text-gray-600 mb-4">Have a project in mind? Let's chat.</p>
          <a href="mailto:hello@example.com" className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"><Mail className="w-4 h-4" />hello@example.com</a>
        </section>
      </main>
    </div>
  )
}
`,
  }
}

function scaffoldDocs(name: string): Record<string, string> {
  const base = scaffoldNextJS(name, 'Documentation site')
  return {
    ...base,
    'app/page.tsx': `import { Book, Code2, Rocket, Terminal, ArrowRight, Search } from 'lucide-react'

const SECTIONS = [
  { icon: Rocket, title: 'Quick Start', desc: 'Get up and running in under 5 minutes with our step-by-step guide.', href: '#' },
  { icon: Code2, title: 'API Reference', desc: 'Complete API documentation with examples for every endpoint.', href: '#' },
  { icon: Terminal, title: 'CLI Guide', desc: 'Command-line tools and scripts for automation and deployment.', href: '#' },
  { icon: Book, title: 'Tutorials', desc: 'In-depth tutorials covering common patterns and best practices.', href: '#' },
]

const SIDEBAR = ['Introduction', 'Installation', 'Quick Start', 'Configuration', 'Authentication', 'API Reference', 'Deployment', 'FAQ']

export default function Home() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 sticky top-0 bg-white z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-lg font-bold text-gray-900">${name} Docs</span>
            <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-md">v1.0</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" placeholder="Search docs..." className="pl-9 pr-4 py-1.5 border border-gray-200 rounded-lg text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
            </div>
            <a href="#" className="text-sm text-gray-600 hover:text-gray-900">GitHub</a>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto flex">
        {/* Sidebar */}
        <aside className="w-56 shrink-0 border-r border-gray-200 p-4 hidden md:block sticky top-14 h-[calc(100vh-3.5rem)] overflow-auto">
          <nav className="space-y-0.5">
            {SIDEBAR.map((item, i) => (
              <a key={item} href="#" className={\`block px-3 py-1.5 rounded-md text-sm \${i === 0 ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-600 hover:bg-gray-50'}\`}>{item}</a>
            ))}
          </nav>
        </aside>

        {/* Content */}
        <main className="flex-1 px-8 py-10 max-w-3xl">
          <h1 className="text-3xl font-bold text-gray-900 mb-4">${name} Documentation</h1>
          <p className="text-lg text-gray-600 mb-10">Everything you need to build with ${name}. Guides, references, and examples.</p>

          <div className="grid sm:grid-cols-2 gap-4">
            {SECTIONS.map(({ icon: Icon, title, desc, href }) => (
              <a key={title} href={href} className="p-5 border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all group">
                <Icon className="w-5 h-5 text-blue-600 mb-3" />
                <h3 className="font-semibold text-gray-900 mb-1 flex items-center gap-1">{title} <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" /></h3>
                <p className="text-sm text-gray-600">{desc}</p>
              </a>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
`,
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


// System prompt imported from lib/system-prompt.ts


// ═══════════════════════════════════════════════════════════════════
// POST handler
// ═══════════════════════════════════════════════════════════════════

export async function POST(req: Request) {
  // Rate limit — 20 requests/minute per IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const limit = chatLimiter(ip)
  if (!limit.ok) {
    return new Response(JSON.stringify({ error: 'Rate limited. Try again in a minute.' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil(limit.resetIn / 1000)) },
    })
  }

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

  // Save user message to database if projectId exists
  if (projectId && messages.length > 0) {
    const lastMessage = messages[messages.length - 1]
    if (lastMessage.role === 'user') {
      try {
        await supabaseFetch('/forge_chat_messages', {
          method: 'POST',
          body: JSON.stringify({
            project_id: projectId,
            role: 'user',
            content: lastMessage.content,
          }),
        })
      } catch (error) {
        console.error('Failed to save user message:', error)
      }
    }
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
        description: 'Edit a file by replacing a specific string. old_string must match EXACTLY (including whitespace/indentation). If you did not write this file yourself, use read_file first to get the exact content.',
        parameters: z.object({
          path: z.string().describe('File path'),
          old_string: z.string().describe('Exact string to find (must match whitespace/indentation)'),
          new_string: z.string().describe('Replacement string'),
        }),
        execute: async ({ path, old_string, new_string }) => {
          const content = vfs.read(path)
          if (content === undefined) return { error: `File not found: ${path}` }

          // Exact match — fast path
          if (content.includes(old_string)) {
            const occurrences = content.split(old_string).length - 1
            if (occurrences > 1) {
              return { error: `Found ${occurrences} occurrences. Provide more context to make it unique.` }
            }
            const updated = content.replace(old_string, new_string)
            vfs.write(path, updated)
            return { ok: true, path, lines: updated.split('\n').length }
          }

          // Fuzzy match — normalize whitespace and try again
          const normalize = (s: string) => s.replace(/[ \t]+/g, ' ').replace(/\r\n/g, '\n').trim()
          const normOld = normalize(old_string)
          const lines = content.split('\n')

          // Try to find a block of lines that matches when normalized
          const oldLines = old_string.split('\n')
          for (let i = 0; i <= lines.length - oldLines.length; i++) {
            const block = lines.slice(i, i + oldLines.length).join('\n')
            if (normalize(block) === normOld) {
              // Found a whitespace-fuzzy match — use the actual content for replacement
              const updated = content.replace(block, new_string)
              vfs.write(path, updated)
              return { ok: true, path, lines: updated.split('\n').length, note: 'Matched with whitespace normalization' }
            }
          }

          // No match — return helpful context from the file
          // Find the closest matching line to help the AI self-correct
          const firstOldLine = old_string.split('\n')[0].trim()
          const nearLines: string[] = []
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(firstOldLine) || (firstOldLine.length > 10 && lines[i].trim().startsWith(firstOldLine.slice(0, 20)))) {
              const start = Math.max(0, i - 2)
              const end = Math.min(lines.length, i + oldLines.length + 2)
              nearLines.push(`Lines ${start + 1}-${end}:\n${lines.slice(start, end).join('\n')}`)
              break
            }
          }

          return {
            error: 'old_string not found in file.',
            hint: 'The content does not match exactly. Use read_file to get current content, then retry.',
            nearMatch: nearLines.length > 0 ? nearLines[0] : undefined,
            fileLength: `${lines.length} lines`,
          }
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
        description: 'Scaffold a new project from a template. Always call this FIRST for new projects. Templates: nextjs (blank), vite-react, static, saas (landing page with hero/features/pricing), blog, dashboard (admin panel with sidebar/stats), ecommerce (product grid with cart), portfolio (developer portfolio), docs (documentation site with sidebar).',
        parameters: z.object({
          template: z.enum(['nextjs', 'vite-react', 'static', 'saas', 'blog', 'dashboard', 'ecommerce', 'portfolio', 'docs']).describe('Project template'),
          description: z.string().optional().describe('Project description'),
        }),
        execute: async ({ template, description }) => {
          let scaffold: Record<string, string>
          switch (template) {
            case 'nextjs': scaffold = scaffoldNextJS(projectName, description); break
            case 'vite-react': scaffold = scaffoldViteReact(projectName); break
            case 'static': scaffold = scaffoldStatic(projectName); break
            case 'saas': scaffold = scaffoldSaaS(projectName); break
            case 'blog': scaffold = scaffoldBlog(projectName); break
            case 'dashboard': scaffold = scaffoldDashboard(projectName); break
            case 'ecommerce': scaffold = scaffoldEcommerce(projectName); break
            case 'portfolio': scaffold = scaffoldPortfolio(projectName); break
            case 'docs': scaffold = scaffoldDocs(projectName); break
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
          branch: z.string().optional().describe('Branch (default: master)'),
        }),
        execute: async ({ path, branch }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const branchName = branch || 'master'
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
          branch: z.string().optional().describe('Branch (default: master)'),
        }),
        execute: async ({ path, content, message, branch }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const owner = 'Leigh12-93'
          const repo = 'forge'
          const branchName = branch || 'master'

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
                ref: 'master',
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

      // ─── Chat History ───────────────────────────────────────────

      load_chat_history: tool({
        description: 'Load previous chat messages for this project from the database.',
        parameters: z.object({}),
        execute: async () => {
          if (!projectId) return { error: 'No project ID available' }

          const result = await supabaseFetch(`/forge_chat_messages?project_id=eq.${projectId}&order=created_at.asc&limit=100`)
          if (!result.ok) return { error: `Failed to load chat history: ${JSON.stringify(result.data)}` }

          const messages = Array.isArray(result.data) ? result.data : []
          return {
            messages: messages.map((msg: any) => ({
              id: msg.id,
              role: msg.role,
              content: msg.content,
              tool_invocations: msg.tool_invocations,
              created_at: msg.created_at,
            })),
            count: messages.length
          }
        },
      }),

      // ─── Pull Latest from GitHub ──────────────────────────────

      github_pull_latest: tool({
        description: 'Pull the latest files from a GitHub repo into the current project. ALWAYS call this before github_push_update to avoid overwriting remote changes.',
        parameters: z.object({
          owner: z.string().describe('Repository owner'),
          repo: z.string().describe('Repository name'),
          branch: z.string().default('master').describe('Branch to pull from'),
        }),
        execute: async ({ owner, repo, branch }) => {
          const token = effectiveGithubToken
          if (!token) return { error: 'No GitHub token available' }

          // Get the tree recursively
          const treeRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
            { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
          )
          if (!treeRes.ok) return { error: `Failed to fetch tree: ${treeRes.status}` }
          const treeData = await treeRes.json()

          const textExts = new Set(['ts','tsx','js','jsx','json','css','scss','html','md','mdx','txt','yaml','yml','toml','sql','sh','py','rb','go','rs','java','kt','swift','c','cpp','h','xml','svg','graphql','gql','prisma'])
          const skipDirs = new Set(['node_modules','.git','.next','dist','build','.vercel','.turbo','coverage','__pycache__','.cache'])

          const blobs = (treeData.tree || []).filter((item: any) => {
            if (item.type !== 'blob' || item.size > 100000) return false
            const parts = item.path.split('/')
            if (parts.some((p: string) => skipDirs.has(p))) return false
            const ext = item.path.split('.').pop()?.toLowerCase() || ''
            const basename = item.path.split('/').pop() || ''
            if (['Dockerfile','Makefile','.gitignore','.env.example'].includes(basename)) return true
            return textExts.has(ext)
          }).slice(0, 100)

          const results = await Promise.allSettled(
            blobs.map(async (item: any) => {
              const res = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/contents/${item.path}?ref=${branch}`,
                { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' } }
              )
              if (!res.ok) return null
              const data = await res.json()
              if (data.encoding === 'base64' && data.content) {
                return { path: item.path, content: Buffer.from(data.content, 'base64').toString('utf-8') }
              }
              return null
            })
          )

          const pulledFiles: Record<string, string> = {}
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value) {
              pulledFiles[r.value.path] = r.value.content
              vfs.write(r.value.path, r.value.content)
            }
          }

          return { ok: true, fileCount: Object.keys(pulledFiles).length, files: Object.keys(pulledFiles) }
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

      // ─── MCP Tools ───────────────────────────────────────────────

      mcp_list_servers: tool({
        description: 'List all configured MCP servers and their connection status, plus available tools.',
        parameters: z.object({}),
        execute: async () => {
          const servers = mcpClient.getServers()
          return {
            servers: servers.map(s => ({
              id: s.config.id,
              name: s.config.name,
              connected: s.connected,
              toolCount: s.tools.length,
              tools: s.tools.map(t => t.name),
              error: s.error,
            })),
          }
        },
      }),

      mcp_connect_server: tool({
        description: 'Add and connect to an MCP server. Discovers available tools automatically.',
        parameters: z.object({
          url: z.string().describe('MCP server HTTP endpoint URL'),
          name: z.string().describe('Display name for this server'),
          token: z.string().optional().describe('Bearer auth token (if required)'),
        }),
        execute: async ({ url, name, token }) => {
          const config = {
            id: `mcp-${Date.now()}`,
            name,
            description: '',
            url,
            enabled: true,
            tags: [] as string[],
            ...(token ? { auth: { type: 'bearer' as const, token } } : {}),
          }
          mcpClient.addServer(config)
          const state = await mcpClient.connect(config.id)
          return {
            ok: state.connected,
            serverId: config.id,
            tools: state.tools.map(t => ({ name: t.name, description: t.description })),
            error: state.error,
          }
        },
      }),

      mcp_call_tool: tool({
        description: 'Execute a tool on a connected MCP server. Use mcp_list_servers first to see available tools.',
        parameters: z.object({
          serverId: z.string().describe('ID of the connected MCP server'),
          tool: z.string().describe('Name of the tool to call'),
          args: z.record(z.unknown()).default({}).describe('Arguments to pass to the tool'),
        }),
        execute: async ({ serverId, tool: toolName, args }) => {
          try {
            const result = await mcpClient.callTool(serverId, toolName, args)
            return { ok: true, result }
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Tool call failed' }
          }
        },
      }),

      // ─── Self-Build Safety Tools ─────────────────────────────────

      forge_check_npm_package: tool({
        description: 'Check if an npm package exists and get its latest version. ALWAYS call this before adding a new dependency to package.json.',
        parameters: z.object({
          name: z.string().describe('npm package name, e.g. "@modelcontextprotocol/sdk"'),
        }),
        execute: async ({ name }) => {
          try {
            const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
              headers: { Accept: 'application/json' },
            })
            if (res.status === 404) return { exists: false, name, error: `Package "${name}" does NOT exist on npm. Do not add it to package.json.` }
            if (!res.ok) return { error: `npm registry returned ${res.status}` }
            const data = await res.json()
            const latest = data['dist-tags']?.latest
            const description = data.description || ''
            const deps = Object.keys(data.versions?.[latest]?.dependencies || {}).length
            return { exists: true, name, latest, description, dependencyCount: deps }
          } catch (err) {
            return { error: err instanceof Error ? err.message : 'Failed to check npm' }
          }
        },
      }),

      forge_revert_commit: tool({
        description: 'Revert the last commit on the Forge repo. Use this when a self-modification breaks the build.',
        parameters: z.object({
          reason: z.string().describe('Why are you reverting?'),
        }),
        execute: async ({ reason }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const owner = 'Leigh12-93'
          const repo = 'forge'

          // Get the latest 2 commits to find parent
          const commits = await githubFetch(`/repos/${owner}/${repo}/commits?sha=master&per_page=2`, token)
          if (!Array.isArray(commits) || commits.length < 2) return { error: 'Cannot revert — need at least 2 commits' }

          const headSha = commits[0].sha
          const parentSha = commits[1].sha
          const headMessage = commits[0].commit.message

          // Get the parent tree
          const parentCommit = await githubFetch(`/repos/${owner}/${repo}/git/commits/${parentSha}`, token)
          if (parentCommit.error) return { error: `Failed to get parent commit: ${parentCommit.error}` }

          // Create a new commit that points to the parent's tree (effectively reverting)
          const newCommit = await githubFetch(`/repos/${owner}/${repo}/git/commits`, token, {
            method: 'POST',
            body: JSON.stringify({
              message: `[self-revert] Revert "${headMessage}"\n\nReason: ${reason}`,
              tree: parentCommit.tree.sha,
              parents: [headSha],
            }),
          })
          if (newCommit.error) return { error: `Failed to create revert commit: ${newCommit.error}` }

          // Update master to point to the revert commit
          const update = await githubFetch(`/repos/${owner}/${repo}/git/refs/heads/master`, token, {
            method: 'PATCH',
            body: JSON.stringify({ sha: newCommit.sha }),
          })
          if (update.error) return { error: `Failed to update master: ${update.error}` }

          return {
            ok: true,
            revertedCommit: headSha.slice(0, 7),
            revertedMessage: headMessage,
            newCommit: newCommit.sha.slice(0, 7),
            reason,
            note: 'Reverted successfully. Use forge_redeploy to deploy the revert.',
          }
        },
      }),

      forge_create_branch: tool({
        description: 'Create a new branch on the Forge repo for safe development. Use this instead of pushing directly to master.',
        parameters: z.object({
          branch: z.string().describe('Branch name, e.g. "feat/add-testing-tools"'),
          fromBranch: z.string().default('master').describe('Base branch to create from'),
        }),
        execute: async ({ branch, fromBranch }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const owner = 'Leigh12-93'
          const repo = 'forge'

          // Get SHA of the base branch
          const ref = await githubFetch(`/repos/${owner}/${repo}/git/ref/heads/${fromBranch}`, token)
          if (ref.error) return { error: `Failed to read ${fromBranch}: ${ref.error}` }

          // Create new branch
          const result = await githubFetch(`/repos/${owner}/${repo}/git/refs`, token, {
            method: 'POST',
            body: JSON.stringify({
              ref: `refs/heads/${branch}`,
              sha: ref.object.sha,
            }),
          })
          if (result.error) return { error: `Failed to create branch: ${result.error}` }

          return {
            ok: true,
            branch,
            basedOn: fromBranch,
            sha: ref.object.sha.slice(0, 7),
            note: `Branch "${branch}" created. Use forge_modify_own_source with branch="${branch}" to push changes there instead of master.`,
          }
        },
      }),

      forge_create_pr: tool({
        description: 'Create a pull request on the Forge repo. Use after pushing changes to a feature branch.',
        parameters: z.object({
          title: z.string().describe('PR title'),
          body: z.string().describe('PR description'),
          head: z.string().describe('Source branch with changes'),
          base: z.string().default('master').describe('Target branch'),
        }),
        execute: async ({ title, body, head, base }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const result = await githubFetch('/repos/Leigh12-93/forge/pulls', token, {
            method: 'POST',
            body: JSON.stringify({ title, body, head, base }),
          })
          if (result.error) return { error: `Failed to create PR: ${result.error}` }

          return {
            ok: true,
            number: result.number,
            url: result.html_url,
            title,
            head,
            base,
          }
        },
      }),

      forge_merge_pr: tool({
        description: 'Merge a pull request on the Forge repo. Only merge after verifying the preview deploy succeeded.',
        parameters: z.object({
          prNumber: z.number().describe('PR number to merge'),
          method: z.enum(['merge', 'squash', 'rebase']).default('squash').describe('Merge method'),
        }),
        execute: async ({ prNumber, method }) => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }

          const result = await githubFetch(`/repos/Leigh12-93/forge/pulls/${prNumber}/merge`, token, {
            method: 'PUT',
            body: JSON.stringify({ merge_method: method }),
          })
          if (result.error) return { error: `Failed to merge PR: ${result.error}` }

          return {
            ok: true,
            merged: true,
            sha: result.sha?.slice(0, 7),
            note: 'PR merged to master. Vercel will auto-deploy. Use forge_deployment_status to monitor.',
          }
        },
      }),

      forge_deployment_status: tool({
        description: 'Check the current Vercel deployment status for Forge. Use after self-modification to verify the deploy succeeded.',
        parameters: z.object({}),
        execute: async () => {
          const token = VERCEL_TOKEN
          if (!token) return { error: 'No Vercel deploy token configured' }

          const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
          const res = await fetch(`https://api.vercel.com/v6/deployments${teamParam}&limit=3&projectId=forge`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) {
            // Try alternative: list by name
            const res2 = await fetch(`https://api.vercel.com/v6/deployments${teamParam ? teamParam + '&' : '?'}limit=3`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (!res2.ok) return { error: `Vercel API ${res2.status}` }
            const data2 = await res2.json()
            const forgeDeployments = (data2.deployments || [])
              .filter((d: any) => d.name === 'forge')
              .slice(0, 3)
            if (forgeDeployments.length === 0) return { error: 'No Forge deployments found' }
            return {
              deployments: forgeDeployments.map((d: any) => ({
                id: d.uid,
                url: `https://${d.url}`,
                state: d.readyState || d.state,
                created: d.created,
                target: d.target,
                source: d.meta?.githubCommitMessage || d.meta?.githubCommitRef || 'unknown',
              })),
            }
          }
          const data = await res.json()
          return {
            deployments: (data.deployments || []).map((d: any) => ({
              id: d.uid,
              url: `https://${d.url}`,
              state: d.readyState || d.state,
              created: d.created,
              target: d.target,
              source: d.meta?.githubCommitMessage || d.meta?.githubCommitRef || 'unknown',
            })),
          }
        },
      }),

      forge_list_branches: tool({
        description: 'List all branches on the Forge repo. Useful to see what feature branches exist.',
        parameters: z.object({}),
        execute: async () => {
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }
          const result = await githubFetch('/repos/Leigh12-93/forge/branches?per_page=30', token)
          if (!Array.isArray(result)) return { error: result.error || 'Failed to list branches' }
          return {
            branches: result.map((b: any) => ({
              name: b.name,
              sha: b.commit.sha.slice(0, 7),
              protected: b.protected,
            })),
          }
        },
      }),

      forge_delete_branch: tool({
        description: 'Delete a branch on the Forge repo after it has been merged.',
        parameters: z.object({
          branch: z.string().describe('Branch name to delete (cannot be master)'),
        }),
        execute: async ({ branch }) => {
          if (branch === 'master' || branch === 'main') return { error: 'Cannot delete master/main branch' }
          const token = GITHUB_TOKEN
          if (!token) return { error: 'No GitHub token configured' }
          const result = await githubFetch(`/repos/Leigh12-93/forge/git/refs/heads/${branch}`, token, {
            method: 'DELETE',
          })
          if (result.error) return { error: `Failed to delete branch: ${result.error}` }
          return { ok: true, deleted: branch }
        },
      }),

      forge_read_deploy_log: tool({
        description: 'Read the full build log from a Vercel deployment. Use after forge_check_build to see detailed error output.',
        parameters: z.object({
          deploymentId: z.string().describe('Vercel deployment ID (from forge_check_build or forge_deployment_status)'),
        }),
        execute: async ({ deploymentId }) => {
          const token = VERCEL_TOKEN
          if (!token) return { error: 'No Vercel deploy token configured' }
          const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
          const res = await fetch(`https://api.vercel.com/v2/deployments/${deploymentId}/events${teamParam}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          if (!res.ok) return { error: `Vercel API ${res.status}` }
          const events = await res.json()
          const logs = (Array.isArray(events) ? events : [])
            .filter((e: any) => e.type === 'stdout' || e.type === 'stderr' || e.type === 'error')
            .map((e: any) => {
              const text = e.payload?.text || e.text || ''
              return `[${e.type}] ${text}`
            })
            .slice(-50)
          return { logs, lineCount: logs.length }
        },
      }),

      db_introspect: tool({
        description: 'Discover the schema of a Supabase table — columns, types, constraints. Use this instead of guessing column names.',
        parameters: z.object({
          table: z.string().describe('Table name to inspect, e.g. "forge_projects"'),
        }),
        execute: async ({ table }) => {
          // Use Supabase's PostgREST to introspect via information_schema
          // The service role key has access to pg_catalog
          const url = `${SUPABASE_URL}/rest/v1/rpc/get_table_schema`

          // First try the RPC approach — if there's no function, fall back to reading 0 rows + headers
          const fallbackRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=0`, {
            method: 'GET',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Accept': 'application/json',
              'Prefer': 'count=exact',
            },
          })

          if (!fallbackRes.ok) return { error: `Table "${table}" not found or not accessible (${fallbackRes.status})` }

          const contentRange = fallbackRes.headers.get('content-range')
          const totalRows = contentRange ? contentRange.split('/')[1] : 'unknown'

          // Get column info via a raw SQL query through PostgREST RPC
          // Using the information_schema approach
          const schemaRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/execute_sql`, {
            method: 'POST',
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              query: `SELECT column_name, data_type, is_nullable, column_default, character_maximum_length
                      FROM information_schema.columns
                      WHERE table_name = '${table.replace(/'/g, "''")}'
                      ORDER BY ordinal_position`
            }),
          })

          if (schemaRes.ok) {
            const schemaData = await schemaRes.json()
            return {
              table,
              totalRows,
              columns: schemaData,
            }
          }

          // Fallback: read 1 row and infer types from the data
          const sampleRes = await fetch(`${SUPABASE_URL}/rest/v1/${table}?limit=1`, {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
              'Accept': 'application/json',
            },
          })

          if (sampleRes.ok) {
            const sample = await sampleRes.json()
            if (Array.isArray(sample) && sample.length > 0) {
              const columns = Object.entries(sample[0]).map(([name, value]) => ({
                column_name: name,
                inferred_type: value === null ? 'unknown' : typeof value,
                sample_value: typeof value === 'string' ? value.slice(0, 50) : value,
              }))
              return { table, totalRows, columns, note: 'Types inferred from sample data (no RPC function available)' }
            }
          }

          return { table, totalRows, columns: [], note: 'Table exists but is empty and schema could not be introspected' }
        },
      }),

      scaffold_component: tool({
        description: 'Generate a reusable UI component in shadcn/ui style. Creates the component file with proper TypeScript types, variants, and Tailwind styling.',
        parameters: z.object({
          name: z.string().describe('Component name in PascalCase, e.g. "Button", "Card", "Dialog"'),
          type: z.enum(['button', 'card', 'input', 'modal', 'badge', 'alert', 'tabs', 'dropdown', 'avatar', 'tooltip', 'custom']).describe('Component type'),
          variants: z.array(z.string()).optional().describe('Style variants, e.g. ["default", "destructive", "outline", "ghost"]'),
          description: z.string().optional().describe('What the component should do'),
        }),
        execute: async ({ name, type, variants, description }) => {
          const variantList = variants || ['default']
          const kebab = name.replace(/([A-Z])/g, (m, c, i) => (i > 0 ? '-' : '') + c.toLowerCase())
          const path = `components/ui/${kebab}.tsx`

          const variantStyles = variantList.map(v => {
            switch (v) {
              case 'default': return `      default: 'bg-forge-accent text-white hover:bg-forge-accent-hover'`
              case 'destructive': return `      destructive: 'bg-forge-danger text-white hover:bg-red-700'`
              case 'outline': return `      outline: 'border border-forge-border bg-transparent hover:bg-forge-surface'`
              case 'ghost': return `      ghost: 'hover:bg-forge-surface hover:text-forge-text'`
              case 'secondary': return `      secondary: 'bg-forge-surface text-forge-text hover:bg-forge-panel'`
              default: return `      '${v}': ''  // TODO: add styles`
            }
          }).join(',\n')

          const sizeStyles = `      default: 'h-10 px-4 py-2',
      sm: 'h-9 rounded-md px-3',
      lg: 'h-11 rounded-md px-8',
      icon: 'h-10 w-10'`

          let content: string
          if (type === 'card') {
            content = `import { cn } from '@/lib/utils'

interface ${name}Props extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function ${name}({ className, children, ...props }: ${name}Props) {
  return (
    <div className={cn('rounded-xl border border-forge-border bg-forge-panel p-6', className)} {...props}>
      {children}
    </div>
  )
}

export function ${name}Header({ className, children, ...props }: ${name}Props) {
  return <div className={cn('flex flex-col space-y-1.5 pb-4', className)} {...props}>{children}</div>
}

export function ${name}Title({ className, children, ...props }: ${name}Props) {
  return <h3 className={cn('text-lg font-semibold leading-none', className)} {...props}>{children}</h3>
}

export function ${name}Content({ className, children, ...props }: ${name}Props) {
  return <div className={cn('text-sm text-forge-text-dim', className)} {...props}>{children}</div>
}

export function ${name}Footer({ className, children, ...props }: ${name}Props) {
  return <div className={cn('flex items-center pt-4', className)} {...props}>{children}</div>
}
`
          } else if (type === 'input') {
            content = `import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

export interface ${name}Props extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const ${name} = forwardRef<HTMLInputElement, ${name}Props>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && <label className="text-sm font-medium text-forge-text">{label}</label>}
        <input
          ref={ref}
          className={cn(
            'flex h-10 w-full rounded-lg border bg-forge-surface px-3 py-2 text-sm',
            'placeholder:text-forge-text-dim/50 outline-none transition-colors',
            error ? 'border-forge-danger' : 'border-forge-border focus:border-forge-accent',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-forge-danger">{error}</p>}
      </div>
    )
  }
)
${name}.displayName = '${name}'
`
          } else if (type === 'modal') {
            content = `'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ${name}Props {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  className?: string
}

export function ${name}({ open, onClose, title, children, className }: ${name}Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (open) document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [open, onClose])

  if (!open) return null

  return (
    <div ref={overlayRef} className="fixed inset-0 z-50 flex items-center justify-center" onClick={e => { if (e.target === overlayRef.current) onClose() }}>
      <div className="fixed inset-0 bg-black/50" />
      <div className={cn('relative z-50 w-full max-w-lg rounded-xl border border-forge-border bg-forge-bg p-6 shadow-xl animate-fade-in', className)}>
        <div className="flex items-center justify-between mb-4">
          {title && <h2 className="text-lg font-semibold text-forge-text">{title}</h2>}
          <button onClick={onClose} className="p-1 rounded-lg text-forge-text-dim hover:text-forge-text hover:bg-forge-surface transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
`
          } else if (type === 'badge') {
            content = `import { cn } from '@/lib/utils'

const variants = {
${variantStyles}
} as const

interface ${name}Props extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants
  children: React.ReactNode
}

export function ${name}({ variant = 'default', className, children, ...props }: ${name}Props) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors', variants[variant], className)} {...props}>
      {children}
    </span>
  )
}
`
          } else if (type === 'alert') {
            content = `import { AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const variants = {
  info: { icon: Info, className: 'bg-blue-50 text-blue-800 border-blue-200' },
  success: { icon: CheckCircle, className: 'bg-green-50 text-green-800 border-green-200' },
  warning: { icon: AlertTriangle, className: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  error: { icon: XCircle, className: 'bg-red-50 text-red-800 border-red-200' },
}

interface ${name}Props {
  variant?: keyof typeof variants
  title?: string
  children: React.ReactNode
  className?: string
}

export function ${name}({ variant = 'info', title, children, className }: ${name}Props) {
  const { icon: Icon, className: variantClass } = variants[variant]
  return (
    <div className={cn('flex gap-3 rounded-lg border p-4', variantClass, className)}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        {title && <p className="font-medium mb-1">{title}</p>}
        <div className="text-sm">{children}</div>
      </div>
    </div>
  )
}
`
          } else {
            // Default: button-style component with variants
            content = `import { cn } from '@/lib/utils'

const variants = {
${variantStyles}
} as const

const sizes = {
${sizeStyles}
} as const

interface ${name}Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants
  size?: keyof typeof sizes
}

export function ${name}({ variant = 'default', size = 'default', className, children, ...props }: ${name}Props) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forge-accent/50',
        'disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}
`
          }

          vfs.write(path, content)
          return {
            ok: true,
            path,
            component: name,
            type,
            variants: variantList,
            lines: content.split('\n').length,
          }
        },
      }),

      generate_env_file: tool({
        description: 'Analyze project files and generate a .env.example file listing all required environment variables.',
        parameters: z.object({}),
        execute: async () => {
          const envVars = new Map<string, string>()

          for (const [path, content] of vfs.files) {
            // Match process.env.VARIABLE_NAME
            const matches = content.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)
            for (const match of matches) {
              const varName = match[1]
              if (!envVars.has(varName)) {
                envVars.set(varName, path)
              }
            }
            // Match NEXT_PUBLIC_ in import.meta.env
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
            if (name.startsWith('NEXT_PUBLIC_')) {
              lines.push(`${name}=  # Public (exposed to browser)`)
            } else {
              lines.push(`${name}=  # Server-side only`)
            }
            lines.push('')
          }

          const content = lines.join('\n')
          vfs.write('.env.example', content)
          return { ok: true, path: '.env.example', variables: sorted.map(([name]) => name), count: envVars.size }
        },
      }),

      // ─── Sandbox Preview ────────────────────────────────────────

      start_sandbox: tool({
        description: 'Start a live preview sandbox for the current project. Creates a real Linux VM with Node.js, installs dependencies, and starts the dev server. Returns a live URL. Use this when the user wants to see a real running preview of their app (not just static HTML).',
        parameters: z.object({
          framework: z.enum(['nextjs', 'vite', 'static']).optional().describe('Framework hint (auto-detected if omitted)'),
        }),
        execute: async ({ framework }) => {
          if (!projectId) return { error: 'No project ID — save the project first.' }
          const files = vfs.toRecord()
          if (Object.keys(files).length === 0) return { error: 'No files to preview.' }
          const result = await createSandbox(projectId, files, framework)
          return result
        },
      }),

      stop_sandbox: tool({
        description: 'Stop the running preview sandbox for the current project.',
        parameters: z.object({}),
        execute: async () => {
          if (!projectId) return { error: 'No project ID.' }
          return destroySandbox(projectId)
        },
      }),

      sandbox_status: tool({
        description: 'Check the status of the preview sandbox for the current project.',
        parameters: z.object({}),
        execute: async () => {
          if (!projectId) return { error: 'No project ID.' }
          const status = getSandboxStatus(projectId)
          if (!status) return { active: false, note: 'No sandbox running. Use start_sandbox to create one.' }
          return { active: true, ...status }
        },
      }),

      add_image: tool({
        description: 'Search Unsplash for a free image and return the URL. Use this when the user needs images for their project (hero backgrounds, product photos, avatars, etc.). Returns the image URL which you can use in img tags or CSS backgrounds.',
        parameters: z.object({
          query: z.string().describe('Search query (e.g. "mountain landscape", "coffee shop", "team meeting")'),
          orientation: z.enum(['landscape', 'portrait', 'squarish']).default('landscape').describe('Image orientation'),
          size: z.enum(['raw', 'full', 'regular', 'small', 'thumb']).default('regular').describe('Image size variant'),
        }),
        execute: async ({ query, orientation, size }) => {
          // Use Unsplash source URL (no API key needed, redirects to random matching image)
          const params = new URLSearchParams({ query, orientation })
          const sourceUrl = `https://source.unsplash.com/featured/?${params}`

          // Also provide a direct search results approach with proper attribution
          const searchUrl = `https://unsplash.com/s/photos/${encodeURIComponent(query)}`

          // Build predictable Unsplash URLs for common sizes
          const sizeMap: Record<string, string> = {
            raw: '&w=4000',
            full: '&w=2400',
            regular: '&w=1080',
            small: '&w=640',
            thumb: '&w=200',
          }

          const imageUrl = `https://images.unsplash.com/photo-random?${params}${sizeMap[size] || '&w=1080'}`

          return {
            ok: true,
            url: sourceUrl,
            directSearchUrl: searchUrl,
            suggestion: `Use this in your code: <img src="${sourceUrl}" alt="${query}" />`,
            attribution: 'Photos from Unsplash (free to use, attribution appreciated)',
            tip: 'For production, consider downloading the image and hosting it. Unsplash source URLs redirect to random matching photos.',
          }
        },
      }),

      forge_check_build: tool({
        description: 'Trigger a preview (non-production) deployment on Vercel to check if the current code builds successfully. Use this BEFORE forge_redeploy to catch errors.',
        parameters: z.object({
          branch: z.string().default('master').describe('Branch to build'),
        }),
        execute: async ({ branch }) => {
          const token = VERCEL_TOKEN
          if (!token) return { error: 'No Vercel deploy token configured' }

          const teamParam = VERCEL_TEAM ? `?teamId=${VERCEL_TEAM}` : ''
          const res = await fetch(`https://api.vercel.com/v13/deployments${teamParam}`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              name: 'forge',
              target: 'preview',  // NOT production
              gitSource: {
                type: 'github',
                org: 'Leigh12-93',
                repo: 'forge',
                ref: branch,
              },
            }),
          })

          const data = await res.json()
          if (!res.ok) return { error: data.error?.message || `Vercel API ${res.status}` }

          // Poll for build result (up to 90 seconds)
          const deployId = data.id
          const previewUrl = `https://${data.url}`
          let state = data.readyState || 'QUEUED'
          let attempts = 0

          while (['QUEUED', 'BUILDING', 'INITIALIZING'].includes(state) && attempts < 18) {
            await new Promise(r => setTimeout(r, 5000))
            attempts++
            const check = await fetch(`https://api.vercel.com/v13/deployments/${deployId}${teamParam}`, {
              headers: { Authorization: `Bearer ${token}` },
            })
            if (check.ok) {
              const checkData = await check.json()
              state = checkData.readyState || state
              if (state === 'ERROR') {
                // Try to get build logs
                const logsRes = await fetch(`https://api.vercel.com/v2/deployments/${deployId}/events${teamParam}`, {
                  headers: { Authorization: `Bearer ${token}` },
                })
                let errorLog = ''
                if (logsRes.ok) {
                  const events = await logsRes.json()
                  const errors = (Array.isArray(events) ? events : [])
                    .filter((e: any) => e.type === 'error' || (e.payload?.text || '').includes('error') || (e.payload?.text || '').includes('Error'))
                    .map((e: any) => e.payload?.text || e.text || '')
                    .slice(-10)
                  errorLog = errors.join('\n')
                }
                return {
                  ok: false,
                  state: 'ERROR',
                  previewUrl,
                  buildFailed: true,
                  errors: errorLog || 'Build failed — check Vercel dashboard for details',
                  note: 'DO NOT deploy to production. Fix the errors first.',
                }
              }
            }
          }

          return {
            ok: state === 'READY',
            state,
            previewUrl,
            deployId,
            buildFailed: state === 'ERROR',
            note: state === 'READY'
              ? 'Preview build succeeded! Safe to deploy to production with forge_redeploy.'
              : state === 'ERROR'
                ? 'Build FAILED. Fix errors before deploying.'
                : `Build still in progress (state: ${state}). Check forge_deployment_status later.`,
          }
        },
      }),
    },

    onFinish: async (event) => {
      console.log(`[forge] ${event.usage?.totalTokens || 0} tokens, ${event.steps?.length || 0} steps`)
      
      // Save assistant message to database if projectId exists
      if (projectId && event.text) {
        try {
          await supabaseFetch('/forge_chat_messages', {
            method: 'POST',
            body: JSON.stringify({
              project_id: projectId,
              role: 'assistant',
              content: event.text,
              tool_invocations: event.toolCalls || null,
            }),
          })
        } catch (error) {
          console.error('Failed to save assistant message:', error)
        }
      }
    },
  })

  return result.toDataStreamResponse()
}
