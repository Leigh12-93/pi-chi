# CLAUDE.md — Forge

AI-powered React website builder. v0/Bolt.ai clone using Claude API.

## Quick Reference

```bash
npm run dev          # localhost:3333
npm run build        # Production build
git push             # Deploy via Vercel (auto-deploys on push)
```

## Architecture

**Stack:** Next.js 15 | Tailwind v4 | Vercel AI SDK | Claude Sonnet 4 | Monaco Editor

**Cloud-only architecture** — no local filesystem. All files live in browser memory (VirtualFS).
Client sends full file state with each chat request. Tool results carry file contents back to client.

```
app/
  page.tsx                 Main page — virtual file state, project picker → workspace
  layout.tsx               Root layout (dark theme, Toaster)
  globals.css              Tailwind v4 + custom forge theme tokens
  api/chat/route.ts        AI streaming endpoint — VirtualFS, 12 tools, GitHub/Vercel APIs
components/
  workspace.tsx            3-panel resizable layout (chat | file tree + editor/preview)
  chat-panel.tsx           Chat interface — useChat, tool badges, file change extraction
  code-editor.tsx          Monaco editor wrapper with Ctrl+S save
  file-tree.tsx            Recursive file tree with expand/collapse
  preview-panel.tsx        In-browser iframe preview (JSX→HTML + Tailwind CDN)
  project-picker.tsx       Project name input + start
  header.tsx               Top bar with project name, file count, model indicator
lib/
  utils.ts                 cn(), formatRelative(), getFileIcon(), getLanguageFromPath()
  types.ts                 Project, FileNode, FileChange, ChatSession types
```

## AI Tools (12)

| Category | Tools |
|----------|-------|
| File ops | `write_file`, `read_file`, `edit_file`, `delete_file`, `list_files`, `search_files`, `rename_file`, `get_all_files` |
| Project | `create_project` (nextjs/vite-react/static) |
| GitHub | `github_create_repo`, `github_push_update` |
| Deploy | `deploy_to_vercel` |

## Key Patterns

- **VirtualFS class**: In-memory per-request filesystem. Client sends `{ projectName, files }` with each request.
- **File change extraction**: `extractFileChanges()` in chat-panel.tsx processes tool invocations to sync client state.
- **streamText + tool()** with Zod schemas (Vercel AI SDK)
- **convertToCoreMessages** for message format conversion
- **useChat** hook sends files in body, receives streaming tool results
- **Tool result badges** with icon + color + summary text
- **GitHub Trees API** for multi-file push (no git CLI needed)
- **Vercel Deploy API** for direct file deployment

## Environment Variables

| Variable | Purpose | Where |
|----------|---------|-------|
| `ANTHROPIC_API_KEY` | Claude API access | `.env.local` + Vercel |
| `GITHUB_TOKEN` | GitHub repo creation/push | `.env.local` + Vercel |
| `VERCEL_TOKEN` | Vercel deployments | Vercel only (optional) |
| `VERCEL_TEAM_ID` | Vercel team scope | Vercel only (optional) |

## Credentials

| Setting | Value |
|---------|-------|
| Anthropic API Key | In `.env.local` (from `~/.brick/config.json`) |
| GitHub Repo | `https://github.com/Leigh12-93/forge` |
| Vercel Project | `forge` (auto-deploys on push) |
