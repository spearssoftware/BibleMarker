#!/usr/bin/env bash
# Re-sign the Mac app with hardened runtime and secure timestamp (required for notarization).
# Run after: pnpm tauri build
# Usage: ./scripts/sign-macos.sh [path-to-bundle-dir]
#        APPLE_SIGNING_IDENTITY="Developer ID Application: ..." ./scripts/sign-macos.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BUNDLE_DIR="${1:-$ROOT_DIR/src-tauri/target/release/bundle/macos}"
APP_NAME="BibleMarker"
BINARY_NAME="biblemarker"
ENTITLEMENTS="$ROOT_DIR/src-tauri/entitlements.plist"
IDENTITY="${APPLE_SIGNING_IDENTITY:-Developer ID Application: Your Name (GRR34N6W9V)}"

APP_PATH="$BUNDLE_DIR/$APP_NAME.app"
BINARY_PATH="$APP_PATH/Contents/MacOS/$BINARY_NAME"

if [[ ! -f "$BINARY_PATH" ]]; then
  echo "Error: Binary not found at $BINARY_PATH"
  echo "Run 'pnpm tauri build' first, then run this script."
  exit 1
fi

if [[ ! -f "$ENTITLEMENTS" ]]; then
  echo "Error: Entitlements not found at $ENTITLEMENTS"
  exit 1
fi

echo "Re-signing for notarization (hardened runtime + timestamp)..."
echo "  Identity: $IDENTITY"
echo "  App:      $APP_PATH"
echo ""

# Sign the main executable first (required order; must have runtime + timestamp for notarization)
codesign --force --options runtime --timestamp --entitlements "$ENTITLEMENTS" -s "$IDENTITY" "$BINARY_PATH"
# Then sign the app bundle
codesign --force --deep --options runtime --timestamp --entitlements "$ENTITLEMENTS" -s "$IDENTITY" "$APP_PATH"

echo ""
echo "Done. Verify with:"
echo "  codesign -dv --verbose=4 \"$APP_PATH\""
echo "  spctl -a -vv -t execute \"$APP_PATH\""
