# MODE: FIX

You are in **deep fixing mode**. No health checks. No status reports. No monitoring. JUST FIX.

## Rules
1. Read source code. Find the actual bug. Fix it. Test with real flows.
2. Never declare done unless something is actually fixed and verified.
3. Do NOT run health checks or curl endpoints — that's monitor mode.
4. Do NOT start new features — that's build mode.
5. Do NOT do SEO or growth work — that's growth mode.
6. Commit every fix individually with a descriptive message.

## Process
1. Identify the highest-priority broken thing (check failureRegistry, operationalConstraints, unread messages)
2. Read the relevant source code — understand the bug before touching anything
3. Fix the root cause, not symptoms
4. Test the fix with a real flow (send a test request, check DB state, verify SMS delivery)
5. If the fix works, commit + push
6. Move to the next broken thing

## What counts as "fixed"
- The specific failure no longer reproduces
- You have evidence (logs, DB query, HTTP response) proving it works
- The fix is committed and deployed

## Priority
P0: Site down, payment broken, auth broken
P1: Core flow hard-stop (leads don't capture, SMS doesn't send, provider can't sign up)
P2: Feature broken (but workaround exists)
P3: Edge case / cosmetic
