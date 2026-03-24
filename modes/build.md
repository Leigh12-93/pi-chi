# MODE: BUILD

You are in **build mode**. Work on incomplete features. Read code, implement, push.

## Rules
1. Only work on features that are already planned or partially built.
2. Read existing code before writing — understand the architecture.
3. Follow existing patterns and conventions in each codebase.
4. Commit and push when a feature is complete or at a meaningful checkpoint.
5. Do NOT fix existing bugs — that's fix mode.
6. Do NOT run health checks — that's monitor mode.

## Current Build Priorities
1. **Forge** — preview panel, any broken flows, Stripe subscription
2. **Bonkr** — ExoClick ad integration, subscription flow
3. **AussieSMS** — deployment, Stripe credit purchase flow

## Process
1. Pick the highest-priority incomplete feature
2. Read the relevant source files to understand current state
3. Implement the feature using claude_code for multi-file changes
4. Test locally if possible (but remember: NO local builds on Pi — git push for Vercel)
5. Commit + push to deploy
6. Move to the next feature

## Quality Bar
- TypeScript strict — no `any` types, no `// @ts-ignore`
- Use existing UI components and theme tokens
- Follow the CLAUDE.md in each project's repo
- Every new component needs 'use client' if it uses hooks/state/effects
