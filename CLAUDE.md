# CLAUDE.md — Forge

AI-powered React website builder. v0/Bolt.ai clone using Claude API.
Architecture inspired by Brick CLI's agentic patterns.

## Quick Reference

```bash
npm run dev          # localhost:3333
npm run build        # Production build
git push             # Deploy via Vercel (auto-deploys on push)
npx vercel --prod    # Manual production deploy
```

## Architecture

**Stack:** Next.js 15 | Tailwind v4 | Vercel AI SDK | Claude Sonnet 4 | Monaco Editor

**Cloud-only** — no local filesystem. All files live in browser memory (VirtualFS).
Client sends file state with each request. Tool results carry updates back.

```
app/
  page.tsx                 Main page — virtual file state, project picker → workspace
  layout.tsx               Root layout (dark theme, Toaster)
  globals.css              Tailwind v4 + custom forge theme tokens
  api/chat/route.ts        AI endpoint — VirtualFS, 14 tools, GitHub/Vercel APIs
components/
  workspace.tsx            3-panel resizable layout, auto-selects first file
  chat-panel.tsx           Chat — useChat, live tool processing, step counter
  code-editor.tsx          Monaco editor with Ctrl+S
  file-tree.tsx            Recursive expand/collapse
  preview-panel.tsx        iframe preview (JSX→HTML + Tailwind CDN)
  project-picker.tsx       Project name input + start
  header.tsx               Top bar
lib/
  utils.ts                 cn(), formatRelative(), getFileIcon(), getLanguageFromPath()
  types.ts                 Project, FileNode, FileChange, ChatSession types
```

## AI Tools (14)

| Category | Tools |
|----------|-------|
| Planning | `think`, `suggest_improvement` |
| File ops | `write_file`, `read_file`, `edit_file`, `delete_file`, `list_files`, `search_files`, `rename_file`, `get_all_files` |
| Project | `create_project` (nextjs/vite-react/static) |
| GitHub | `github_create_repo`, `github_push_update` |
| Deploy | `deploy_to_vercel` |

## Token Optimization (Brick-inspired)

1. **Lean tool results**: `write_file` and `edit_file` return `{ok, path, lines}` — no content echo.
   This prevents file contents from accumulating in conversation history across multi-step execution.
2. **Client extracts from args**: `extractFileUpdates()` reads content from tool call `args`
   (not `result`). For `write_file`, content is in `args.content`. For `edit_file`, applies
   `old_string→new_string` locally against current file state.
3. **File manifest**: System prompt includes path + lines + size per file. No content in prompt.
   AI must use `read_file` when it needs actual content.
4. **get_all_files returns manifest only**: Path/lines/size, not content.

## Live Streaming (Brick-inspired)

Tool invocations are processed **individually** as they arrive, not batched:
- `write_file`: Processed at `state === 'call'` — instant file tree + preview update
- `edit_file`, `create_project`, `rename_file`: Processed at `state === 'result'`
- `delete_file`: Processed at `state === 'call'`

The `localFiles` ref maintains a running copy so chained edits resolve correctly.

## Agentic Execution (Brick-inspired)

- `think` tool: AI plans complex tasks before executing (file list + approach)
- `suggest_improvement` tool: AI self-diagnoses limitations, outputs instructions for Claude Code
- `maxSteps: 25`: Supports long multi-step execution chains
- System prompt enforces ACT-FIRST pattern (no narration, just build)

## Self-Improvement Protocol

When the AI encounters a limitation, it calls `suggest_improvement` with:
- `issue`: What's broken/missing
- `suggestion`: Specific code change needed
- `file`: Which source file to modify
- `priority`: high/medium/low

These render as yellow cards in the chat. Copy the suggestion and implement it in this terminal.

## Environment Variables

| Variable | Purpose | Where |
|----------|---------|-------|
| `ANTHROPIC_API_KEY` | Claude API access | `.env.local` + Vercel |
| `GITHUB_TOKEN` | GitHub repo creation/push | `.env.local` + Vercel |
| `FORGE_DEPLOY_TOKEN` | Vercel deployments | Vercel only (NOT `VERCEL_TOKEN` — that name is reserved) |
| `VERCEL_TEAM_ID` | Vercel team scope | Vercel only (optional) |

**Important:** All Vercel env vars get `\r\n` appended. Code uses `.trim()` on all tokens.

## Credentials

| Setting | Value |
|---------|-------|
| Anthropic API Key | In `.env.local` |
| GitHub Repo | `https://github.com/Leigh12-93/forge` |
| Vercel Project | `forge` → `https://forge-six-chi.vercel.app` |
