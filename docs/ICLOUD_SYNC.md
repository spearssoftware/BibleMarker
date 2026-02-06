# iCloud Sync for iOS and macOS

BibleMarker supports automatic sync across iOS and macOS devices using iCloud Documents.

## Overview

When running on iOS or macOS through Tauri, the app stores its database in the iCloud Documents container. This enables:

- **Automatic sync** between iPhone, iPad, and Mac
- **Offline support** with sync when back online
- **Conflict resolution** for concurrent edits

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        BibleMarker App                          │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (React/TypeScript)                                    │
│  ├── src/lib/database.ts     → Unified database interface       │
│  ├── src/lib/sqlite-db.ts    → SQLite operations                │
│  ├── src/lib/sync.ts         → Sync status & conflict handling  │
│  └── src/components/shared/SyncStatusIndicator.tsx              │
├─────────────────────────────────────────────────────────────────┤
│  Backend (Rust/Tauri)                                           │
│  ├── src-tauri/src/icloud.rs → iCloud container access          │
│  └── tauri-plugin-sql        → SQLite database plugin           │
├─────────────────────────────────────────────────────────────────┤
│  Storage                                                        │
│  ├── iCloud Container: iCloud.com.biblemarker                   │
│  └── Database: Documents/biblemarker.db                         │
└─────────────────────────────────────────────────────────────────┘
```

## Platform Support

| Platform | Database | Sync |
|----------|----------|------|
| Web | IndexedDB (Dexie) | None |
| macOS (Tauri) | SQLite | iCloud |
| iOS (Tauri) | SQLite | iCloud |
| Windows (Tauri) | SQLite | None (future: OneDrive) |
| Linux (Tauri) | SQLite | None |

## Setup Requirements

### 1. Apple Developer Account

You need an Apple Developer account ($99/year) with iCloud capability enabled.

### 2. App ID Configuration

In the Apple Developer Portal:
1. Go to **Identifiers** → Select your App ID
2. Enable **iCloud** capability
3. Create an iCloud Container: `iCloud.com.biblemarker`

### 3. Provisioning Profile

Create/regenerate provisioning profiles with iCloud entitlement.

### 4. Entitlements

The following entitlements are configured in `src-tauri/entitlements.plist`:

```xml
<!-- iCloud Document Storage -->
<key>com.apple.developer.icloud-container-identifiers</key>
<array>
    <string>iCloud.com.biblemarker</string>
</array>
<key>com.apple.developer.ubiquity-container-identifiers</key>
<array>
    <string>iCloud.com.biblemarker</string>
</array>
<key>com.apple.developer.icloud-services</key>
<array>
    <string>CloudDocuments</string>
</array>
```

## How Sync Works

### Database Storage

- The SQLite database is stored in the iCloud ubiquity container
- Path: `iCloud.com.biblemarker/Documents/biblemarker.db`
- iCloud automatically syncs this file across devices

### Sync States

| State | Description |
|-------|-------------|
| `synced` | All changes synced to iCloud |
| `syncing` | Currently uploading/downloading changes |
| `offline` | Device offline, changes pending |
| `error` | Sync error occurred |
| `unavailable` | iCloud not available (not signed in, etc.) |

### Conflict Resolution

When the same record is modified on multiple devices:

1. **Default strategy**: Newest wins (based on `updatedAt` timestamp)
2. **Manual resolution**: UI shows conflicts for user to resolve
3. **Record fields**: Each record has `sync_status`, `device_id`, and `updated_at`

## Using the Sync API

### Check iCloud Status

```typescript
import { checkICloudStatus } from '@/lib/sync';

const status = await checkICloudStatus();
if (status.available) {
  console.log('iCloud container:', status.container_path);
} else {
  console.log('iCloud unavailable:', status.error);
}
```

### Subscribe to Sync Status

```typescript
import { onSyncStatusChange, getSyncStatusMessage } from '@/lib/sync';

const unsubscribe = onSyncStatusChange((status) => {
  console.log('Sync:', getSyncStatusMessage(status));
  // e.g., "Synced just now", "Syncing...", "Offline (3 pending)"
});

// Later: unsubscribe();
```

### Trigger Manual Sync

```typescript
import { triggerSync } from '@/lib/sync';

const success = await triggerSync();
```

### Display Sync Status in UI

```tsx
import { SyncStatusIndicator } from '@/components/shared';

// Compact mode (icon only)
<SyncStatusIndicator compact />

// Full mode (with status text and sync button)
<SyncStatusIndicator />
```

## Data Migration

When users upgrade from the web version to a native app, their IndexedDB data is automatically migrated to SQLite:

```typescript
import { needsMigration, migrateIndexedDbToSqlite } from '@/lib/migration';

// Check if migration needed
if (await needsMigration()) {
  const result = await migrateIndexedDbToSqlite();
  if (result.success) {
    console.log(`Migrated ${result.recordCount} records`);
  } else {
    console.error('Migration failed:', result.error);
  }
}
```

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

### Conflicts

1. **View conflicts**: Click the conflict indicator in the sync status
2. **Choose resolution**: Select local or remote version
3. **Merge manually**: For complex conflicts, merge data manually

## Development

### Testing iCloud Sync

1. Build for macOS: `pnpm tauri build`
2. Sign with your development certificate
3. Run on two devices signed into the same iCloud account
4. Make changes on one device, verify sync on the other

### Testing Without iCloud

The app gracefully handles missing iCloud:
- `isICloudAvailable()` returns `false`
- Sync UI components don't render
- Data is stored locally only

### Adding New Synced Tables

1. Add table to SQLite schema in `sqlite-db.ts`
2. Add CRUD operations with `sync_status` and `device_id` fields
3. Add corresponding operations in `database.ts` abstraction
4. Update migration if needed

## Future Enhancements

- Real-time sync using CloudKit (instead of file-based sync)
- Cross-platform sync using custom backend
- Selective sync (choose what to sync)
- Sync progress indicator
- Detailed sync history
