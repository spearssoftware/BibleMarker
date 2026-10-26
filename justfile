# Task runner for BibleMarker. Recipes wrap the pnpm scripts and cargo commands
# CI runs; cargo uses the workspace CARGO_HOME, matching scripts/tauri.sh.

set positional-arguments

export CARGO_HOME := justfile_directory() / ".cargo-home"

[private]
default:
    @just --list

# Install JS dependencies for the app and the worker.
setup:
    pnpm install
    pnpm --dir worker install

# Run the desktop app in dev mode.
dev:
    pnpm run tauri:dev

# The full gate CI runs, cheapest first: Rust format, lint, typecheck, tests, web build, clippy.
check: fmt-check lint typecheck test test-scripts web-build clippy

# Run ESLint.
lint:
    pnpm run lint

# Typecheck the frontend.
typecheck:
    pnpm tsc --noEmit

# Run the Vitest suite once. Pass a path or pattern to narrow it.
test *args:
    pnpm test "$@"

# Run the Python unit tests for the release scripts.
test-scripts:
    python3 -m unittest discover -s scripts -p 'test_*.py'

# Run Vitest in watch mode.
test-watch:
    pnpm run test:watch

# Build the web frontend only (tsc -b + vite), as CI does.
web-build:
    pnpm build

# Format the Rust code.
[working-directory: 'src-tauri']
fmt:
    cargo fmt

# Fail if the Rust code is not formatted.
[working-directory: 'src-tauri']
fmt-check:
    cargo fmt --check

# Lint the Rust code. Needs the SWORD modules and gnosis-lite.db in src-tauri/resources.
[working-directory: 'src-tauri']
clippy:
    cargo clippy -- -D warnings

# Build the desktop app for production.
build:
    pnpm run tauri:build

# Cut a release PR: just release patch|minor|major [--notes "- Bullet"].
release *args:
    pnpm run release -- "$@"

# Submit a released version to the App Store and Google Play production (platforms: both, ios, android).
store-push version platforms="both":
    @just _store-dispatch "$1" "$2" false

# Dry run of store-push: check every precondition for both stores without changing anything.
store-check version:
    @just _store-dispatch "$1" both true

# Dispatch the store-submit workflow and print the URL of the run it started.
[private]
_store-dispatch version platforms dry_run:
    #!/usr/bin/env bash
    set -euo pipefail
    since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    out=$(gh workflow run store-submit.yml -f version="$1" -f platforms="$2" -f dry_run="$3" 2>&1)
    echo "$out"
    if grep -q '/actions/runs/' <<<"$out"; then
        exit 0
    fi
    sleep 3
    url=$(gh run list --workflow store-submit.yml --event workflow_dispatch \
        --user "$(gh api user -q .login)" --limit 1 --json url,createdAt \
        -q ".[] | select(.createdAt >= \"$since\") | .url")
    if [ -n "$url" ]; then
        echo "$url"
    else
        echo "Dispatched; run not visible yet — see: gh run list --workflow store-submit.yml"
    fi

# Run the app in the iOS simulator.
ios-dev:
    pnpm run ios:dev

# Build the iOS app for production.
ios-build:
    pnpm run ios:build

# Run the app on an Android emulator or device.
android-dev:
    pnpm run android:dev

# Build the Android app for production.
android-build:
    pnpm run android:build

# Run the sync worker locally.
[working-directory: 'worker']
worker-dev:
    pnpm run dev

# Typecheck and test the sync worker.
[working-directory: 'worker']
worker-check:
    pnpm run typecheck
    pnpm test

# Deploy the sync worker to production.
[working-directory: 'worker']
worker-deploy:
    pnpm run publish
