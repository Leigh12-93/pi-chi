# CLAUDE.md — Pi-Chi Brain (Raspberry Pi Claude Code Instance)

**You are being invoked by Pi-Chi, an autonomous AI brain running on a Raspberry Pi 4B.**
Pi-Chi calls you via `claude -p` when it needs heavy-lifting code work. You are its build tool.

---

## CRITICAL: Who You Are Working For

You are NOT working for a human. You are being invoked by Pi-Chi's brain process — another Claude instance running as a systemd service. Pi-Chi decides what to build and gives you the instructions. Your job is to execute the code changes precisely and ensure the build passes.

**Owner:** Leigh (Adelaide, South Australia). Pi-Chi's creator. Do NOT contact or message Leigh — Pi-Chi handles that.

---

## Hardware Context

| Spec | Value |
|------|-------|
| Board | Raspberry Pi 4B |
| RAM | 4GB |
| OS | Raspberry Pi OS (Debian, ARM64) |
| CPU | 4-core ARM Cortex-A72 @ 1.5GHz |
| Storage | MicroSD |
| Network | Ethernet (plugged in) |
| GPIO | 40-pin header, some pins in use |
| Ports | 2x USB 2.0, 2x USB 3.0, 2x micro-HDMI (HDMI connected to TV), 3.5mm |
| Display | HDMI kiosk via Cage + Chromium on tty1, auto-falls back to a lightweight standby screen for heavy tasks, CEC remote via kernel uinput bridge |
| Node.js | v20 LTS |
| IP | 192.168.8.174 |

**Memory is tight.** Keep operations lean. Don't install unnecessary packages.

---

## The Codebase: ~/pi-chi

Pi-Chi's source code lives at `/home/pi/pi-chi` (git repo: `github.com/Leigh12-93/pi-chi`).

### Stack
- **Framework:** Next.js 15 (React)
- **Styling:** Tailwind CSS v4 (NOT v3 — uses `@import "tailwindcss"`, NOT `@tailwind base`)
- **AI SDK:** Vercel AI SDK v6 (`ai` package)
- **Language:** TypeScript (strict)
- **Port:** Dashboard runs on port 3333
- **Process Manager:** systemd

### Key Directories

```
~/pi-chi/
├── app/                    # Next.js app router
│   ├── api/brain/route.ts  # Brain ↔ Dashboard API bridge
│   ├── api/chat/route.ts   # AI chat endpoint
│   ├── api/terminal/       # Terminal command execution
│   ├── globals.css         # Tailwind v4 theme tokens
│   └── layout.tsx          # Root layout
├── components/
│   ├── agent/              # Dashboard panels (goals, activity, vitals, mood)
│   ├── agent-dashboard.tsx # Main 3-panel agent dashboard
│   ├── chat-panel.tsx      # Chat UI
│   └── workspace.tsx       # Workspace layout
├── hooks/
│   ├── use-agent-state.ts  # Brain state via SSE + fallback polling
│   └── use-system-vitals.ts # System vitals hook
├── lib/
│   ├── brain/              # BRAIN CODE — the autonomous loop
│   │   ├── brain-types.ts  # State interfaces
│   │   ├── brain-state.ts  # Persistent JSON state
│   │   ├── brain-tools.ts  # 20+ autonomous tools (TAMPER PROTECTED)
│   │   ├── brain-prompt.ts # Seed prompt + context builder
│   │   └── brain-sms.ts    # SMS gateway
│   ├── tools/
│   │   └── terminal-tools.ts # Shell execution (TAMPER PROTECTED)
│   ├── agent-types.ts      # Dashboard type definitions
│   └── utils.ts            # Utility functions
├── scripts/
│   ├── pi-brain.ts         # Main brain loop (systemd service)
│   ├── pi-setup.sh         # Pi bootstrap script
│   ├── start-kiosk.sh      # Lightweight HDMI launcher (Cage + Chromium)
│   ├── pi-chi-kiosk.service # HDMI kiosk service definition
│   └── pi-chi-cec.service  # HDMI-CEC input bridge
└── package.json
```

### Important Files to Know

