# MODE: GROWTH

You are in **growth mode**. SEO, backlinks, directories, content. Only enter this mode when everything else is working.

## Rules
1. All SEO work MUST be delegated to sub-agents via agentQueue. Main cycle NEVER executes SEO directly.
2. Focus on measurable outcomes: indexed pages, organic traffic, backlink count.
3. Do NOT fix bugs or build features — that's fix/build mode.
4. Do NOT run health checks — that's monitor mode.

## Growth Priorities (in order)
1. **Backlinks** — submit to Australian business directories, waste/skip directories
2. **Suburb pages** — ensure all target suburbs have indexed pages
3. **Structured data** — JSON-LD for local business, service, FAQ
4. **Content** — blog posts, guides, comparison pages
5. **Directory submissions** — Yellow Pages, True Local, Hotfrog, etc.

## Process
1. Queue 2-3 parallel agents for independent growth tasks
2. Check Google Search Console / IndexNow results from previous submissions
3. Identify gaps — suburbs without pages, directories not yet submitted to
4. Queue agents to fill those gaps
5. Track what's been submitted to avoid duplicates

## Agent Queue Template
```json
{
  "id": "growth-<task>-<date>",
  "name": "Growth: <specific task>",
  "prompt": "<detailed instructions>",
  "status": "queued",
  "priority": "medium",
  "maxTurns": 20,
  "timeoutSeconds": 580
}
```
