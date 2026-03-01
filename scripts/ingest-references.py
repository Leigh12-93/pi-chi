#!/usr/bin/env python3
"""
Forge Reference Library Generator
==================================
Scans local codebases for React/Next.js components, pages, hooks, and utilities.
Generates lib/reference-library.ts with extracted patterns for the AI to search.

Usage:
    python3 scripts/ingest-references.py

Output:
    lib/reference-library.ts — TypeScript file with REFERENCE_LIBRARY array + searchReferences()
"""

import os
import re
import json
import hashlib
import sys
from pathlib import Path
from datetime import datetime

# ── Config ──────────────────────────────────────────────────────────

CODEBASES = [
    {
        "path": os.path.expanduser("~/adelaide-wheelie-bins"),
        "name": "awb-website",
        "scan_dirs": ["components", "app"],
        "extensions": [".tsx", ".jsx"],
    },
    {
        "path": os.path.expanduser("~/awb-admin-dashboard"),
        "name": "awb-admin-dashboard",
        "scan_dirs": ["components", "src/components"],
        "extensions": [".tsx", ".jsx"],
    },
    {
        "path": os.path.expanduser("~/forge"),
        "name": "forge",
        "scan_dirs": ["components"],
        "extensions": [".tsx"],
    },
]

# Skip patterns
SKIP_PATTERNS = [
    "node_modules", ".next", "dist", "build", ".git",
    "__tests__", "__mocks__", "test.", "spec.", ".test.", ".spec.",
    ".env", "config.json", "credentials", "secret",
    "package-lock", "pnpm-lock", "yarn.lock", ".d.ts",
]

# Sensitive files to never include
SENSITIVE_FILES = [
    "auth.ts", "auth.tsx", "config.ts", "credentials",
    "supabase.ts", "supabase-client.ts",
    "stripe", "webhook", "payment", ".env",
]

MIN_LINES = 15
MAX_SNIPPET_LINES = 120

# ── File analysis ───────────────────────────────────────────────────

def should_skip(filepath: str) -> bool:
    lower = filepath.lower().replace("\\", "/")
    for p in SKIP_PATTERNS:
        if p in lower:
            return True
    basename = os.path.basename(lower)
    for s in SENSITIVE_FILES:
        if s in basename:
            return True
    return False


def categorize_file(filepath: str, content: str) -> str:
    lower = filepath.lower()
    basename = os.path.basename(lower)

    if "/page." in lower:
        return "page"
    if "/layout." in lower:
        return "layout"
    if "/api/" in lower or "route." in lower:
        return "api-route"
    if "hook" in basename or basename.startswith("use"):
        return "hook"
    if "/lib/" in lower or "/utils/" in lower:
        return "utility"
    if "/ui/" in lower:
        return "ui-primitive"

    if re.search(r'<form\b', content):
        return "form"
    if re.search(r'<table\b|DataTable|useReactTable', content):
        return "data-display"
    if re.search(r'<nav\b|sidebar|navigation', content, re.I):
        return "navigation"
    if re.search(r'dialog|modal|Dialog|Modal', content, re.I):
        return "feedback"
    if re.search(r'dashboard|stats|metric', content, re.I):
        return "dashboard"
    if re.search(r'login|signup|sign.?in|password', content, re.I):
        return "auth"
    if re.search(r'chart|recharts', content, re.I):
        return "chart"
    if re.search(r'skeleton|loading|spinner', content, re.I):
        return "loading"
    if re.search(r'error.?boundary|error.?state|fallback', content, re.I):
        return "error-handling"
    if re.search(r'toast|notification|alert', content, re.I):
        return "feedback"
    if re.search(r'card|Card', content) and re.search(r'grid|flex', content):
        return "layout"
    if re.search(r'search|filter|Search|Filter', content):
        return "search"
    if re.search(r'setting|preference|config', content, re.I):
        return "settings"

    return "component"


