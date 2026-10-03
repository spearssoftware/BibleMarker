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
check: fmt-check lint typecheck test web-build clippy

# Run ESLint.
lint:
    pnpm run lint

# Typecheck the frontend.
typecheck:
    pnpm tsc --noEmit

# Run the Vitest suite once. Pass a path or pattern to narrow it.
test *args:
    pnpm test "$@"

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
