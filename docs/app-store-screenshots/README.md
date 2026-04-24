# App Store Screenshots

These screenshots should be captured from the real iOS Simulator UI, not mocked.

Current device targets:

- iPhone 6.9": iPhone 17 Pro Max simulator — `1320x2868`
- iPad 13": iPad Pro 13-inch simulator — `2064x2752`

## Capture workflow

1. Boot/open Simulator.
2. Run or install BibleMarker on the target simulator.
3. Restore a representative backup dataset if needed.
4. Navigate the app to the desired state.
5. Capture with `simctl io screenshot`.

Useful commands:

```bash
xcrun simctl list devices available
xcrun simctl boot <DEVICE_UDID>
open -a Simulator

# Capture a screenshot
xcrun simctl io <DEVICE_UDID> screenshot docs/app-store-screenshots/<filename>.png
```

## Moving a backup between simulators

```bash
IPHONE=<IPHONE_UDID>
IPAD=<IPAD_UDID>
APP=app.biblemarker

IPHONE_DATA=$(xcrun simctl get_app_container "$IPHONE" "$APP" data)
IPAD_DATA=$(xcrun simctl get_app_container "$IPAD" "$APP" data)

LATEST=$(find "$IPHONE_DATA" -name '*.json' -type f -maxdepth 6 -print0 | xargs -0 ls -t | head -1)
cp "$LATEST" "$IPAD_DATA/Documents/"
```

Then restore the JSON backup from the iPad simulator using BibleMarker’s import/restore UI.