def extract_tags(content: str) -> list:
    tags = set()

    if "useState" in content: tags.add("stateful")
    if "useEffect" in content: tags.add("side-effects")
    if "'use client'" in content or '"use client"' in content: tags.add("client-component")
    if "useForm" in content or "react-hook-form" in content: tags.add("form-validation")
    if "zod" in content: tags.add("zod")
    if "framer-motion" in content or "motion." in content: tags.add("animated")
    if "recharts" in content: tags.add("charts")
    if "tanstack" in content.lower(): tags.add("data-table")
    if re.search(r'sm:|md:|lg:|xl:', content): tags.add("responsive")
    if "dark:" in content: tags.add("dark-mode")
    if "hover:" in content: tags.add("interactive")
    if "aria-" in content: tags.add("accessible")
    if "loading" in content.lower() and "state" in content.lower(): tags.add("loading-state")
    if "<form" in content: tags.add("form")
    if "<table" in content: tags.add("table")
    if "toast" in content.lower(): tags.add("toast")
    if "modal" in content.lower() or "dialog" in content.lower(): tags.add("modal")
    if "dropdown" in content.lower(): tags.add("dropdown")
    if "search" in content.lower() and "input" in content.lower(): tags.add("search")
    if "pagination" in content.lower(): tags.add("pagination")
    if "upload" in content.lower(): tags.add("file-upload")
    if "skeleton" in content.lower(): tags.add("skeleton")
    if "badge" in content.lower(): tags.add("badge")
    if "avatar" in content.lower(): tags.add("avatar")
    if "breadcrumb" in content.lower(): tags.add("breadcrumb")
    if "tab" in content.lower() and ("Tab" in content or "tabs" in content.lower()): tags.add("tabs")
    if "accordion" in content.lower(): tags.add("accordion")
    if "tooltip" in content.lower(): tags.add("tooltip")
    if "slider" in content.lower() or "carousel" in content.lower(): tags.add("carousel")
    if "stepper" in content.lower() or "wizard" in content.lower(): tags.add("stepper")

    return sorted(tags)


def extract_component_name(filepath: str, content: str) -> str:
    match = re.search(r'export\s+default\s+function\s+(\w+)', content)
    if match: return match.group(1)
    match = re.search(r'export\s+function\s+(\w+)', content)
    if match: return match.group(1)
    match = re.search(r'export\s+const\s+(\w+)', content)
    if match: return match.group(1)
    match = re.search(r'^function\s+([A-Z]\w+)', content, re.MULTILINE)
    if match: return match.group(1)
    basename = os.path.splitext(os.path.basename(filepath))[0]
    return "".join(w.capitalize() for w in basename.replace("_", "-").split("-"))


def truncate_content(content: str, max_lines: int = MAX_SNIPPET_LINES) -> str:
    lines = content.split("\n")
    if len(lines) <= max_lines:
        return content
    head = max_lines - 20
    tail = 15
    result = lines[:head] + ["\n// ... (truncated) ...\n"] + lines[-tail:]
    return "\n".join(result)


def extract_description(filepath: str, content: str, name: str, category: str) -> str:
    """Generate a useful description from file content."""
    parts = [name]

    # Detect what the component renders/does
    if "<form" in content:
        parts.append("with form")
        if "useForm" in content: parts.append("(react-hook-form)")
        if "zod" in content: parts.append("+ zod validation")
    if "DataTable" in content or "useReactTable" in content:
        parts.append("with data table")
    if "recharts" in content:
        parts.append("with charts")
    if re.search(r'fetch\(|useSWR|useQuery', content):
        parts.append("with data fetching")
    if "useState" in content and "loading" in content.lower():
        parts.append("with loading state")
    if re.search(r'sm:|md:|lg:', content):
        parts.append("— responsive")
    if "dark:" in content:
        parts.append("— dark mode")
    if "motion" in content.lower():
        parts.append("— animated")
    if "toast" in content.lower():
        parts.append("with notifications")
    if "modal" in content.lower() or "dialog" in content.lower():
        parts.append("modal/dialog")

    return " ".join(parts)


