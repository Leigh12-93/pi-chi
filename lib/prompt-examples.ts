// Structural templates for common request types
// Injected into system prompt to guide AI generation quality

const TEMPLATES: Record<string, { keywords: string[]; template: string }> = {
  'landing-page': {
    keywords: ['landing page', 'homepage', 'hero section', 'landing'],
    template: `Structure for a landing page:
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
    template: `Structure for a dashboard:
- Sidebar navigation (w-64, collapsible on mobile) with icon + label links
- Top bar: page title, user avatar dropdown, notifications bell
- Stats row: 3-4 metric cards (grid-cols-2 lg:grid-cols-4) with label, value, trend indicator
- Main content: charts (recharts), data tables (@tanstack/react-table), or activity feed
- Each card: bg-white dark:bg-zinc-900 rounded-xl border shadow-sm p-6
Use zustand or context for sidebar collapse state.`,
  },
  'auth-flow': {
    keywords: ['login', 'signup', 'sign up', 'sign in', 'authentication', 'register'],
    template: `Structure for auth pages:
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
    template: `Structure for settings page:
- Left sidebar tabs or top tab bar for sections (Profile, Security, Notifications, Billing)
- Each section: heading, description, form fields in vertical stack
- Save button fixed at bottom or per-section
- Destructive actions (delete account) in separate danger zone section with red border
- Toggle switches for boolean settings, select dropdowns for choices
Use react-hook-form for the form, zod for validation.`,
  },
  'data-table': {
    keywords: ['table', 'data table', 'list', 'crud', 'records'],
    template: `Structure for a data table page:
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
    template: `Structure for forms:
- Logical field grouping with section headers
- Every input: label (htmlFor), placeholder, validation (zod), error message (text-red-500 text-sm)
- Field types: text, email, tel, textarea, select, checkbox, radio group, file upload
- Submit button: full-width or right-aligned, loading spinner on submit, disabled when invalid
- Success state: replace form with success message or toast
- Use react-hook-form with zodResolver for validation.`,
  },
  'blog': {
    keywords: ['blog', 'articles', 'posts', 'content', 'cms'],
    template: `Structure for a blog:
- Blog listing: card grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-3), each card has: image, category badge, title, excerpt, date, read time
- Blog post: max-w-3xl mx-auto prose, hero image, title (text-4xl), author + date, markdown-rendered body, share buttons, related posts
- Sidebar optional: categories, recent posts, newsletter signup
Use prose class from @tailwindcss/typography for article body.`,
  },
  'e-commerce': {
    keywords: ['shop', 'store', 'product', 'cart', 'checkout', 'e-commerce', 'ecommerce'],
    template: `Structure for e-commerce:
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
