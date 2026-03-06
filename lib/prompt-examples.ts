// Structural templates for common request types
// Injected into system prompt to guide AI generation quality

const TEMPLATES: Record<string, { keywords: string[]; template: string }> = {
  'landing-page': {
    keywords: ['landing page', 'homepage', 'hero section', 'landing'],
    template: `Architecture for a landing page:
- Data model: mostly static — define NavItem, Feature, Testimonial types in lib/types.ts
- State: minimal — mobile menu toggle, scroll position for sticky nav
- No API calls needed for static landing pages — use typed constants instead of inline arrays

Structure for a landing page:
- Hero section: headline (text-4xl+), subheadline (text-xl text-muted), CTA button (prominent, accent color), optional hero image/illustration
- Social proof: logo bar or testimonial carousel
- Features section: 3-4 cards in responsive grid (grid-cols-1 md:grid-cols-3), icon + title + description each
- How it works: numbered steps or timeline
- Pricing or CTA section: repeat CTA with urgency
- Footer: links, copyright, social icons
Mobile-first: stack everything vertically on mobile, grid on md+.`,
  },
  'pricing-page': {
    keywords: ['pricing', 'plans', 'subscription', 'tiers'],
    template: `Structure for a pricing page:
- Headline + subheadline explaining value
- Annual/monthly toggle (saves X%)
- 3 tier cards in responsive grid: name, price, feature list with checkmarks, CTA button
- Highlight recommended tier with ring-2 ring-accent and "Most Popular" badge
- Feature comparison table below (hidden on mobile, accordion on mobile)
- FAQ accordion section
- Final CTA section
Each tier card: rounded-xl border shadow-md p-8, consistent internal spacing.`,
  },
  'dashboard': {
    keywords: ['dashboard', 'admin panel', 'analytics', 'overview'],
    template: `Architecture for a dashboard:
- Data model: define StatCard, ActivityItem, ChartDataPoint types in lib/types.ts
- State: zustand store for sidebar collapse, date range filter
- Hooks: useStats(), useActivity(), useCharts() for data fetching
- Each data source needs: loading skeleton, error fallback, empty state

Structure for a dashboard:
- Sidebar navigation (w-64, collapsible on mobile) with icon + label links
- Top bar: page title, user avatar dropdown, notifications bell
- Stats row: 3-4 metric cards (grid-cols-2 lg:grid-cols-4) with label, value, trend indicator
- Main content: charts (recharts), data tables (@tanstack/react-table), or activity feed
- Each card: bg-white dark:bg-zinc-900 rounded-xl border shadow-sm p-6
Use zustand or context for sidebar collapse state.`,
  },
  'auth-flow': {
    keywords: ['login', 'signup', 'sign up', 'sign in', 'authentication', 'register'],
    template: `Architecture for auth:
- Data model: LoginForm, SignupForm, AuthUser, AuthError types in lib/types.ts
- State: form state via react-hook-form, auth state via context/zustand
- Hooks: useAuth() for login/logout/session, with loading and error states
- API: POST /api/auth/login → { user, token }, POST /api/auth/signup → { user }

Structure for auth pages:
- Centered card layout (max-w-md mx-auto mt-20)
- Logo/brand at top
- Form with: labeled inputs (react-hook-form + zod), show/hide password toggle, submit button with loading state
- Social login buttons (GitHub, Google) with divider "or continue with"
- Link to alternate flow ("Don't have an account? Sign up")
- Error messages: inline per-field (text-red-500 text-sm) + toast for server errors
Every input needs: label, placeholder, validation, error state, focus ring.`,
  },
  'settings-page': {
    keywords: ['settings', 'preferences', 'profile', 'account settings'],
    template: `Architecture for settings:
- Data model: UserProfile, NotificationPrefs, BillingInfo types in lib/types.ts
- State: form state via react-hook-form per section, with dirty tracking
- Hooks: useProfile(), useNotificationPrefs() — each with loading/save/error states

Structure for settings page:
- Left sidebar tabs or top tab bar for sections (Profile, Security, Notifications, Billing)
- Each section: heading, description, form fields in vertical stack
- Save button fixed at bottom or per-section
- Destructive actions (delete account) in separate danger zone section with red border
- Toggle switches for boolean settings, select dropdowns for choices
Use react-hook-form for the form, zod for validation.`,
  },
  'data-table': {
    keywords: ['table', 'data table', 'list', 'crud', 'records'],
    template: `Architecture for a data table:
- Data model: define the row type (e.g. User, Product, Order) in lib/types.ts with all columns typed
- State: URL params for sort/filter/page (shareable), React state for selection
- Hooks: useTableData(filters) with loading/error/empty states, usePagination()
- API: GET /api/resource?sort=name&page=1&limit=20 → { data: T[], total: number }

Structure for a data table page:
- Header: page title + "Add New" button
- Search/filter bar: text input + dropdown filters + date range
- Table: sticky header, sortable columns (click header to sort), row hover state
- Pagination: page numbers or "Load more", items per page selector
- Empty state: illustration + "No items found" + CTA
- Row actions: edit/delete dropdown menu (3-dot icon)
- Mobile: switch to card layout on small screens (hidden table, visible cards)
Use @tanstack/react-table for sorting/filtering/pagination.`,
  },
  'form': {
    keywords: ['form', 'contact form', 'survey', 'questionnaire', 'input'],
    template: `Architecture for forms:
- Data model: define form field types and validation schema in lib/types.ts (zod schema → infer TypeScript type)
- State: react-hook-form with zodResolver — never manage form state manually
- Handle: loading (submit button spinner), success (replace form or toast), error (field-level + toast)

Structure for forms:
- Logical field grouping with section headers
- Every input: label (htmlFor), placeholder, validation (zod), error message (text-red-500 text-sm)
- Field types: text, email, tel, textarea, select, checkbox, radio group, file upload
- Submit button: full-width or right-aligned, loading spinner on submit, disabled when invalid
- Success state: replace form with success message or toast
- Use react-hook-form with zodResolver for validation.`,
  },
  'blog': {
    keywords: ['blog', 'articles', 'posts', 'content', 'cms'],
    template: `Architecture for a blog:
- Data model: Post { slug, title, excerpt, body, date, author, tags } in lib/types.ts
- State: URL params for category filter, search query
- Hooks: usePosts(filter), usePost(slug) with loading/error states
- Static data acceptable for demo — but type the arrays properly

Structure for a blog:
- Blog listing: card grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3), each card has: image, category badge, title, excerpt, date, read time
- Blog post: max-w-3xl mx-auto prose, hero image, title (text-4xl), author + date, markdown-rendered body, share buttons, related posts
- Sidebar optional: categories, recent posts, newsletter signup
Use prose class from @tailwindcss/typography for article body.`,
  },
  'e-commerce': {
    keywords: ['shop', 'store', 'product', 'cart', 'checkout', 'e-commerce', 'ecommerce'],
    template: `Architecture for e-commerce:
- Data model: Product, CartItem, Cart, Order, Address types in lib/types.ts
- State: zustand cart store (add, remove, update quantity, clear)
- Hooks: useProducts(), useCart(), useCheckout() — each with loading/error/empty
- API shapes: GET /api/products → Product[], POST /api/orders → Order

Structure for e-commerce:
- Product grid: responsive cards with image, name, price, rating stars, "Add to Cart" button
- Product detail: image gallery (thumbnail + main), title, price, description, size/color selectors, quantity, Add to Cart, reviews section
- Cart: item list with quantity controls, subtotal, shipping estimate, checkout CTA
- Checkout: multi-step (shipping → payment → review) or single page
Use zustand for cart state. Images from placeholder service until real images exist.`,
  },
  'portfolio': {
    keywords: ['portfolio', 'personal site', 'resume', 'cv', 'showcase'],
    template: `Structure for a portfolio:
- Hero: name (text-5xl), title/tagline, social links, optional photo
- About section: short bio, skills tags (badge-style)
- Projects grid: cards with screenshot, title, tech stack tags, links (live + GitHub)
- Experience timeline: company, role, dates, bullet points
- Contact section: form or email link + social icons
Minimal, clean design. Let the work speak.`,
  },
  'api-route': {
    keywords: ['api', 'endpoint', 'rest api', 'crud api', 'backend', 'route handler'],
    template: `Structure for API routes (Next.js App Router):
- File at app/api/{resource}/route.ts
- Export named handlers: GET, POST, PUT, DELETE
- Input validation with zod: const schema = z.object({...}), parse request body
- Error handling: try/catch with typed error responses {error: string, status: number}
- GET: query params via URL searchParams, return paginated results {data: T[], total: number}
- POST: validate body, create resource, return 201 with created object
- PUT: validate body + id param, update resource, return updated object
- DELETE: validate id param, soft-delete preferred, return 204
- Use NextResponse.json() for responses. Set appropriate status codes.
- Add rate limiting for public endpoints.`,
  },
  'email-template': {
    keywords: ['email', 'email template', 'newsletter', 'transactional email'],
    template: `Structure for email templates (react-email):
- Use @react-email/components: Html, Head, Body, Container, Section, Text, Button, Img, Hr, Link
- Container: max-width 600px, centered, font-family system stack
- Header: logo image (hosted URL), brand name
- Body: greeting, main content paragraphs, CTA button (prominent, padded, rounded)
- Footer: unsubscribe link, company address, social links
- Inline styles only (no CSS classes) — email clients strip <style> tags
- Preview text: first 90 chars visible in inbox preview
- Test with react-email preview: npx email dev`,
  },
  'search-filter': {
    keywords: ['search bar', 'filter', 'autocomplete', 'faceted', 'search ui'],
    template: `Structure for search/filter UI:
- Search input: icon (magnifying glass) + text input + clear button, debounced onChange (300ms)
- Filter bar below search: horizontal scroll of filter chips/dropdowns (category, date range, status, sort)
- Active filters shown as removable badges/chips with X button
- Results area: loading skeleton during search, result cards/list, empty state if no matches
- Keyboard: Escape clears, Enter searches, arrow keys navigate results
- URL sync: filters stored in URL search params (useSearchParams) for shareable links
- Mobile: filters collapse into bottom sheet or modal
Use useDeferredValue or debounce for search, zustand for filter state.`,
  },
  'chat-ui': {
    keywords: ['chat', 'messaging', 'chatbot', 'conversation', 'message'],
    template: `Architecture for chat UI:
- Data model: Message { id, role, content, timestamp }, Conversation { id, messages, title } in lib/types.ts
- State: zustand for conversations list, React state for current input
- Hooks: useMessages(conversationId) with loading/streaming/error states
- Handle: optimistic updates (show message immediately), streaming responses, retry on failure

Structure for chat/messaging UI:
- Message list: scrollable container (flex-col-reverse or scroll-to-bottom), auto-scroll on new messages
- Message bubble: user (right-aligned, accent bg) vs other (left-aligned, muted bg), rounded-2xl px-4 py-2
- Each message: avatar, name, timestamp, text content, optional reactions
- Input area: fixed bottom, textarea (auto-grow), send button, optional attach/emoji buttons
- Typing indicator: animated dots for "user is typing..."
- Loading: skeleton messages while fetching history
- Group consecutive messages from same sender (no repeated avatar)
- Keyboard: Enter to send (Shift+Enter for newline)
Use useRef for scroll container, useEffect for auto-scroll.`,
  },
  'file-upload': {
    keywords: ['upload', 'file upload', 'drag and drop', 'dropzone', 'image upload'],
    template: `Structure for file upload UI:
- Drop zone: dashed border, drag-over highlight (border-accent bg-accent/10), click to browse
- Icon + "Drag & drop or click to browse" text, accepted file types listed
- File list: name, size (humanized), type icon, progress bar during upload, remove button
- Preview: image thumbnails for image files, generic icon for others
- Validation: max file size, allowed types, max file count — show inline errors
- Upload progress: per-file progress bar (0-100%), overall progress
- States: idle, dragging-over, uploading, complete, error
- Use useDropzone from react-dropzone or native drag events (onDragOver, onDrop, onDragLeave)
- FormData for multipart upload, or presigned URLs for direct-to-S3.`,
  },
  'docs-page': {
    keywords: ['documentation', 'docs', 'mdx', 'knowledge base', 'help center', 'wiki'],
    template: `Structure for documentation pages:
- Sidebar: collapsible section tree (nested ul), active item highlighted, sticky on desktop
- Main content: max-w-3xl, prose typography (@tailwindcss/typography), proper heading hierarchy
- Table of contents: right sidebar on xl+ screens, auto-generated from headings, scroll-spy active state
- Search: command palette (Cmd+K) or top search bar with instant results
- Navigation: prev/next links at bottom of each page
- Code blocks: syntax highlighted (shiki or prism), copy button, optional filename header
- Callouts: info/warning/danger boxes with icon + colored border
- Mobile: sidebar becomes hamburger drawer, TOC hidden
- Breadcrumbs at top showing section hierarchy.`,
  },
}

export function getPromptExample(userMessage: string): string | null {
  const lower = userMessage.toLowerCase()
  for (const [, entry] of Object.entries(TEMPLATES)) {
    if (entry.keywords.some(kw => lower.includes(kw))) {
      return entry.template
    }
  }
  return null
}