# ── Quality filter ──────────────────────────────────────────────────

def filter_top_references(refs: list, max_refs: int = 150) -> list:
    """
    Score and filter references for quality and category diversity.
    Keeps at most max_refs, ensuring no single category dominates.
    """
    # Score each reference
    for ref in refs:
        score = 0
        # More tags = richer component (more patterns to learn from)
        score += len(ref["tags"]) * 3
        # Sweet spot: 30-200 lines (too short = trivial, too long = bloated)
        lines = ref["lines"]
        if 30 <= lines <= 200:
            score += 10
        elif 200 < lines <= 400:
            score += 5
        elif lines < 30:
            score += 0
        # Bonus for non-generic categories
        if ref["category"] not in ("component", "page"):
            score += 5
        # Bonus for real UI patterns
        valuable_tags = {"form-validation", "data-table", "charts", "animated",
                         "responsive", "dark-mode", "accessible", "loading-state",
                         "search", "pagination", "modal", "tabs", "zod"}
        score += len(valuable_tags & set(ref["tags"])) * 4
        # Bonus for data fetching / state management
        if "stateful" in ref["tags"] and "side-effects" in ref["tags"]:
            score += 3
        # Slight diversity bonus for smaller codebases
        if ref["source"] == "forge":
            score += 2
        ref["_score"] = score

    # Sort by score descending
    refs.sort(key=lambda r: r["_score"], reverse=True)

    # Pick with category caps to ensure diversity
    # No category gets more than 25% of total slots
    max_per_category = max(max_refs // 4, 10)
    category_counts: dict[str, int] = {}
    selected = []

    for ref in refs:
        cat = ref["category"]
        if category_counts.get(cat, 0) >= max_per_category:
            continue
        selected.append(ref)
        category_counts[cat] = category_counts.get(cat, 0) + 1
        if len(selected) >= max_refs:
            break

    # Clean up scoring key
    for ref in selected:
        ref.pop("_score", None)
    for ref in refs:
        ref.pop("_score", None)

    return selected


# ── Main ────────────────────────────────────────────────────────────

def scan_codebase(codebase: dict) -> list:
    base_path = codebase["path"]
    refs = []

    if not os.path.isdir(base_path):
        print(f"  SKIP: {base_path} does not exist")
        return refs

    for scan_dir in codebase["scan_dirs"]:
        full_dir = os.path.join(base_path, scan_dir)
        if not os.path.isdir(full_dir):
            continue

        for root, dirs, files in os.walk(full_dir):
            dirs[:] = [d for d in dirs if d not in {
                "node_modules", ".next", "dist", ".git", "__pycache__"
            }]

            for filename in files:
                filepath = os.path.join(root, filename)
                ext = os.path.splitext(filename)[1]

                if ext not in codebase["extensions"]:
                    continue
                if should_skip(filepath):
                    continue

                try:
                    content = Path(filepath).read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    continue

                lines = content.split("\n")
                if len(lines) < MIN_LINES:
                    continue

                # Skip files that are mostly imports/types (not useful as references)
                code_lines = [l for l in lines if l.strip() and not l.strip().startswith("import") and not l.strip().startswith("//")]
                if len(code_lines) < 10:
                    continue

                rel_path = os.path.relpath(filepath, base_path).replace("\\", "/")
                name = extract_component_name(filepath, content)
                category = categorize_file(filepath, content)
                tags = extract_tags(content)
                snippet = truncate_content(content)
                description = extract_description(filepath, content, name, category)

                refs.append({
                    "name": name,
                    "source": codebase["name"],
                    "path": rel_path,
                    "category": category,
                    "description": description,
                    "tags": tags,
                    "code": snippet,
                    "lines": len(lines),
                })

    return refs


def generate_typescript(all_refs: list) -> str:
    """Generate the TypeScript reference library file."""

    ts = f"""// AUTO-GENERATED by scripts/ingest-references.py — DO NOT EDIT MANUALLY
// Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}
// Sources: {', '.join(set(r['source'] for r in all_refs))}
// Total references: {len(all_refs)}

export interface ComponentReference {{
  name: string
  source: string
  path: string
  category: string
  description: string
  tags: string[]
  code: string
  lines: number
}}

export const REFERENCE_LIBRARY: ComponentReference[] = [
"""

    for ref in all_refs:
        # Escape backticks and ${} in code for template literals
        code = ref["code"].replace("\\", "\\\\").replace("`", "\\`").replace("${", "\\${")
        tags_str = json.dumps(ref["tags"])

        ts += f"""  {{
    name: {json.dumps(ref['name'])},
    source: {json.dumps(ref['source'])},
    path: {json.dumps(ref['path'])},
    category: {json.dumps(ref['category'])},
    description: {json.dumps(ref['description'])},
    tags: {tags_str},
    code: `{code}`,
    lines: {ref['lines']},
  }},
"""

    ts += """]

export function searchReferences(query: string, limit = 3): ComponentReference[] {
  const lower = query.toLowerCase()
  const words = lower.split(/\\s+/).filter(w => w.length >= 2)

  const scored = REFERENCE_LIBRARY.map(ref => {
    let score = 0

    // Exact name match
    if (ref.name.toLowerCase().includes(lower)) score += 15

    // Category match
    if (ref.category.toLowerCase().includes(lower)) score += 10
    if (lower.includes(ref.category.toLowerCase())) score += 10

    // Description match
    if (ref.description.toLowerCase().includes(lower)) score += 5

    // Tag matching (strongest signal for multi-word queries)
    for (const tag of ref.tags) {
      if (lower.includes(tag)) score += 4
      if (tag.includes(lower)) score += 4
    }

    // Word-level matching across all fields
    for (const word of words) {
      if (ref.name.toLowerCase().includes(word)) score += 3
      if (ref.description.toLowerCase().includes(word)) score += 2
      if (ref.tags.some(t => t.includes(word))) score += 3
      if (ref.category.includes(word)) score += 2
    }

    return { ref, score }
  })

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.ref)
}
"""
    return ts


def main():
    print("=" * 60)
    print("Forge Reference Library Generator")
    print("=" * 60)

    all_refs = []
    for codebase in CODEBASES:
        print(f"\nScanning: {codebase['name']} ({codebase['path']})")
        refs = scan_codebase(codebase)
        print(f"  Found {len(refs)} components")
        all_refs.extend(refs)

    print(f"\nTotal references: {len(all_refs)}")

    # Stats
    categories = {}
    for ref in all_refs:
        categories[ref["category"]] = categories.get(ref["category"], 0) + 1
    print("\nCategories:")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")

    tag_freq = {}
    for ref in all_refs:
        for tag in ref["tags"]:
            tag_freq[tag] = tag_freq.get(tag, 0) + 1
    print("\nTop tags:")
    for tag, count in sorted(tag_freq.items(), key=lambda x: -x[1])[:15]:
        print(f"  {tag}: {count}")

    # Quality filter: keep top 150 references by diversity and quality
    all_refs = filter_top_references(all_refs, max_refs=150)
    print(f"\nAfter quality filter: {len(all_refs)} references")

    # Generate TypeScript
    output_path = Path(__file__).parent.parent / "lib" / "reference-library.ts"
    ts_content = generate_typescript(all_refs)
    output_path.write_text(ts_content, encoding="utf-8")

    size_kb = len(ts_content) / 1024
    print(f"\nGenerated: {output_path}")
    print(f"  Size: {size_kb:.1f} KB")
    print(f"  References: {len(all_refs)}")
    print(f"\nDone! Run 'npm run build' to verify.")


if __name__ == "__main__":
    main()
