#!/usr/bin/env python3
"""Reset Pi-Chi brain goals — focus on UI improvements and bug fixing."""
import json
import uuid
from datetime import datetime

STATE_FILE = "/home/pi/.pi-chi/brain-state.json"

with open(STATE_FILE) as f:
    state = json.load(f)

now = datetime.utcnow().isoformat() + "Z"

# Archive completed/done goals to goalHistory
if "goalHistory" not in state:
    state["goalHistory"] = []

new_goals = []
for g in state["goals"]:
    if g["status"] in ("completed", "done"):
        state["goalHistory"].append(g)
    elif "FIX ALL CODEBASE BLOCKERS" in g["title"]:
        # Remove duplicate blocker goals
        state["goalHistory"].append(g)
    else:
        new_goals.append(g)

# Set new focused goals
state["goals"] = [
    {
        "id": str(uuid.uuid4()),
        "title": "Surgical UI improvements — make the dashboard better for Pi-Chi and Leigh",
        "status": "active",
        "priority": "high",
        "horizon": "short",
        "reasoning": "The dashboard is Pi-Chi's face. Make surgical, focused improvements that help both Pi-Chi operate more effectively and Leigh monitor/interact more easily. One improvement per cycle. Test before deploying.",
        "tasks": [
            {"id": str(uuid.uuid4()), "title": "Audit dashboard for UX pain points — broken layouts, missing data, confusing UI", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Fix the most impactful UX issue found in the audit", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Improve the brain chat panel — better message rendering, timestamps, scroll behavior", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Add visual indicators for brain cycle status and health on the main dashboard", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Improve mobile/responsive layout if applicable", "status": "pending"},
        ],
        "createdAt": now,
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Find and fix bugs in own codebase",
        "status": "active",
        "priority": "high",
        "horizon": "short",
        "reasoning": "Before building new features, audit the existing codebase for bugs, type errors, dead code, and runtime issues. Fix them surgically. Read the code, understand it, then fix one thing at a time.",
        "tasks": [
            {"id": str(uuid.uuid4()), "title": "Run tsc --noEmit and fix any type errors", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Read through brain-tools.ts and fix any tool handler bugs", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Check API routes for error handling gaps", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Review deploy pipeline for edge cases that cause failures", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Clean up dead code, unused imports, and stale comments", "status": "pending"},
        ],
        "createdAt": now,
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Self-improvement: evolve Pi-Chi's own decision-making and tools",
        "status": "active",
        "priority": "medium",
        "horizon": "medium",
        "reasoning": "Continuously improve own prompts, tool implementations, and cycle logic. Analyze past cycle outcomes to find improvement patterns.",
        "tasks": [
            {"id": str(uuid.uuid4()), "title": "Analyze past cycle outcomes to find patterns of wasted cycles", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Improve brain prompt to reduce unfocused cycles", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Add better error recovery to tool handlers", "status": "pending"},
        ],
        "createdAt": now,
    },
    {
        "id": str(uuid.uuid4()),
        "title": "Monitor and maintain system health",
        "status": "active",
        "priority": "medium",
        "horizon": "short",
        "reasoning": "Keep the Pi healthy — disk space, RAM, services, git state. Prevent issues before they become problems.",
        "tasks": [
            {"id": str(uuid.uuid4()), "title": "Check disk usage and clean up if needed", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Verify all services are running correctly", "status": "pending"},
            {"id": str(uuid.uuid4()), "title": "Ensure git is clean and in sync with origin", "status": "pending"},
        ],
        "createdAt": now,
    },
]

# Update current mission
state["currentMission"] = {
    "id": str(uuid.uuid4()),
    "type": "self-improve",
    "title": "Improve own dashboard UI and fix bugs in codebase",
    "rationale": "Owner directed: priority is surgical UI improvements that make the dashboard better for both Pi-Chi to operate and Leigh to use. Find and fix bugs before building new features.",
    "progressLabel": "Auditing and improving",
    "startedAt": now,
    "status": "active",
}

# Save
with open(STATE_FILE, "w") as f:
    json.dump(state, f, indent=2)

print("Done! Goals reset to", len(state["goals"]), "goals")
print("Archived", len(state.get("goalHistory", [])), "goals to history")
print("Mission:", state["currentMission"]["title"])
for g in state["goals"]:
    done = sum(1 for t in g["tasks"] if t["status"] == "done")
    print(f"  [{g['priority']}][{g['horizon']}] {g['title']} - {done}/{len(g['tasks'])} tasks")
