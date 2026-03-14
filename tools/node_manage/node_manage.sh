#!/bin/bash
ACTION="$1"
PROJECT_PATH="$2"

cd "$PROJECT_PATH" 2>/dev/null || { echo "Directory not found: $PROJECT_PATH"; exit 1; }

case "$ACTION" in
  install)
    npm install 2>&1 | tail -5
    ;;
  scripts)
    echo "=== Available Scripts ==="
    node -e "const p=require('./package.json'); Object.entries(p.scripts||{}).forEach(([k,v])=>console.log('  '+k+': '+v))" 2>/dev/null || echo "No package.json found"
    ;;
  outdated)
    echo "=== Outdated Packages ==="
    npm outdated 2>/dev/null | head -20
    ;;
  versions)
    echo "=== Versions ==="
    echo "Node: $(node --version)"
    echo "npm: $(npm --version)"
    echo "Project: $(node -e "console.log(require('./package.json').name+'@'+require('./package.json').version)" 2>/dev/null)"
    echo ""
    echo "--- Dependencies ---"
    node -e "const p=require('./package.json'); Object.entries(p.dependencies||{}).forEach(([k,v])=>console.log('  '+k+': '+v))" 2>/dev/null
    ;;
  audit)
    echo "=== Security Audit ==="
    npm audit 2>/dev/null | head -30
    ;;
  *)
    echo "Error: action must be install, scripts, outdated, versions, or audit"
    exit 1
    ;;
esac
