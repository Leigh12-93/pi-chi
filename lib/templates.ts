// ═══════════════════════════════════════════════════════════════════
// Project scaffold templates
// Extracted from route.ts to keep the API handler lean.
// ═══════════════════════════════════════════════════════════════════

/** Escape single quotes for safe interpolation into JS template strings */
function esc(s: string): string { return s.replace(/'/g, "\\'") }

export function scaffoldNextJS(name: string, description?: string): Record<string, string> {
  const safeName = esc(name)
  const safeDesc = esc(description || 'Built with Forge')
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
    'app/layout.tsx': `import type { Metadata } from 'next'\nimport './globals.css'\n\nexport const metadata: Metadata = {\n  title: '${safeName}',\n  description: '${safeDesc}',\n}\n\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return (\n    <html lang="en">\n      <body className="antialiased">{children}</body>\n    </html>\n  )\n}\n`,
    'app/page.tsx': `export default function Home() {\n  return (\n    <main className="min-h-screen flex items-center justify-center bg-white">\n      <h1 className="text-4xl font-bold text-gray-900">Welcome to ${name}</h1>\n    </main>\n  )\n}\n`,
    'lib/utils.ts': `import { clsx, type ClassValue } from 'clsx'\nimport { twMerge } from 'tailwind-merge'\nexport function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }\n`,
    'lib/types.ts': `// Core data types for this project\n// Define interfaces, types, and enums here\n\nexport {}\n`,
    '.gitignore': '.next/\nnode_modules/\n.env.local\n*.tsbuildinfo\nnext-env.d.ts\n',
  }
}

export function scaffoldViteReact(name: string): Record<string, string> {
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
    'src/types.ts': `// Core data types for this project\n// Define interfaces, types, and enums here\n\nexport {}\n`,
    '.gitignore': 'node_modules/\ndist/\n.env.local\n',
  }
}

export function scaffoldStatic(name: string): Record<string, string> {
  return {
    'index.html': `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${name}</title>\n  <script src="https://cdn.tailwindcss.com"></script>\n</head>\n<body class="min-h-screen bg-white">\n  <main class="flex items-center justify-center min-h-screen">\n    <h1 class="text-4xl font-bold">${name}</h1>\n  </main>\n</body>\n</html>\n`,
  }
}

// ─── Extended Templates ──────────────────────────────────────────
// Each extends the Next.js base with real, production-ready content

export function scaffoldSaaS(name: string): Record<string, string> {
  const base = scaffoldNextJS(name, 'SaaS landing page')
  return {
    ...base,
    'lib/types.ts': `// Core data types for ${name}\n\nexport interface Feature {\n  icon: React.ComponentType<{ className?: string }>\n  title: string\n  desc: string\n}\n\nexport interface PricingPlan {\n  name: string\n  price: string\n  features: string[]\n  popular?: boolean\n}\n\nexport {}\n`,
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
          <span>&copy; \${new Date().getFullYear()} ${name}</span>
          <div className="flex gap-4"><a href="#" className="hover:text-gray-700">Privacy</a><a href="#" className="hover:text-gray-700">Terms</a></div>
        </div>
      </footer>
    </div>
  )
}
`,
  }
}

export function scaffoldBlog(name: string): Record<string, string> {
  const base = scaffoldNextJS(name, 'Blog')
  return {
    ...base,
    'lib/types.ts': `// Core data types for ${name}\n\nexport interface Post {\n  slug: string\n  title: string\n  excerpt: string\n  date: string\n  readTime: string\n  tag: string\n}\n\nexport {}\n`,
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

export function scaffoldDashboard(name: string): Record<string, string> {
  const base = scaffoldNextJS(name, 'Dashboard')
  return {
    ...base,
    'lib/types.ts': `// Core data types for ${name}\n\nexport interface StatCard {\n  label: string\n  value: string\n  change: string\n  up: boolean\n  icon: React.ComponentType<{ className?: string }>\n}\n\nexport interface ActivityItem {\n  name: string\n  action: string\n  time: string\n  amount: string\n}\n\nexport interface ChartDataPoint {\n  label: string\n  value: number\n}\n\nexport type DateRange = '7d' | '30d' | '90d' | '12m'\n\nexport {}\n`,
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

export function scaffoldEcommerce(name: string): Record<string, string> {
  const base = scaffoldNextJS(name, 'E-commerce store')
  return {
    ...base,
    'lib/types.ts': `// Core data types for ${name}\n\nexport interface Product {\n  id: number\n  name: string\n  price: number\n  rating: number\n  reviews: number\n  image: string\n  description?: string\n  category?: string\n}\n\nexport interface CartItem {\n  product: Product\n  quantity: number\n}\n\nexport interface Cart {\n  items: CartItem[]\n  total: number\n}\n\nexport {}\n`,
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

export function scaffoldPortfolio(name: string): Record<string, string> {
  const base = scaffoldNextJS(name, 'Portfolio')
  return {
    ...base,
    'lib/types.ts': `// Core data types for ${name}\n// Define interfaces, types, and enums here\n\nexport {}\n`,
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

export function scaffoldDocs(name: string): Record<string, string> {
  const base = scaffoldNextJS(name, 'Documentation site')
  return {
    ...base,
    'lib/types.ts': `// Core data types for ${name}\n// Define interfaces, types, and enums here\n\nexport {}\n`,
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

export type TemplateName = 'nextjs' | 'vite-react' | 'static' | 'saas' | 'blog' | 'dashboard' | 'ecommerce' | 'portfolio' | 'docs'

export const TEMPLATES: Record<TemplateName, (name: string, description?: string) => Record<string, string>> = {
  'nextjs': scaffoldNextJS,
  'vite-react': scaffoldViteReact,
  'static': scaffoldStatic,
  'saas': scaffoldSaaS,
  'blog': scaffoldBlog,
  'dashboard': scaffoldDashboard,
  'ecommerce': scaffoldEcommerce,
  'portfolio': scaffoldPortfolio,
  'docs': scaffoldDocs,
}
