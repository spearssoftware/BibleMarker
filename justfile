# Task runner for BibleMarker. `just` with no arguments lists these.
#
# Recipes wrap the pnpm scripts and cargo commands CI runs, so CI and the
# package.json scripts stay the source of truth. Cargo runs with CARGO_HOME in
# the workspace, matching scripts/tauri.sh.

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

# The full gate CI runs: lint, typecheck, tests, Rust format and clippy.
check: lint typecheck test fmt-check clippy

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

# Format the Rust code.
fmt:
    cd src-tauri && cargo fmt

# Fail if the Rust code is not formatted.
fmt-check:
    cd src-tauri && cargo fmt --check

# Lint the Rust code. Needs the SWORD modules and gnosis-lite.db in src-tauri/resources.
clippy:
    cd src-tauri && cargo clippy -- -D warnings

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
worker-dev:
    pnpm --dir worker run dev

# Typecheck and test the sync worker.
worker-check:
    pnpm --dir worker run typecheck
    pnpm --dir worker test

# Deploy the sync worker to production.
worker-deploy:
    pnpm --dir worker run publish
