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

## STANDING P1 — CheapSkip SMS Loop Test (do every FIX cycle until passing)

1. Send a realistic lead teaser via `gammu-send` to `0466783136`
2. Query AussieSMS Supabase (`unsqcfflbedqclgkuknq`) messages table — read the EXACT received text
3. Evaluate: does it read naturally? Would a real tradie reply YES? Is formatting clean?
4. Fix the SMS template in the code if it's not good enough
5. Simulate YES reply via CheapSkip inbound API with `from=0466783136`
6. Verify in CheapSkip Supabase (`pocoystpkrdmobplazhd`) that distribution processed correctly
7. Verify `/etc/gammu-smsdrc` has `RunOnReceive` wired to the inbound handler

**Test numbers ONLY — never real providers:**
- `0466783136` — AussieSMS gateway (full loop testing, check received in Supabase)
- `0481274420` — Leigh alerts only
