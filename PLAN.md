# Plan: Enhanced six-chi.md with Web Research, Full-Stack Spec, Error Recovery & Tailwind Safety

## Summary

Four major enhancements to the Forge AI system prompt (`lib/system-prompt.ts`):

1. **Web Research Phase** — AI uses `web_search` to find real design references before writing six-chi.md
2. **Full Backend Architecture** — New mandatory section in six-chi.md for API routes, DB schema, auth, middleware
3. **Console Error Auto-Read** — AI must call `run_build` AND check console output, proactively fix errors
4. **Tailwind v4 Safety Rules** — Prevent black screen from broken CSS custom property arbitrary values

---

## Change 1: Design Research Phase (before six-chi.md creation)

**Location:** `lib/system-prompt.ts` — "When six-chi.md does NOT exist" section (lines 250-254)

**What changes:**
Insert a new Step 0 before the current steps. When creating a NEW project, the AI must:

1. Call `web_search` 2-3 times to research:
   - "[industry/niche] website design inspiration" — find real sites in the same domain
   - "[industry] color palette typography" — find human-crafted design patterns for this specific audience
   - "[project type] UX flow patterns" — find established user flow patterns
2. Analyze the search results to extract:
   - Color palettes that real sites in this niche use (NOT blue/purple defaults)
   - Font pairings that match the brand personality
   - Layout patterns that award-winning sites in this category use
   - Interaction patterns (micro-interactions, scroll behaviors, transitions)
   - Backend patterns if the project needs data/auth/payments
3. Use these findings to inform the six-chi.md design system, page layouts, and user flows

**Why:** The AI currently guesses design decisions. Web research grounds them in real-world examples, producing output that looks human-designed rather than AI-generated.

---

## Change 2: Backend Architecture Section in six-chi.md

**Location:** `lib/system-prompt.ts` — six-chi.md format section (after "Data Model", before "Design System")

**New mandatory section:**

```
- **Backend Architecture** (if project has server-side logic):
  - API Routes: every route with method, path, request body shape, response shape, auth requirement, error responses
  - Middleware: auth middleware, CORS, rate limiting, error handling middleware
  - Database Schema: every table with columns, types, constraints, indexes, RLS policies
  - Authentication: auth strategy (Supabase Auth, NextAuth, custom JWT), protected routes, session handling
  - Webhooks: any external webhook handlers with payload shapes and verification
  - Background Jobs: any scheduled tasks or cron jobs
  - External Services: every third-party API integration with SDK, endpoints, auth method
  - Environment Variables: every env var needed with description of where to get the value
  - Error Handling Strategy: global error format, HTTP status code mapping, client error display
  - Data Validation: Zod schemas for every API input (request bodies, query params, path params)
```

---

## Change 3: Console/Terminal Error Reading

**Location:** `lib/system-prompt.ts` — after "Build-Fix Loop" section (around line 556)

**New section: "Console Error Recovery (MANDATORY)"**

The AI must:
1. After EVERY `run_build`, also call `run_command` with `npm run dev` or check the dev server output
2. If preview shows a blank screen or error, immediately call `diagnose_preview`
3. After deploying or significant changes, check the console panel for runtime errors
4. If `run_build` passes but preview is broken, the issue is runtime — read console errors via the capture mechanism
5. When the AI sees "black screen", "white screen", "nothing showing", or "blank page" from the user, it must:
   - Check if CSS is loading (read globals.css + check for syntax errors)
   - Check if the main component renders (read App.tsx or page.tsx)
   - Run `run_build` to catch compile errors
   - Call `diagnose_preview` to check for iframe/header issues

---

## Change 4: Tailwind v4 CSS Safety Rules

**Location:** `lib/system-prompt.ts` — near "Preview Compatibility" or "Component Rules" section

**New section: "Tailwind v4 CSS Rules (CRITICAL — prevents black screens)"**

Rules to add:
1. **NEVER use CSS custom properties in Tailwind arbitrary values** like `bg-[--color-x]` or `from-[--color-x]` — this causes black screens in Tailwind v4
2. **ALWAYS use standard Tailwind color classes** (`bg-gray-900`, `text-white`) OR define custom colors in `@theme` block in globals.css and reference them as named utilities (`bg-brand`, `text-accent`)
3. **Correct pattern for custom colors in Tailwind v4:**
   ```css
   @theme {
     --color-brand: #1a1a2e;
     --color-accent: #e94560;
   }
   ```
   Then use: `bg-brand`, `text-accent` (NOT `bg-[--color-brand]`)
4. **Design tokens go in globals.css `@theme` block** — never as inline arbitrary values
5. After writing globals.css with custom tokens, ALWAYS `run_build` immediately to verify CSS compiles

---

## Change 5: Enhance "Human-Like Design" Instructions

**Location:** `lib/system-prompt.ts` — within the six-chi.md Design System section and Creative Philosophy

**Add concrete human-design techniques from research:**

1. **Texture & Imperfection**: Subtle grain overlays, slightly irregular spacing, hand-drawn-style borders. Not pixel-perfect mechanical precision.
2. **Motion Narrative**: Scroll-triggered reveals (intersection observer + framer-motion), staggered entrance animations (50-100ms between items), parallax depth layers. NOT everything animating at once.
3. **Micro-interactions**: Button press scale(0.97) → release, input focus glow with 200ms ease, hover cards lift with shadow transition, loading skeleton shimmer, smooth page transitions (300ms fade+slide).
4. **Typography Rhythm**: Intentional type scale — not just "big heading, medium subhead, small body". Varying line-heights (1.1 for display, 1.5 for body, 1.7 for long-form). Letter-spacing tighter on large text (-0.02em), normal on body.
5. **Color Depth**: Never flat — use layered backgrounds (e.g., surface over background with subtle tint shift), shadows that match the color palette (not pure black shadows), gradient accents that flow naturally.
6. **Whitespace as Design**: Generous section padding (120-160px), not cramped. Sections breathe. Content groups have clear visual separation through space, not lines.

---

## Files Modified

| File | Changes |
|------|---------|
| `lib/system-prompt.ts` | All 5 changes above — ~150 lines added/modified in TIER_A |

## Build & Deploy

1. Edit `lib/system-prompt.ts` with all changes
2. `npm run build` to verify
3. Git commit + push
4. `npx vercel --prod` to deploy