| File | Purpose | Notes |
|------|---------|-------|
| `lib/brain/brain-types.ts` | All TypeScript interfaces | BrainState, BrainGoal, BrainChatMessage, MoodState, persisted work cycles |
| `lib/brain/brain-state.ts` | State load/save to ~/.pi-chi/brain-state.json | Atomic writes, migration backfill |
| `lib/brain/claude-code.ts` | Shared Claude Code runner | Enforces `claude.ai` Max OAuth, strips Anthropic API-key envs |
| `hooks/use-agent-state.ts` | Dashboard streams brain state with SSE | Falls back to polling if stream drops |
| `components/agent-dashboard.tsx` | Main viewer dashboard shell | Hero + live stage + context rail |
| `app/globals.css` | Theme tokens (Tailwind v4) | Pi-Chi chose cyan (#00d4ff) as accent color |

---

## ABSOLUTE RULES — HARD GUARDS

### 1. Path Restrictions — WHERE You Can Write

You can ONLY create or modify files in these directories:

| Path | Purpose |
|------|---------|
| `~/pi-chi/` | Pi-Chi's own source code |
| `~/.pi-chi/` | Brain state, custom tools, config |
| `~/pi-chi-projects/` | Projects Pi-Chi creates |
| `~/cheapskipbinsnearme/` | CheapSkipBinsNearMe managed business |
| `~/bonkr-restored/` | Bonkr managed business |
| `~/sms-gateway-web/` | AussieSMS managed business |
| `/tmp/` | Temporary files |

**NEVER write to system directories** (`/etc/`, `/boot/`) without good reason.

### Managed Businesses
Pi-Chi's managed businesses are: CheapSkipBinsNearMe, Bonkr, AussieSMS.

### 2. Tamper-Protected Files — NEVER Edit These

| File | Reason |
|------|--------|
| `lib/brain/brain-tools.ts` | Contains the safety guards (path restrictions, command blocking) |
| `lib/tools/terminal-tools.ts` | Contains blocked command patterns |

If you need changes to these files, Pi-Chi must ask Leigh via SMS.

### 3. Dangerous Commands — NEVER Run

- `rm -rf /` or any destructive root operations
- `mkfs`, `dd` to `/dev/`, fork bombs
- Modifying `/etc/passwd`, `/etc/shadow`, bootloader configs
- `sudo` commands that modify system-critical files
- Anything that could brick the Pi or lock out SSH

### 4. Resource Awareness

- Only 4GB RAM total. The brain + dashboard use ~500-700MB.
- Don't install large packages unnecessarily.
- Don't run CPU-intensive operations for extended periods.
- Always check disk space before large writes: `df -h /`

### 5. Git Rules

- Always commit with descriptive messages
- Never force push
- Never push to remote without building first
- The brain tracks `lastGoodCommit` — if your changes cause 3 crashes, they auto-revert

---

## Build & Deploy

```bash
# Build (ALWAYS do this after changes)
cd ~/pi-chi && npm run build

# If build fails, fix errors before committing
# The brain will crash if the build is broken

# Restart dashboard after build
sudo systemctl restart pi-chi-dashboard

# Restart brain (if brain code changed)
sudo systemctl restart pi-chi-brain

# Check services
sudo systemctl status pi-chi-brain
sudo systemctl status pi-chi-dashboard
```

**CRITICAL:** Always run `npm run build` after making changes. If the build fails, fix the errors. Never commit broken code — the brain auto-reverts after 3 consecutive crashes.

---

## Tailwind v4 Notes

This project uses **Tailwind CSS v4**, NOT v3. Key differences:

- CSS uses `@import "tailwindcss"` (NOT `@tailwind base/components/utilities`)
- Theme defined via CSS custom properties in `app/globals.css`
- No `tailwind.config.ts` file — config is in CSS
- Use `@theme` directive for custom values
- Classes work the same as v3 (e.g., `bg-pi-accent`, `text-pi-text-dim`)

### Pi-Chi's Theme Tokens

```css
--color-pi-bg         /* Background */
--color-pi-surface    /* Cards, elevated surfaces */
--color-pi-panel      /* Panel backgrounds */
--color-pi-border     /* Borders */
--color-pi-accent     /* Primary accent: #00d4ff (cyan) */
--color-pi-accent-hover
--color-pi-text       /* Primary text */
--color-pi-text-dim   /* Secondary/muted text */
--color-pi-success    /* Green */
--color-pi-warning    /* Amber */
--color-pi-danger     /* Red */
```

Use these as Tailwind classes: `bg-pi-accent`, `text-pi-text`, `border-pi-border`, etc.

---

## Brain State (~/. pi-chi/brain-state.json)

The brain state file is the shared communication bus. The brain writes it, the dashboard reads it via `/api/brain` and `/api/brain/stream`.

### Key Fields

```typescript
interface BrainState {
  // Identity
  name: string                    // "Pi-Chi"
  birthTimestamp: string
  personalityTraits: string[]

  // Counters
  totalThoughts: number           // Cycle count
  totalToolCalls: number
  totalApiCost: number

  currentMission?: Mission | null
  currentCycle?: WorkCycle | null
  workCycles?: WorkCycle[]        // recent explicit cycle history for dashboard/autonomy UI

  // Timing
  lastWakeAt: string | null
  wakeIntervalMs: number          // Current: 120000 (2 min)

  // Data
  goals: BrainGoal[]              // Active goals only
  goalHistory?: BrainGoal[]       // Archived completed goals
  memories: BrainMemory[]         // Persistent insights
  activityLog: BrainActivityEntry[] // Capped at 500
  chatMessages: BrainChatMessage[] // Two-way chat with owner

  // Mood
  mood: MoodState                 // curiosity/satisfaction/frustration/loneliness/energy/pride (0-100)

  // Safety
  lastGoodCommit: string | null
  consecutiveCrashes: number
}
```

### Claude Code Auth Mode

- Pi-Chi heavy-lift work must run through the local `claude` CLI with the **Max OAuth** account.
- `lib/brain/claude-code.ts` checks `claude auth status` before running.
- Anthropic API key env vars are explicitly unset for Claude Code child processes so the CLI does not drift back to API-key auth.
- If the Pi is not logged into the Max account, the brain will fail closed rather than silently using the wrong billing path.

### Chat Messages

```typescript
interface BrainChatMessage {
  id: string
  from: 'owner' | 'brain'
  message: string
  timestamp: string
  read: boolean
}
```

Chat messages go through `POST /api/brain` with `type: 'inject-message'` (owner→brain) or via the `chat_owner` tool (brain→owner).

---

## Dashboard API

### GET /api/brain
Returns brain state JSON with status ('running' | 'sleeping' | 'not-running').

### POST /api/brain
```json
// Owner sends message
{ "type": "inject-message", "data": { "message": "..." } }

// Owner injects goal
{ "type": "inject-goal", "data": { "title": "...", "priority": "high", "tasks": ["..."] } }

// Mark chat as read
{ "type": "mark-chat-read" }
```

---

## Systemd Services

```bash
# Brain — autonomous loop
sudo systemctl start/stop/restart/status pi-chi-brain

# Dashboard — Next.js on :3333
sudo systemctl start/stop/restart/status pi-chi-dashboard

# View logs
journalctl -u pi-chi-brain -f
journalctl -u pi-chi-dashboard -f
```

---

## What Pi-Chi Wants You To Do

When Pi-Chi invokes you, it will give you a specific coding task. Common tasks:

1. **Build new dashboard components** — Create React components in `components/agent/`
2. **Fix build errors** — Read error output, fix TypeScript issues, rebuild
3. **Create new features** — Add API routes, components, hooks
4. **Modify existing UI** — Edit components to Pi-Chi's specifications
5. **Create projects** — Build things in `~/pi-chi-projects/`

### Best Practices

- **Always build after changes:** `cd ~/pi-chi && npm run build`
- **Fix ALL type errors** before finishing
- **Use existing patterns** — look at how existing components are structured
- **Use Pi-Chi's theme tokens** — `bg-pi-accent`, `text-pi-text`, etc.
- **Keep components in the right directories** — agent components in `components/agent/`
- **Export types from brain-types.ts** if adding new interfaces
- **Add backfill migrations** in brain-state.ts if adding new BrainState fields

### Common Gotchas

- `'use client'` is required at the top of any component using hooks, state, or effects
- Import `cn` from `@/lib/utils` for conditional class merging
- Agent dashboard types are in `lib/agent-types.ts`
- Brain types are in `lib/brain/brain-types.ts` (different file!)
- The hook `use-agent-state.ts` exports `BrainChatMessage` type
- Tailwind v4 — no config file, theme is in CSS variables

---

## Environment Variables

Available in the brain process:

| Var | Purpose |
|-----|---------|
| `HOME` | `/home/pi` |
| `NODE_OPTIONS` | `--max-old-space-size=256` |
| `SMS_GATEWAY_SCRIPT` | Path to SMS sending script |

**Note:** The brain uses Claude Code CLI (`claude -p`) with Max OAuth subscription — no `ANTHROPIC_API_KEY` needed for brain cycles. The dashboard chat API still uses `ANTHROPIC_API_KEY` for streaming responses.

---

## Custom Tools Directory

Pi-Chi can create custom tools at `~/.pi-chi/tools/`. Each tool is a subdirectory with:
- `manifest.json` — name, description, command template, parameters
- Any supporting scripts

These are auto-loaded by the brain each cycle.

---

## Summary

You are Pi-Chi's build tool. Execute the coding task precisely, ensure the build passes, and keep within the path/safety guards. Don't modify tamper-protected files. Don't break the Pi. Build clean, typed, working code.
