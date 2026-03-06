/**
 * Preview Guardrails — patterns and practices that break the live preview.
 * Referenced by the system prompt so the AI avoids these pitfalls.
 */

export const PREVIEW_GUARDRAILS = `
## Preview Guardrails — DO NOT break the preview

The live preview is critical to the user experience. These patterns WILL break it. Before writing code that uses any of these, warn the user and get confirmation.

### WILL break the static preview (iframe srcDoc):
- **Dynamic imports / lazy loading** — \`React.lazy()\`, \`dynamic()\`, \`import()\` — the preview can't resolve dynamic chunks
- **Server Components / server-only code** — \`"use server"\`, \`cookies()\`, \`headers()\`, server actions — the preview runs client-side only
- **Node.js APIs** — \`fs\`, \`path\`, \`process.env\` (server-side), \`crypto\` (Node module) — not available in browser
- **External API calls without CORS** — fetch to APIs that don't allow cross-origin requests will fail silently
- **CSS Modules / PostCSS** — \`.module.css\` files won't be processed in the static preview
- **Image imports** — \`import img from './photo.png'\` — no bundler to resolve asset imports
- **Environment variables** — \`process.env.NEXT_PUBLIC_*\` — not injected in preview context
- **Next.js file-based routing** — \`Link href="/about"\` — the preview is a single page, not a router
- **Absolute path aliases** — \`@/components/...\` — no bundler to resolve aliases in static preview

### WILL break the sandbox preview (WebContainer/v0):
- **Native Node modules** — \`sharp\`, \`canvas\`, \`bcrypt\` — binary modules can't compile in WebContainer
- **Database drivers** — \`pg\`, \`mysql2\`, \`mongodb\` — no TCP sockets in sandbox
- **Filesystem writes** — sandbox filesystem is read-only for user files
- **Long build times** — projects with 50+ dependencies may timeout (90s limit)
- **Private npm packages** — no npm auth in sandbox

### Safe patterns that ALWAYS work in preview:
- Tailwind CSS (loaded via CDN in static preview)
- Inline styles and CSS-in-JS (styled-components, emotion)
- Client-side React with hooks
- Static HTML/CSS/JS
- Fetch to public CORS-enabled APIs
- Framer Motion and other client-side animation libraries
- Lucide icons and other icon libraries

### When a pattern will break preview:
1. Tell the user: "This pattern needs a full build environment — the live preview won't show it correctly."
2. Ask: "Want me to continue? You can deploy to Vercel to see the full result."
3. If they confirm, proceed but set up the code correctly for production (it will work after deploy).
4. Never silently write code that breaks the preview without warning.
`
