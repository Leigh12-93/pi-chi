# Pi-Chi Audit Fixes v3 — Claude Code Implementation Prompt

Apply all fixes below in order. Each fix includes the exact file, line numbers, the problem, WHY it matters, and the replacement code. After all changes: `npx tsc --noEmit` then `npm run build`.

---

## Fix 1: Rate limiter setInterval keeps Lambda alive (memory leak on serverless)

**File:** `lib/rate-limit.ts`, line 12
**Problem:** `setInterval(() => { ... }, 60_000)` at module scope creates a persistent timer. On Vercel serverless, this prevents the Lambda from being garbage collected between invocations, leading to memory leaks and stale state accumulation across requests.
**Why:** Every import of `rate-limit.ts` starts a 60-second repeating timer that references the `stores` Map. The Lambda runtime keeps the process alive for this timer even when no requests are active. Over many invocations, the `stores` Map grows unboundedly since the cleanup only runs every 60s but entries could accumulate faster.

**Fix:** Replace the `setInterval` with lazy cleanup on each rate limit check. Delete lines 11-17 and modify the `rateLimit` function:

```ts
// DELETE these lines (11-17):
// // Clean up expired entries every 60s
// setInterval(() => {
//   const now = Date.now()
//   for (const store of stores.values()) {
//     for (const [key, entry] of store) {
//       if (now > entry.resetAt) store.delete(key)
//     }
//   }
// }, 60_000)

// REPLACE the rateLimit function body (keep the signature):
export function rateLimit(
  name: string,
  maxRequests: number,
  windowMs: number,
): (ip: string) => { ok: boolean; remaining: number; resetIn: number } {
  if (!stores.has(name)) stores.set(name, new Map())
  const store = stores.get(name)!

  return (ip: string) => {
    const now = Date.now()

    // Lazy cleanup: evict expired entries on each call (O(n) but n is small — IPs with active sessions)
    if (store.size > 100) {
      for (const [key, entry] of store) {
        if (now > entry.resetAt) store.delete(key)
      }
    }

    const entry = store.get(ip)

    if (!entry || now > entry.resetAt) {
      store.set(ip, { count: 1, resetAt: now + windowMs })
      return { ok: true, remaining: maxRequests - 1, resetIn: windowMs }
    }

    entry.count++
    const remaining = Math.max(0, maxRequests - entry.count)
    const resetIn = entry.resetAt - now

    if (entry.count > maxRequests) {
      return { ok: false, remaining: 0, resetIn }
    }

    return { ok: true, remaining, resetIn }
  }
}
```

---

## Fix 2: CSP allows unsafe-eval and unused CDN (XSS vulnerability)

**File:** `middleware.ts`, line 8
**Problem:** The Content-Security-Policy header includes `'unsafe-eval'` in `script-src` and references `cdn.tailwindcss.com`. Nothing in Pi-Chi uses `eval()` and Tailwind is bundled locally. `unsafe-eval` allows any injected script to call `eval()`, `Function()`, or `setTimeout('string')`.
**Why:** Removing `unsafe-eval` tightens the XSS attack surface. Keep `unsafe-inline` for now (needed for code block copy buttons and Next.js inline scripts).

**Fix:** Replace line 8:

```ts
response.headers.set(
  'Content-Security-Policy',
  "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https:; frame-src 'self' https:;"
)
```

---

## Fix 3: GitHub import returns unsanitized paths to client

**File:** `app/api/github/import/route.ts`, around line 196 (inside the POST handler)
**Problem:** File paths from the GitHub tree API are returned directly in the JSON response without sanitization. While `VirtualFS.write()` calls `sanitizePath()` when the AI writes files, the import route sends raw GitHub paths to the client. The client calls `setFiles(response.files)` which bypasses VFS entirely, storing raw paths in React state that flow into the file tree UI.
**Why:** If GitHub returns a path like `../../../etc/passwd` or contains null bytes, the client would store it unsanitized. The VFS sanitizes on tool writes but the import path doesn't go through VFS.

**Fix:** Add this import at the top of the file:
```ts
import { VirtualFS } from '@/lib/virtual-fs'
```

Then in the POST handler, after `const importResult = await Promise.race([...])` and before building the `response` object, sanitize all paths:

```ts
// Sanitize all paths before returning to client
const sanitizedFiles: Record<string, string> = {}
for (const [path, content] of Object.entries(importResult.files)) {
  const safePath = VirtualFS.sanitizePath(path)
  if (safePath) {
    sanitizedFiles[safePath] = content
  }
}

const response: any = {
  files: sanitizedFiles,
  fileCount: Object.keys(sanitizedFiles).length,
  branch: targetBranch,
  skipped: importResult.skipped,
}
```

---

## Fix 4: Compaction fallback drops ALL middle messages silently

