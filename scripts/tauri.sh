#!/usr/bin/env bash
# Run a Tauri subcommand with CARGO_HOME in the workspace (avoids the Cursor
# sandbox blocking crate downloads) and CI unset.
# Usage: scripts/tauri.sh <dev|build> [extra tauri args...]
set -e
cd "$(dirname "$0")/.."
CARGO_HOME="$(pwd)/.cargo-home"
export CARGO_HOME
unset CI
exec pnpm tauri "$@"
