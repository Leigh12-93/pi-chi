#!/bin/bash
REPO="$1"

if [ ! -d "$REPO/.git" ] && [ ! -f "$REPO/.git" ]; then
  echo "Error: $REPO is not a git repository"
  exit 1
fi

cd "$REPO"

echo "=== Git Info: $REPO ==="
echo "Branch: $(git branch --show-current 2>/dev/null)"
echo "Commit: $(git rev-parse --short HEAD 2>/dev/null)"
echo ""

echo "--- Status ---"
git status -sb 2>/dev/null

echo ""
echo "--- Recent Commits (5) ---"
git log --oneline -5 2>/dev/null

echo ""
echo "--- Remotes ---"
git remote -v 2>/dev/null

echo ""
echo "--- Stash ---"
STASH=$(git stash list 2>/dev/null | wc -l)
echo "Stashed changes: $STASH"

echo ""
echo "--- File Stats ---"
TRACKED=$(git ls-files 2>/dev/null | wc -l)
MODIFIED=$(git diff --name-only 2>/dev/null | wc -l)
STAGED=$(git diff --cached --name-only 2>/dev/null | wc -l)
echo "Tracked files: $TRACKED"
echo "Modified: $MODIFIED"
echo "Staged: $STAGED"