**File:** `lib/compaction.ts`, lines 113-118 (the catch block of `compactMessages`)
**Problem:** When the Haiku summarization call fails, the catch block creates `[...firstMessages, ...recentMessages]` — silently dropping all middle messages with zero context. For a 50-message conversation, this loses 40 messages of architecture decisions, file paths, and user requirements.
**Why:** The AI continues unaware that critical context was lost. It might recreate files that already exist, re-ask questions the user already answered, or contradict earlier agreements. This is worse than the original context overflow because it's silent — at least the overflow gives the user an error.

**Fix:** Replace the catch block (lines 113-118):

```ts
  } catch (error) {
    console.error('[pi:compaction] Haiku summarization failed, falling back to metadata-only summary:', error)

    // Fallback: extract metadata from dropped messages instead of losing them entirely
    const toolsUsed = new Set<string>()
    const filesReferenced = new Set<string>()
    for (const m of middleMessages) {
      const text = getMessageText(m)
      const toolMatch = text.match(/\[Tools used: ([^\]]+)\]/g)
      if (toolMatch) {
        for (const match of toolMatch) {
          const tools = match.replace(/\[Tools used: |\]/g, '').split(', ')
          tools.forEach(t => toolsUsed.add(t.split('(')[0].trim()))
        }
      }
      const pathMatches = text.match(/[\w\-./]+\.\w{1,10}/g)
      if (pathMatches) {
        pathMatches.slice(0, 50).forEach(p => filesReferenced.add(p))
      }
    }

    const fallbackSummary = [
      `[Conversation Summary — ${middleMessages.length} messages compacted (summarization unavailable, metadata only)]`,
      toolsUsed.size > 0 ? `Tools used: ${[...toolsUsed].join(', ')}` : '',
      filesReferenced.size > 0 ? `Files referenced: ${[...filesReferenced].slice(0, 30).join(', ')}` : '',
      `${middleMessages.filter(m => m.role === 'user').length} user messages and ${middleMessages.filter(m => m.role === 'assistant').length} assistant messages were compacted.`,
    ].filter(Boolean).join('\n')

    const summaryMessage: UIMessage = {
      id: `compaction-fallback-${Date.now()}`,
      role: 'assistant' as const,
      parts: [{ type: 'text' as const, text: fallbackSummary }],
      content: '',
    } as any

    const fallback = [...firstMessages, summaryMessage, ...recentMessages]
    const savedTokens = Math.round(
      (JSON.stringify(messages).length - JSON.stringify(fallback).length) / 4
    )
    return { messages: fallback, compacted: true, tokensSaved: savedTokens }
  }
```

---

## Fix 5: Markdown code block copy button has injectable ID

**File:** `lib/chat/markdown.ts`, line 54
**Problem:** The copy button uses an inline `onclick` handler with an `id` variable interpolated directly into the HTML string. If the generated ID contained a single quote or special characters, it could break out of the attribute and inject JavaScript.
**Why:** While DOMPurify sanitizes the output, the ID is generated from code content and could theoretically contain quotes. Sanitizing the ID to alphanumeric-only eliminates the vector.

**Fix:** Before the button HTML string, sanitize the ID:

```ts
// Before the button HTML generation, add:
const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '')

// Then use safeId instead of id in both the code block id and the onclick:
`<pre><code id="${safeId}" ...`
`<button onclick="navigator.clipboard.writeText(document.getElementById('${safeId}').textContent)...`
```

---

## Fix 6: Background tasks retry with fixed 1s delay (no backoff)

**File:** `lib/background-tasks.ts`, lines 134, 137, 155, 158
**Problem:** All four retry delays are `setTimeout(r, 1000)`. During a Supabase outage, all retries fire at the same cadence creating a thundering herd.
**Why:** Exponential backoff with jitter prevents cascading failures when the downstream service is overloaded.

**Fix:** Add this helper at the top of the file:
```ts
function backoffDelay(attempt: number): number {
  const base = Math.min(1000 * Math.pow(2, attempt), 30000)
  const jitter = Math.random() * base * 0.3
  return base + jitter
}
```

Then replace each `setTimeout(r, 1000)` at lines 134, 137, 155, 158 with:
```ts
setTimeout(r, backoffDelay(MAX_RETRIES - retries))
```

Where `MAX_RETRIES` is the initial retries value (should be defined as a constant, currently the function parameter default).

---

## Fix 7: v0-sandbox setInterval for session cleanup (same Lambda issue as Fix 1)

**File:** `lib/v0-sandbox.ts`, lines 113-116
**Problem:** Same as Fix 1 — `setInterval(() => evictStaleSessions(), CLEANUP_INTERVAL_MS)` keeps the Lambda alive.
**Why:** Identical reasoning — persistent timer prevents GC.

**Fix:** Replace with lazy cleanup. Delete lines 113-116 and add time-based cleanup check:

```ts
// DELETE lines 113-116 (the setInterval block)

