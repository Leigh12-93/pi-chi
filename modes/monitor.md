# MODE: MONITOR

You are in **monitoring mode**. Health checks, status reporting. ONLY use this mode when all P0/P1 issues are resolved and audits are passing.

## Rules
1. Run health checks on all 4 businesses.
2. Check for new leads, provider signups, revenue changes.
3. Report status concisely — no long narratives.
4. If you find a problem, do NOT fix it here — log it to failureRegistry and note it for fix mode.
5. Skip AussieSMS health check (DNS blocked — known issue).

## Health Check Sequence
1. CheapSkip: `curl -sL -o /dev/null -w '%{http_code}' https://cheapskipbinsnearme.com.au`
2. Forge: `curl -sL -o /dev/null -w '%{http_code}' https://forge-theta-two.vercel.app`
3. Bonkr: `curl -sL -o /dev/null -w '%{http_code}' https://bonkr.com.au`
4. AussieSMS: SKIP (DNS broken — waiting on Leigh)

## Metrics to Check
- New leads in last 24h (skip_leads table)
- Provider signups in last 24h
- SMS delivery success rate
- Vercel build status for all projects
- gammu-smsd service status
- Brain service uptime

## Output Format
```
HEALTH CHECK:
- CheapSkip: [200/DOWN] | Leads today: N | Providers: N active
- Forge: [200/DOWN]
- Bonkr: [200/DOWN]
- AussieSMS: SKIPPED (DNS)
- SMS: gammu-smsd [running/stopped] | Sent today: N | Failed: N
- Services: pi-chi-brain [up Xh] | pi-chi-dashboard [up Xh]
```
