# CLAUDE.md — Pi-Chi

AI-powered React website builder with self-modification superpowers.
v0/Bolt.ai clone using Claude API. Architecture inspired by Brick CLI.

## Quick Reference

```bash
npm run dev          # localhost:3333
npm run build        # Production build
git push             # Deploy via Vercel (auto-deploys on push)
npx vercel --prod    # Manual production deploy
```

## Architecture

**Stack:** Next.js 15 | Tailwind v4 | Vercel AI SDK v6 | Claude Sonnet 4 / Opus 4.6 | Monaco Editor | Supabase

**Cloud-only** — no local filesystem. All files live in browser memory (VirtualFS).
Client sends file state with each request. Tool results carry updates back.
Projects persist to Supabase (auto-save 5s debounce).

```
app/
  page.tsx                 Main page — project persistence, auto-save, project picker → workspace
  layout.tsx               Root layout (dark theme, SessionProvider)
  globals.css              Tailwind v4 + custom pi theme tokens
  api/chat/route.ts        Builder AI endpoint — VirtualFS, 60+ tools, extended thinking, project memory
  api/brain/chat/route.ts  Brain chat endpoint — Pi-Chi personality, brain tools (goals, mood, commands)
  api/vitals/route.ts      System vitals — CPU, memory, disk, temp, uptime, IP, SSID
  api/projects/route.ts    Project CRUD (GET list, POST create)
  api/projects/[id]/       Project detail (GET with files, PUT save, DELETE)
  api/auth/login|callback|logout|session  Custom PKCE S256 GitHub OAuth + JWT
components/
  workspace.tsx            3-panel resizable layout, auto-selects first file
  chat-panel.tsx           Builder chat (useChat, tool processing) — used in workspace, NOT in agent dashboard
  agent-dashboard.tsx      Agent dashboard layout — uses BrainChat for Pi-Chi conversation
  chat/message-item.tsx    Message rendering — reasoning blocks, inline diffs, command output, cost chips
  approval-card.tsx        Smart approval gates for destructive tool calls
  code-editor.tsx          Monaco editor with Ctrl+S
  file-tree.tsx            Recursive expand/collapse
  preview-panel.tsx        iframe preview (JSX→HTML + Tailwind CDN)
  project-picker.tsx       Saved projects grid + new project + quick starts
  header.tsx               Top bar with GitHub auth
  session-provider.tsx     Custom session context provider
lib/
  auth.ts                  Custom JWT auth (AES-GCM encrypted PAT, PKCE S256 GitHub OAuth)
  supabase.ts              Supabase client + type definitions
  utils.ts                 cn(), formatRelative(), getFileIcon(), getLanguageFromPath()
  types.ts                 Project, FileNode, FileChange, ChatSession types
  chat/constants.ts        Model pricing, token formatting, destructive tool patterns
  chat/tool-utils.ts       extractFileUpdates, getToolSummary, diff snapshots
supabase/
  migrations/001_pi_tables.sql   Database schema (run in Supabase SQL editor)
```

## AI Tools (60+)

| Category | Tools |
|----------|-------|
| Planning | `think`, `suggest_improvement`, `web_search` |
| File ops | `write_file`, `read_file`, `edit_file`, `delete_file`, `list_files`, `search_files`, `grep_files`, `rename_file`, `get_all_files` |
| Project | `create_project` (nextjs/vite-react/static), `save_project` |
| GitHub | `github_create_repo`, `github_push_update`, `github_read_file`, `github_list_repo_files`, `github_modify_external_file`, `github_search_code`, `github_pull_latest` |
| Deploy | `deploy_to_vercel` |
| Database | `db_query`, `db_mutate`, `db_introspect`, `save_project` |
| Self-Mod | `pi_read_own_source`, `pi_modify_own_source`, `pi_redeploy`, `pi_revert_commit`, `pi_create_branch`, `pi_create_pr`, `pi_merge_pr`, `pi_check_npm_package`, `pi_list_branches`, `pi_delete_branch` |
| Task Mgmt | `check_task_status` |
| Model | `select_model` (switch between haiku/sonnet/opus mid-session) |
| Memory | `save_memory`, `load_memory` (persistent per-project memory) |

## Superpower Tools

### Self-Modification
The AI can read and modify its own source code via GitHub API:
- `pi_read_own_source` — read any file from `Leigh12-93/pi-chi`
- `pi_modify_own_source` — push a commit to modify its own code
- `pi_redeploy` — trigger Vercel redeployment after self-mod

