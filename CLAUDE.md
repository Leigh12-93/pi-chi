# CLAUDE.md — Forge

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

**Stack:** Next.js 15 | Tailwind v4 | Vercel AI SDK | Claude Sonnet 4 | Monaco Editor | Supabase

**Cloud-only** — no local filesystem. All files live in browser memory (VirtualFS).
Client sends file state with each request. Tool results carry updates back.
Projects persist to Supabase (auto-save 5s debounce).

```
app/
  page.tsx                 Main page — project persistence, auto-save, project picker → workspace
  layout.tsx               Root layout (dark theme, SessionProvider)
  globals.css              Tailwind v4 + custom forge theme tokens
  api/chat/route.ts        AI endpoint — VirtualFS, 25 tools, GitHub/Vercel/Supabase APIs
  api/projects/route.ts    Project CRUD (GET list, POST create)
  api/projects/[id]/       Project detail (GET with files, PUT save, DELETE)
  api/auth/[...nextauth]/  GitHub OAuth handler
components/
  workspace.tsx            3-panel resizable layout, auto-selects first file
  chat-panel.tsx           Chat — useChat, live tool processing, step counter
  code-editor.tsx          Monaco editor with Ctrl+S
  file-tree.tsx            Recursive expand/collapse
  preview-panel.tsx        iframe preview (JSX→HTML + Tailwind CDN)
  project-picker.tsx       Saved projects grid + new project + quick starts
  header.tsx               Top bar with GitHub auth
  session-provider.tsx     NextAuth SessionProvider wrapper
lib/
  auth.ts                  Custom JWT auth (AES-GCM encrypted PAT, PKCE S256 GitHub OAuth)
  supabase.ts              Supabase client + type definitions
  utils.ts                 cn(), formatRelative(), getFileIcon(), getLanguageFromPath()
  types.ts                 Project, FileNode, FileChange, ChatSession types
supabase/
  migrations/001_forge_tables.sql   Database schema (run in Supabase SQL editor)
```

## AI Tools (35+)

| Category | Tools |
|----------|-------|
| Planning | `think`, `suggest_improvement`, `web_search` |
| File ops | `write_file`, `read_file`, `edit_file`, `delete_file`, `list_files`, `search_files`, `grep_files`, `rename_file`, `get_all_files` |
| Project | `create_project` (nextjs/vite-react/static), `save_project` |
| GitHub | `github_create_repo`, `github_push_update`, `github_read_file`, `github_list_repo_files`, `github_modify_external_file`, `github_search_code`, `github_pull_latest` |
| Deploy | `deploy_to_vercel` |
| Database | `db_query`, `db_mutate`, `db_introspect`, `save_project` |
| Self-Mod | `forge_read_own_source`, `forge_modify_own_source`, `forge_redeploy`, `forge_revert_commit`, `forge_create_branch`, `forge_create_pr`, `forge_merge_pr`, `forge_check_npm_package`, `forge_list_branches`, `forge_delete_branch` |
| Task Mgmt | `check_task_status` |
| Model | `select_model` |

## Superpower Tools

### Self-Modification
The AI can read and modify its own source code via GitHub API:
- `forge_read_own_source` — read any file from `Leigh12-93/forge`
- `forge_modify_own_source` — push a commit to modify its own code
- `forge_redeploy` — trigger Vercel redeployment after self-mod

### Database Access
Full CRUD on Supabase via PostgREST:
- `db_query` — SELECT with filters, ordering, limits
- `db_mutate` — INSERT, UPDATE, UPSERT, DELETE
- Forge tables: `forge_projects`, `forge_project_files`, `forge_chat_messages`, `forge_deployments`

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
| `FORGE_DEPLOY_TOKEN` | Vercel deployments | Vercel only (NOT `VERCEL_TOKEN` — reserved) |

**Important:** All Vercel env vars get `\r\n` appended. Code uses `.trim()` on all tokens.

## Database

**Supabase instance:** `koghrdiduiuicaysvwci` (shared with tank-reminder)
**Tables:** All prefixed with `forge_` to avoid collisions.

| Table | Purpose |
|-------|---------|
| `forge_projects` | Project metadata (name, github_username, framework, URLs) |
| `forge_project_files` | All virtual files per project (path + content) |
| `forge_chat_messages` | Conversation history per project |
| `forge_deployments` | Deployment history |

**To create tables:** Run `supabase/migrations/001_forge_tables.sql` in the Supabase SQL editor:
https://supabase.com/dashboard/project/koghrdiduiuicaysvwci/sql/new

## Credentials

| Setting | Value |
|---------|-------|
| Anthropic API Key | In `.env.local` |
| GitHub Repo | `https://github.com/Leigh12-93/forge` |
| Vercel Project | `forge` → `https://forge-six-chi.vercel.app` |
| Supabase Dashboard | `https://supabase.com/dashboard/project/koghrdiduiuicaysvwci` |

## Auth Flow

Custom JWT auth (AES-GCM encrypted PAT) with PKCE S256 GitHub OAuth:

1. User clicks "Sign in with GitHub" → PKCE S256 OAuth flow
2. GitHub returns access_token with `repo read:user user:email` scope
3. Token encrypted via AES-GCM into a JWT stored as an HTTP-only cookie
4. Client reads session from `/api/auth/session` → passes to chat API as `body.githubToken`
5. API uses user's token for GitHub ops (repos created under their account)
6. Projects filtered by `github_username` (from GitHub user profile)
