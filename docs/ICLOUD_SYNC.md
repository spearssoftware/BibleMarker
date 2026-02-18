# iCloud Sync for iOS and macOS

BibleMarker supports automatic sync across iOS and macOS devices using iCloud Drive with a journal-based sync system.

## Overview

The sync system uses a **file-based change journal**:

- **Database is always stored locally** (never in a cloud-synced directory)
- Small JSON journal files are written to a cloud-synced folder (iCloud Drive)
- Each device reads other devices' journals and applies changes locally
- Works with any cloud storage: iCloud Drive, OneDrive, Dropbox, etc.

This enables:
- **Automatic sync** between iPhone, iPad, and Mac
- **Offline support** with sync when back online
- **No data corruption** from competing writes to the same SQLite file

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BibleMarker App                          │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React/TypeScript)                                    │
│  ├── src/lib/database.ts     → Unified database interface       │
│  ├── src/lib/sqlite-db.ts    → SQLite operations (local DB)     │
│  ├── src/lib/sync.ts         → Sync status & iCloud detection   │
│  ├── src/lib/sync-engine.ts  → Journal-based sync engine        │
│  └── src/components/shared/SyncStatusIndicator.tsx              │
├─────────────────────────────────────────────────────────────────┤
│  Backend (Rust/Tauri)                                           │
│  ├── src-tauri/src/icloud.rs → iCloud container path detection  │
│  └── tauri-plugin-sql        → SQLite database plugin           │
├─────────────────────────────────────────────────────────────────┤
│  Storage                                                        │
│  ├── Local: SQLite database (never synced directly)             │
│  ├── iCloud Drive: JSON journal files (synced by OS)            │
│  └── iCloud Container: iCloud.app.biblemarker                   │
└─────────────────────────────────────────────────────────────────┘
```

### How It Works

1. When data changes locally, the sync engine writes a small JSON journal entry to the iCloud-synced folder
2. iCloud Drive syncs these journal files across devices automatically
3. Other devices detect new journal files, read them, and apply changes to their local database
4. Each device tracks which journals it has already processed

## Platform Support

| Platform | Database | Sync |
|----------|----------|------|
| Web | IndexedDB (Dexie) | None |
| macOS (Tauri) | SQLite (local) | iCloud Drive (journals) |
| iOS (Tauri) | SQLite (local) | iCloud Drive (journals) |
| Windows (Tauri) | SQLite (local) | None (future: OneDrive) |
| Linux (Tauri) | SQLite (local) | None |

## Setup Requirements

### 1. Apple Developer Account

You need an Apple Developer account ($99/year) with iCloud capability enabled.

### 2. App ID Configuration

In the Apple Developer Portal:
1. Go to **Identifiers** → Select your App ID
2. Enable **iCloud** capability
3. Create an iCloud Container: `iCloud.app.biblemarker`

### 3. Provisioning Profile

Create/regenerate provisioning profiles with iCloud entitlement.

### 4. Entitlements

The following entitlements are configured in `src-tauri/entitlements.plist`:

```xml
<!-- iCloud Document Storage -->
<key>com.apple.developer.icloud-container-identifiers</key>
<array>
    <string>iCloud.app.biblemarker</string>
</array>
<key>com.apple.developer.ubiquity-container-identifiers</key>
<array>
    <string>iCloud.app.biblemarker</string>
</array>
<key>com.apple.developer.icloud-services</key>
<array>
    <string>CloudDocuments</string>
</array>
```

## Sync States

| State | Description |
|-------|-------------|
| `synced` | All changes synced |
| `syncing` | Currently reading/writing journal files |
| `disabled` | Sync not configured or turned off |
| `unavailable` | Sync folder not found (iCloud not signed in, etc.) |
| `error` | Sync error occurred |

## Using the Sync API

### Subscribe to Sync Status

```typescript
import { onSyncStatusChange, getSyncStatusMessage } from '@/lib/sync';

const unsubscribe = onSyncStatusChange((status) => {
  console.log('Sync:', getSyncStatusMessage(status));
  // e.g., "Synced just now", "Syncing...", "Sync disabled"
});

// Later: unsubscribe();
```

### Trigger Manual Sync

```typescript
import { triggerSync } from '@/lib/sync';

const success = await triggerSync();
```

### Get Current Status

```typescript
import { getSyncStatus } from '@/lib/sync';

const status = getSyncStatus();
// status.state, status.last_sync, status.pending_changes,
// status.sync_folder, status.connected_devices
```

### Display Sync Status in UI

```tsx
import { SyncStatusIndicator } from '@/components/shared';

// Compact mode (icon only)
<SyncStatusIndicator compact />

// Full mode (with status text and sync button)
<SyncStatusIndicator />
```

### iCloud Detection

On Apple platforms, the sync system auto-detects iCloud Drive via a Rust command (`get_sync_folder_path`) that calls `URLForUbiquityContainerIdentifier`. Platform detection:

```typescript
import { isApplePlatform } from '@/lib/platform';

if (isApplePlatform()) {
  // iCloud auto-configured on init
}
```

On iOS, the iCloud container may not be materialized on first launch. The sync module retries automatically (3s, then 10s delays).

## Troubleshooting

### iCloud Not Available

1. **Check sign-in**: Ensure user is signed into iCloud on the device
2. **Check iCloud Drive**: Must be enabled in System Preferences / Settings
3. **Check app permission**: May need to enable iCloud for the app specifically
4. **Check entitlements**: Verify entitlements.plist is correctly configured

### Sync Not Working

1. **Check network**: Device must have internet access for initial sync
2. **Check storage**: iCloud storage must not be full
3. **Force sync**: Use the "Sync Now" button in the sync status panel
4. **Check logs**: Look for `[Sync]` prefixed messages in console

## Development

### Testing iCloud Sync

1. Build for macOS: `pnpm run tauri:build`
2. Sign with your development certificate
3. Run on two devices signed into the same iCloud account
4. Make changes on one device, verify sync on the other

### Testing Without iCloud

The app gracefully handles missing iCloud:
- `isApplePlatform()` returns `false` on non-Apple platforms
- Sync UI shows "Sync disabled" state
- Data is stored locally only

### Adding New Synced Data

1. Add table/fields to SQLite schema in `sqlite-db.ts`
2. Ensure changes are tracked in the `change_log` table
3. The sync engine automatically picks up change log entries and journals them

## Future Enhancements

- Cross-platform sync using custom backend
- Selective sync (choose what to sync)
- Sync progress indicator with journal counts
- Detailed sync history
