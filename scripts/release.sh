#!/bin/bash
set -euo pipefail

if [ $# -ne 1 ]; then
  echo "Usage: pnpm run release -- <major|minor|patch>"
  exit 1
fi

BUMP_TYPE="$1"

if [[ "$BUMP_TYPE" != "major" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "patch" ]]; then
  echo "Error: argument must be major, minor, or patch"
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
[ -f src-tauri/gen/apple/biblemarker_iOS/Info.plist ] && git add src-tauri/gen/apple/biblemarker_iOS/Info.plist || true
[ -f src-tauri/gen/apple/project.yml ] && git add src-tauri/gen/apple/project.yml || true
git commit -m "release: v${NEW_VERSION}"
git tag "app-v${NEW_VERSION}"

echo ""
echo "Created commit and tag app-v${NEW_VERSION}"
echo "Run the following to trigger the release build:"
echo "  git push && git push origin app-v${NEW_VERSION}"
