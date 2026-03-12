#!/bin/bash
set -euo pipefail

# pnpm passes '--' before args; skip it
if [ "${1:-}" = "--" ]; then shift; fi
BUMP_TYPE="${1:-}"
WHATS_NEW=""

# Parse optional --notes "..." flag
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --notes)
      WHATS_NEW="${2:-}"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ -z "$BUMP_TYPE" ]; then
  echo "Usage: pnpm run release -- <major|minor|patch> [--notes \"User-facing notes\"]"
  exit 1
fi

if [[ "$BUMP_TYPE" != "major" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "patch" ]]; then
  echo "Error: argument must be major, minor, or patch"
  exit 1
fi

# Abort if there are uncommitted changes (they won't be included in the release)
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Error: uncommitted changes detected. Commit or stash them before releasing."
  git status --short
  exit 1
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")
IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_VERSION"

case "$BUMP_TYPE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch) PATCH=$((PATCH + 1)) ;;
esac

NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"

echo "Bumping: $CURRENT_VERSION → $NEW_VERSION"

node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '${NEW_VERSION}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

pnpm run version:sync

git add package.json src-tauri/Cargo.toml
git commit -m "release: v${NEW_VERSION}"
git tag "app-v${NEW_VERSION}"

echo ""
echo "Pushing commit and tag app-v${NEW_VERSION}..."
git push && git push origin "app-v${NEW_VERSION}"
echo ""
echo "Release v${NEW_VERSION} triggered!"
echo "Monitor at: https://github.com/spearssoftware/BibleMarker/actions"

# If --notes provided, wait for CI to create the draft release then prepend What's New
if [ -n "$WHATS_NEW" ]; then
  echo ""
  echo "Waiting for CI to create draft release..."
  for i in $(seq 1 24); do
    sleep 10
    if gh release view "app-v${NEW_VERSION}" &>/dev/null; then
      echo "Draft release found. Adding What's New section..."
      EXISTING_NOTES=$(gh release view "app-v${NEW_VERSION}" --json body -q .body)
      NEW_BODY="## What's New
${WHATS_NEW}

${EXISTING_NOTES}"
      gh release edit "app-v${NEW_VERSION}" --notes "$NEW_BODY"
      echo "What's New section added to release notes."
      break
    fi
    echo "  Still waiting... (${i}/24)"
  done
fi