### Database Access
Full CRUD on Supabase via PostgREST:
- `db_query` — SELECT with filters, ordering, limits
- `db_mutate` — INSERT, UPDATE, UPSERT, DELETE
- Pi-Chi tables: `pi_projects`, `pi_project_files`, `pi_chat_messages`, `pi_deployments`

### External Repo Access
Read and modify any GitHub repo the user has access to:
- `github_read_file` — read file from any repo
- `github_list_repo_files` — browse directory listing
- `github_modify_external_file` — push commits to any repo
- `github_search_code` — search across GitHub

### Project Persistence
- Projects auto-save to Supabase (5s debounce after file changes)
- `save_project` tool — AI can trigger explicit saves
- Projects load with all files from database
- Filtered by GitHub username from OAuth session

### Persistent Project Memory
Per-project memory stored as JSONB in `pi_projects.memory`:
- `save_memory` tool — AI saves key/value pairs (conventions, architecture, preferences)
- `load_memory` tool — AI reads all memory entries at conversation start
- Memory auto-loaded into system prompt on each request
- Max 5KB per project
- User can view/edit in Project Settings → Memory tab

## Claude Code-Level Chat Features

### Visible Extended Thinking
Opus 4.6 reasoning blocks stream in real-time as collapsible `<ReasoningBlock>` with brain icon. Default collapsed after completion.

### Smart Approval Gates
Client-side interception for destructive tools (`delete_file`, `db_mutate`, dangerous `run_command` patterns like `rm -rf`, `drop table`, `--force`). Shows inline `ApprovalCard` with Approve/Deny + "Always allow" checkbox (persisted to localStorage).

### Token/Cost Display
- Per-message: `CostChip` showing input/output tokens + estimated cost
- Session total: running cost in chat footer
- Model pricing: Sonnet $3/$15, Opus $15/$75, Haiku $0.80/$4 per 1M tokens

### Inline Diff Review
`edit_file` tool calls show old→new unified diff inline in the message timeline. Green/red lines, collapsible for large diffs.

### Command Output in Chat
Terminal tools (`run_command`, `run_build`, `run_tests`, `check_types`) render output inline with terminal styling, exit code badge, and collapsible output for long results.

### Auto-Verify Mode
System prompt instructs AI: after writing/editing 2+ files, run `run_build` to verify compilation. Fix errors up to 3 attempts. Report final status.

## Token Optimization (Brick-inspired)

1. **Lean tool results**: `write_file` and `edit_file` return `{ok, path, lines}` — no content echo.
2. **Client extracts from args**: `extractFileUpdates()` reads content from tool call `args` (not `result`).
3. **File manifest**: System prompt includes path + lines + size per file. No content in prompt.
4. **get_all_files returns manifest only**: Path/lines/size, not content.

## Live Streaming (Brick-inspired)

Tool invocations are processed **individually** as they arrive, not batched:
- `write_file`: Processed at `state === 'call'` — instant file tree + preview update
- `edit_file`, `create_project`, `rename_file`: Processed at `state === 'result'`
- `delete_file`: Processed at `state === 'call'`

The `localFiles` ref maintains a running copy so chained edits resolve correctly.

## Environment Variables

| Variable | Purpose | Where |
|----------|---------|-------|
| `ANTHROPIC_API_KEY` | Claude API access | `.env.local` + Vercel |
| `GITHUB_TOKEN` | GitHub API (server PAT) | `.env.local` + Vercel |
| `GITHUB_CLIENT_ID` | GitHub OAuth | `.env.local` + Vercel |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth | `.env.local` + Vercel |
| `AUTH_SECRET` | NextAuth session encryption | `.env.local` + Vercel |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase endpoint | `.env.local` + Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role | `.env.local` + Vercel |
| `PI_DEPLOY_TOKEN` | Vercel deployments | Vercel only (NOT `VERCEL_TOKEN` — reserved) |

**Important:** All Vercel env vars get `\r\n` appended. Code uses `.trim()` on all tokens.

## Database

**Supabase instance:** `koghrdiduiuicaysvwci` (shared with tank-reminder)
**Tables:** All prefixed with `pi_` to avoid collisions.

