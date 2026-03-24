#!/usr/bin/env python3
"""
Mode Orchestrator — reads brain-state.json and decides which mode Pi-Chi should operate in.

Priority:
1. P0 issues exist → fix
2. Unverified flows or recent failures → audit
3. Incomplete features → build
4. Everything passing → growth
5. Explicitly nothing to do → monitor

Writes chosen mode to ~/.pi-chi/current-mode.txt
"""

import json
import os
import sys

STATE_PATH = os.path.expanduser("~/.pi-chi/brain-state.json")
MODE_PATH = os.path.expanduser("~/.pi-chi/current-mode.txt")
MODES_DIR = os.path.expanduser("~/pi-chi/modes")

def load_state():
    try:
        with open(STATE_PATH, "r") as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading brain state: {e}", file=sys.stderr)
        return None

def has_p0_issues(state):
    """Check for critical unresolved failures or constraint violations."""
    failures = state.get("failureRegistry", [])
    unresolved_critical = [
        f for f in failures
        if not f.get("resolved")
        and f.get("occurrenceCount", 0) >= 3
        and f.get("category") not in ("type-check",)  # Skip transient auth errors
    ]

    # Check operational constraints that have been violated
    constraints = state.get("operationalConstraints", [])
    violated = [c for c in constraints if c.get("active") and c.get("violationCount", 0) > 0]

    # Check for unread owner messages (might contain fix instructions)
    chat = state.get("chatMessages", [])
    unread_owner = [m for m in chat if m.get("from") == "owner" and not m.get("read")]

    return len(unresolved_critical) > 0 or len(violated) > 0 or len(unread_owner) > 0

def has_recent_failures(state):
    """Check for recent cycle failures or unverified flows."""
    journal = state.get("cycleJournal", [])
    recent = journal[-5:] if journal else []
    failed_recent = [j for j in recent if j.get("outcome") in ("wasted", "failed")]

    # Unresolved failures of any kind
    failures = state.get("failureRegistry", [])
    unresolved = [f for f in failures if not f.get("resolved")]

    return len(failed_recent) > 0 or len(unresolved) > 3

def has_incomplete_features(state):
    """Check for active goals related to building features."""
    goals = state.get("goals", [])
    build_keywords = ["build", "implement", "create", "deploy", "setup", "forge", "bonkr", "aussiesms", "stripe", "preview", "exoclick"]

    for goal in goals:
        if goal.get("status") != "active":
            continue
        title_lower = goal.get("title", "").lower()
        if any(kw in title_lower for kw in build_keywords):
            tasks = goal.get("tasks", [])
            pending = [t for t in tasks if not t.get("done")]
            if pending:
                return True
    return False

def everything_passing(state):
    """Check if all businesses are healthy and no issues exist."""
    failures = state.get("failureRegistry", [])
    unresolved = [f for f in failures if not f.get("resolved")]

    journal = state.get("cycleJournal", [])
    recent = journal[-3:] if journal else []
    all_productive = all(j.get("outcome") == "productive" for j in recent)

    return len(unresolved) == 0 and all_productive

def decide_mode(state):
    """Decide which mode to use based on brain state."""
    if has_p0_issues(state):
        return "fix"
    if has_recent_failures(state):
        return "audit"
    if has_incomplete_features(state):
        return "build"
    if everything_passing(state):
        return "growth"
    return "monitor"

def main():
    state = load_state()
    if state is None:
        # Default to fix if we can't read state
        mode = "fix"
    else:
        mode = decide_mode(state)

    # Check if mode prompt file exists
    mode_file = os.path.join(MODES_DIR, f"{mode}.md")
    if not os.path.exists(mode_file):
        print(f"Warning: mode file {mode_file} not found, falling back to monitor", file=sys.stderr)
        mode = "monitor"

    # Write current mode
    os.makedirs(os.path.dirname(MODE_PATH), exist_ok=True)
    with open(MODE_PATH, "w") as f:
        f.write(mode)

    print(mode)

if __name__ == "__main__":
    main()
