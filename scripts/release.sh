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

# Must be on main
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Error: must be on main branch (currently on $CURRENT_BRANCH)"
  exit 1
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")

# Split off prerelease suffix if present (e.g. "1.5.3-beta.2" -> base="1.5.3", pre="beta.2")
CURRENT_BASE="${CURRENT_VERSION%%-*}"
if [[ "$CURRENT_VERSION" == *-* ]]; then
  CURRENT_PRE="${CURRENT_VERSION#*-}"
else
  CURRENT_PRE=""
fi

IFS='.' read -r MAJOR MINOR PATCH <<< "$CURRENT_BASE"

# If the current version is a prerelease (e.g. 1.7.0-beta.4):
#   - `patch` finalizes at the same base (→ 1.7.0) — matches npm semantics
#   - `minor`/`major` still increment from the base (→ 1.8.0 / 2.0.0), treating
#     the prerelease as the in-progress work on CURRENT_BASE that you're now
#     skipping past.
case "$BUMP_TYPE" in
  major) MAJOR=$((MAJOR + 1)); MINOR=0; PATCH=0 ;;
  minor) MINOR=$((MINOR + 1)); PATCH=0 ;;
  patch)
    if [ -z "$CURRENT_PRE" ]; then
      PATCH=$((PATCH + 1))
    fi
    ;;
esac
NEW_VERSION="${MAJOR}.${MINOR}.${PATCH}"
BRANCH_NAME="release/v${NEW_VERSION}"

echo "Bumping: $CURRENT_VERSION → $NEW_VERSION"

# Create release branch
git checkout -b "$BRANCH_NAME"

node -e "
const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = '${NEW_VERSION}';
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

pnpm run version:sync

git add package.json src-tauri/Cargo.toml
# Also stage iOS/Xcode files if they were modified
git add src-tauri/gen/apple/biblemarker_iOS/Info.plist 2>/dev/null || true
git add src-tauri/gen/apple/project.yml 2>/dev/null || true
git commit -m "release: v${NEW_VERSION}"

echo ""
echo "Pushing branch and opening PR..."
git push -u origin "$BRANCH_NAME"

PR_BODY="Version bump to v${NEW_VERSION}. Merging this PR will automatically create the \`app-v${NEW_VERSION}\` tag and trigger the release build."
if [ -n "$WHATS_NEW" ]; then
  PR_BODY="${PR_BODY}

## What's New
${WHATS_NEW}"
fi

PR_URL=$(gh pr create --title "release: v${NEW_VERSION}" --body "$PR_BODY")

echo ""
echo "Release PR created: $PR_URL"
echo "After CI passes, merge the PR to trigger the release build."