// Add at module level:
let _lastSandboxCleanup = 0

function maybeCleanupSandboxSessions() {
  const now = Date.now()
  if (now - _lastSandboxCleanup > CLEANUP_INTERVAL_MS) {
    _lastSandboxCleanup = now
    evictStaleSessions()
  }
}

// Then call maybeCleanupSandboxSessions() at the start of getOrCreateSession and syncFilesToSandbox
```

---

## Fix 8: supabaseFetch has no retry on transient failures

**File:** `lib/supabase-fetch.ts`
**Problem:** A single `ECONNRESET`, `503`, or `ETIMEDOUT` causes immediate failure. Every downstream operation (save project, load messages, task persistence) fails.
**Why:** Supabase has occasional blips. A single retry with 1s delay recovers from >90% of transient failures.

**Fix:** Replace the entire `supabaseFetch` function:

```ts
export async function supabaseFetch(
  path: string,
  options: RequestInit = {},
): Promise<{ ok: boolean; data: any; status: number }> {
  const maxRetries = 1

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
        ...options,
        signal: options.signal ?? AbortSignal.timeout(10_000),
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=representation',
          ...options.headers,
        },
      })

      // Retry only on 5xx server errors
      if (!res.ok && res.status >= 500 && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }

      let data
      try {
        const text = await res.text()
        data = text ? JSON.parse(text) : null
      } catch {
        data = null
      }

      return { ok: res.ok, data, status: res.status }
    } catch (err: any) {
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
        continue
      }
      // Return error object instead of throwing — matches existing callsite expectations
      return { ok: false, data: { error: err.message || 'Network error' }, status: 0 }
    }
  }

  return { ok: false, data: { error: 'Unreachable' }, status: 0 }
}
```

---

## Fix 9: AUTH_SECRET empty string allows unsigned JWTs in production

**File:** `lib/auth.ts`, lines 4-8 and the `createSession` function
**Problem:** When `AUTH_SECRET` is empty (not set), `SECRET` becomes a zero-length key. `jose` still signs JWTs with this — any attacker who knows the secret is empty can pi valid sessions.
**Why:** In production, if the env var is accidentally unset, the app silently runs with no auth security. The existing warning only fires for 1-31 char secrets, not empty.

**Fix:** Replace lines 4-8:

```ts
const authSecret = (process.env.AUTH_SECRET || '').trim()
if (!authSecret && process.env.NODE_ENV === 'production') {
  console.error('[pi] FATAL: AUTH_SECRET is not set in production. Authentication is disabled.')
}
if (authSecret.length > 0 && authSecret.length < 32) {
  console.warn('[pi] AUTH_SECRET is shorter than 32 characters. This is insecure.')
}
const SECRET = new TextEncoder().encode(authSecret)
```

And add a guard to `createSession`:

```ts
export async function createSession(data: Pi-ChiSession): Promise<string> {
  if (!authSecret) {
    throw new Error('Cannot create session: AUTH_SECRET is not configured')
  }
  return new SignJWT({ ...data })
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('30d')
    .setIssuedAt()
    .sign(SECRET)
}
```

---

## Fix 10: db_tools ALLOWED_TABLES regex matches unintended names

**File:** `lib/tools/db-tools.ts`, lines 28 and 109
**Problem:** The regex `/^(pi_|credit_packages$)/` matches any table starting with `pi_` including `pi_` itself (empty suffix). While this is unlikely to be exploited since table names come from the AI, a more precise regex prevents accidental queries against tables with no suffix.
**Why:** Defense in depth — the regex should require at least one character after `pi_`.

**Fix:** Replace both occurrences (lines 28 and 109):

```ts
// Before:
const ALLOWED_TABLES = /^(pi_|credit_packages$)/

// After:
const ALLOWED_TABLES = /^(pi_\w+|credit_packages)$/
```

This ensures the table name must be `pi_` followed by one or more word characters, or exactly `credit_packages`. The `$` anchor on the outer group prevents partial matches.

---

## Verification

After applying all 10 fixes:
1. `npx tsc --noEmit` — fix any type errors
2. `npm run build` — fix any build errors
3. `grep -rn "setInterval" lib/ --include="*.ts" | grep -v reference-library | grep -v node_modules` — should return 0 results
4. `grep -rn "unsafe-eval" . --include="*.ts" | grep -v node_modules` — should return 0 results
5. Commit: `fix: audit v3 — rate limit cleanup, CSP hardening, path sanitization, retry logic, auth hardening`
6. Push to branch `v0/peninsulatrailerbins-4638-5b4ae61f`
