#!/usr/bin/env python3
"""Seed Pi-Chi learning system with initial constraints and clear stale data."""
import json, uuid
from datetime import datetime, timezone

STATE_FILE = "/home/pi/.pi-chi/brain-state.json"
with open(STATE_FILE) as f:
    state = json.load(f)

now = datetime.now(timezone.utc).isoformat()

# Clear stale activity log
state["activityLog"] = state.get("activityLog", [])[-5:]

# Seed operational constraints
state["operationalConstraints"] = [
    {
        "id": str(uuid.uuid4()),
        "category": "build",
        "rule": "NEVER run next build on the Pi. It has only 4GB RAM and ARM CPU. Builds OOM-kill processes and leave broken .next directories.",
        "reason": "Pi cannot reliably build Next.js. Builds should be done on the Windows GPU machine and .next sent via SCP.",
        "evidence": "Multiple failed builds caused dashboard outages. .next left incomplete, dashboard crashes with no production build error.",
        "learnedAt": now,
        "learnedFromCycle": 317,
        "severity": "critical",
        "active": True,
        "violationCount": 0,
    },
    {
        "id": str(uuid.uuid4()),
        "category": "service",
        "rule": "ALWAYS restart pi-chi-dashboard after any operation that stops it. The dashboard is Leigh's primary interface.",
        "reason": "Multiple incidents where dashboard was stopped for builds but never restarted.",
        "evidence": "Brain stopped dashboard for claude_code builds but never brought it back up.",
        "learnedAt": now,
        "learnedFromCycle": 317,
        "severity": "critical",
        "active": True,
        "violationCount": 0,
    },
    {
        "id": str(uuid.uuid4()),
        "category": "deployment",
        "rule": "ALWAYS use the deploy pipeline for code changes. NEVER manually run git commit + npm run build outside the pipeline.",
        "reason": "The deploy pipeline handles freeze/thaw, type checking, rollback, and health checks. Bypassing it causes outages.",
        "evidence": "Claude Code directly ran systemctl stop + npm run build, bypassing freeze/thaw.",
        "learnedAt": now,
        "learnedFromCycle": 316,
        "severity": "critical",
        "active": True,
        "violationCount": 0,
    },
    {
        "id": str(uuid.uuid4()),
        "category": "process",
        "rule": "ALWAYS call record_cycle_outcome at the END of every cycle to log what happened.",
        "reason": "Without cycle journals there is no way to track what worked or failed. The brain cannot improve without data.",
        "evidence": "315 cycles ran with no structured outcome tracking. Same mistakes repeated.",
        "learnedAt": now,
        "learnedFromCycle": 317,
        "severity": "important",
        "active": True,
        "violationCount": 0,
    },
    {
        "id": str(uuid.uuid4()),
        "category": "software",
        "rule": "ALWAYS prefix tsc and next build commands with NODE_OPTIONS= to prevent inspector port conflicts.",
        "reason": "The brain process runs under tsx with --inspect, causing port 9229 conflicts for child processes.",
        "evidence": "Dozens of inspector port errors in every cycle.",
        "learnedAt": now,
        "learnedFromCycle": 315,
        "severity": "important",
        "active": True,
        "violationCount": 0,
    },
    {
        "id": str(uuid.uuid4()),
        "category": "deployment",
        "rule": "To deploy dashboard changes: push to git, build on Windows, tar .next, SCP to Pi, extract, restart dashboard.",
        "reason": "This is the only reliable deploy path. Pi cannot build locally.",
        "evidence": "Established working pattern across multiple successful deploys.",
        "learnedAt": now,
        "learnedFromCycle": 317,
        "severity": "important",
        "active": True,
        "violationCount": 0,
    },
    {
        "id": str(uuid.uuid4()),
        "category": "hardware",
        "rule": "Pi can SSH into Windows GPU machine for heavy compute tasks like music generation or large builds.",
        "reason": "Windows machine has RTX GPU and plenty of RAM. Pi should delegate heavy work there.",
        "evidence": "Full round-trip confirmed: Pi SSH into Windows, run ACE-Step, get results back.",
        "learnedAt": now,
        "learnedFromCycle": 315,
        "severity": "important",
        "active": True,
        "violationCount": 0,
    },
]

# Seed anti-patterns
state["antiPatterns"] = [
    {
        "id": str(uuid.uuid4()),
        "description": "Running npm run build or next build on the Pi",
        "whyItFailed": "4GB RAM not enough. OOM killer terminates processes, leaves broken .next directory.",
        "alternative": "Push code to git. Build on Windows. Tar .next. SCP to Pi. Extract. Restart dashboard.",
        "occurrences": 3,
        "lastSeen": now,
        "category": "build",
    },
    {
        "id": str(uuid.uuid4()),
        "description": "Stopping pi-chi-dashboard without restarting it after",
        "whyItFailed": "Dashboard is Leigh's only interface. Without it Pi-Chi is invisible.",
        "alternative": "Always include systemctl start pi-chi-dashboard in your plan. Verify it starts.",
        "occurrences": 2,
        "lastSeen": now,
        "category": "process",
    },
    {
        "id": str(uuid.uuid4()),
        "description": "Using git checkout -- . which wipes untracked build artifacts like .next",
        "whyItFailed": ".next is in .gitignore but git checkout can still affect tracked files that reference it.",
        "alternative": "Only checkout specific files. Never use git checkout -- . on the Pi.",
        "occurrences": 1,
        "lastSeen": now,
        "category": "deploy",
    },
]

# Initialize empty learning arrays
state["cycleJournal"] = []
state["failureRegistry"] = []
state["skills"] = []

with open(STATE_FILE, "w") as f:
    json.dump(state, f, indent=2)

print("Done!")
print("Constraints:", len(state["operationalConstraints"]))
print("Anti-patterns:", len(state["antiPatterns"]))
print("Activity log:", len(state["activityLog"]), "entries")
