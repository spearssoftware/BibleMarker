#!/usr/bin/env bash
# Run Tauri dev with CARGO_HOME in workspace (avoids Cursor sandbox blocking crate downloads)
set -e
cd "$(dirname "$0")/.."
export CARGO_HOME="$(pwd)/.cargo-home"
unset CI
exec pnpm tauri dev