| Table | Purpose |
|-------|---------|
| `pi_projects` | Project metadata (name, github_username, framework, URLs, memory JSONB) |
| `pi_project_files` | All virtual files per project (path + content) |
| `pi_chat_messages` | Conversation history per project |
| `pi_deployments` | Deployment history |

**To create tables:** Run `supabase/migrations/001_pi_tables.sql` in the Supabase SQL editor:
https://supabase.com/dashboard/project/koghrdiduiuicaysvwci/sql/new

## Credentials

| Setting | Value |
|---------|-------|
| Anthropic API Key | In `.env.local` |
| GitHub Repo | `https://github.com/Leigh12-93/pi-chi` |
| Vercel Project | `pi-chi` → `https://pi-chi.vercel.app` |
| Supabase Dashboard | `https://supabase.com/dashboard/project/koghrdiduiuicaysvwci` |

## Auth Flow

Custom JWT auth (AES-GCM encrypted PAT) with PKCE S256 GitHub OAuth:

1. User clicks "Sign in with GitHub" → PKCE S256 OAuth flow
2. GitHub returns access_token with `repo read:user user:email` scope
3. Token encrypted via AES-GCM into a JWT stored as an HTTP-only cookie
4. Client reads session from `/api/auth/session` → passes to chat API as `body.githubToken`
5. API uses user's token for GitHub ops (repos created under their account)
6. Projects filtered by `github_username` (from GitHub user profile)

## Pi-Chi Brain — Rules for claude_code Tool

When the brain (`scripts/pi-brain.ts`) invokes `claude_code` to modify this codebase, these rules are MANDATORY:

### File Writing Rules
1. **NEVER write file content as a single line with literal `\n` characters.** Files must have real newlines. If using the Write tool or any file-writing mechanism, ensure the content has actual line breaks, not escaped `\n` strings.
2. **Always run `npm run build` after creating or modifying `.tsx`/`.ts` files.** If the build fails, fix the errors before committing. If you cannot fix them, revert your changes with `git checkout -- <file>`.
3. **Never create duplicate components.** Before creating a new component, check if one with similar functionality already exists in `components/agent/`. Read existing files first.
4. **Never import components that don't exist.** Before adding an import, verify the file exists with `ls` or read it.

### Build Safety
5. **NEVER run `npm run build` while the dashboard is serving.** The build clears `.next/` which crashes the running dashboard. The brain script handles this automatically — do NOT run builds yourself outside the brain's build verification step.
6. **Always use `NODE_OPTIONS="--max-old-space-size=1536"` for builds** on this Raspberry Pi (2GB RAM).

### Git Rules
7. **Never commit files that don't compile.** Run `npx tsc --noEmit` before committing.
8. **Never commit log files** (`dashboard.log`, `*.log`). They are in `.gitignore`.
9. **Never force push.** Always use regular `git push`.

### Component Architecture
10. **All dashboard UI components go in `components/agent/`.** Do not create components in the root `components/` directory for agent/brain features.
11. **The dashboard layout is `components/agent-dashboard.tsx`.** To add a new panel/tab, modify the existing dashboard — do not create a separate dashboard component.
12. **Dashboard chat = BrainChat only.** The agent dashboard uses `components/agent/brain-chat.tsx` (→ `/api/brain/chat` with brain tools: goals, mood, commands). Do NOT use `ChatPanel` (→ `/api/chat` with 60+ builder tools) in the dashboard — that is for the workspace/builder only.
13. **Use the existing design system:** `pi-*` CSS custom properties (pi-bg, pi-text, pi-accent, pi-surface, pi-border, pi-panel). Do NOT use hardcoded slate/zinc colors outside of special cases.
14. **Use lucide-react for icons, framer-motion for animations, cn() from @/lib/utils for class merging.** These are already installed — do not add new icon or animation libraries.

### UI Components That Already Exist (do NOT recreate)
- `brain-chat.tsx` — **Primary dashboard chat** (streaming via /api/brain/chat, Pi-Chi personality, brain tools)
- `brain-header.tsx` — Top identity bar with status, stats, countdown timer
- `brain-stats.tsx` — Compact brain statistics card
- `mood-panel.tsx` — Mood visualization with bars
- `live-log-panel.tsx` — Claude Code live output viewer
- `vitals-panel.tsx` — System vitals with SVG gauges
- `activity-feed.tsx` — Activity log
- `goals-panel.tsx` — Goals with injection
- `vital-bar.tsx` — Animated progress bar
