# Sync Architecture Analysis: Mac ↔ iPhone

## Current Architecture

- **Web App**: React + TypeScript + IndexedDB (Dexie)
- **Planned**: Tauri desktop app (Mac) with Rust backend
- **Mobile**: iPhone app would need to be created (native Swift or React Native/Capacitor)

## Sync Options

### Option 1: iCloud Drive File-Based Sync ⭐ RECOMMENDED

**How it works:**
- Mac app (Tauri) and iPhone app both read/write to a shared iCloud Drive folder
- OS handles syncing automatically
- Use the existing backup JSON format as the sync file
- Watch for file changes and auto-merge updates

**Pros:**
- ✅ Zero server costs
- ✅ Works with existing backup format
- ✅ User controls their data location
- ✅ Automatic OS-level syncing
- ✅ Works offline (syncs when online)
- ✅ Simple implementation (file watching + merge logic)

**Cons:**
- ⚠️ Requires iCloud Drive enabled
- ⚠️ File-based (not real-time, slight delay)
- ⚠️ Need conflict resolution for simultaneous edits
- ⚠️ iOS app needs file access permissions

**Implementation:**
1. **Mac (Tauri):**
   - Use `@tauri-apps/api/fs` to read/write to `~/Library/Mobile Documents/com~apple~CloudDocs/BibleStudy/`
   - Watch for file changes using file system events
   - Auto-save changes to sync file periodically
   - Merge incoming changes with local IndexedDB

2. **iPhone (Native Swift/Capacitor):**
   - Use `FileManager` to access iCloud Drive folder
   - Watch for changes using `NSMetadataQuery` (iCloud Drive file monitoring)
   - Save to Core Data or SQLite locally, sync to iCloud file
   - Merge conflicts using timestamp + user choice

3. **Shared Sync File Format:**
   ```json
   {
     "version": "0.1.0",
     "deviceId": "mac-abc123",
     "lastSynced": "2024-01-15T10:30:00Z",
     "data": { /* existing backup format */ }
   }
   ```

**Estimated Effort:** 2-3 weeks
- Mac: 3-5 days (Tauri file operations + watcher)
- iPhone: 1-2 weeks (depends on native vs Capacitor)
- Conflict resolution: 2-3 days

---

### Option 2: CloudKit (Native Apple Solution) ⭐ BEST FOR NATIVE APPS

**How it works:**
- Apple's native database sync service
- Works seamlessly across Mac/iOS with automatic conflict resolution
- No file management needed - CloudKit handles everything

**Pros:**
- ✅ Native Apple integration
- ✅ Automatic conflict resolution
- ✅ Real-time or near-real-time sync
- ✅ Works offline with sync when online
- ✅ Free tier: 1GB storage, 2GB transfer/day (plenty for Bible study data)
- ✅ Built-in user authentication (iCloud account)

**Cons:**
- ⚠️ Apple ecosystem only (no Windows/Android)
- ⚠️ Requires CloudKit framework (native iOS/macOS only)
- ⚠️ Tauri would need Rust bridge to CloudKit APIs
- ⚠️ More complex than file-based sync
- ⚠️ Need to restructure data model for CloudKit entities

**Implementation:**
1. **Mac (Tauri + Rust):**
   - Create Rust wrapper for CloudKit APIs (or use Objective-C bridge)
   - Map IndexedDB schema to CloudKit Record types
   - Sync on app launch, periodic background sync
   - Handle CloudKit subscriptions for real-time updates

2. **iPhone (Native Swift):**
   - Use CloudKit directly with `CKContainer` and `CKDatabase`
   - Map Core Data/SQLite to CloudKit records
   - Set up CloudKit subscriptions for automatic updates
   - Built-in conflict resolution

**Estimated Effort:** 4-6 weeks
- CloudKit schema design: 1 week
- Mac Rust/Objective-C bridge: 1-2 weeks
- iPhone CloudKit integration: 1-2 weeks
- Testing & conflict resolution: 1 week

---

### Option 3: Custom Backend + API

**How it works:**
- Deploy a backend server (Node.js, Rust, etc.)
- Mac and iPhone apps sync via REST API
- Server stores data in database (PostgreSQL, MongoDB, etc.)
- Handle authentication, versioning, conflict resolution on server

**Pros:**
- ✅ Full control over sync logic
- ✅ Cross-platform (works with any platform)
- ✅ Can add features like web access, sharing
- ✅ Centralized conflict resolution
- ✅ Can add analytics, backups, etc.

**Cons:**
- ❌ Server costs (hosting, database)
- ❌ Requires authentication system
- ❌ More complex infrastructure
- ❌ Need to handle scaling, uptime, backups
- ❌ Privacy concerns (user data on your server)

**Implementation:**
1. **Backend:**
   - REST API for sync endpoints
   - Database schema matching IndexedDB structure
   - Version tracking for conflict resolution
   - Authentication (OAuth, JWT, etc.)
   - Rate limiting, security

2. **Mac (Tauri):**
   - HTTP client to sync with API
   - Periodic background sync
   - Queue changes when offline

3. **iPhone:**
   - HTTP client (URLSession or similar)
   - Background sync when app launches
   - Offline queue

**Estimated Effort:** 6-8 weeks
- Backend development: 2-3 weeks
- API design & implementation: 1 week
- Mac integration: 1 week
- iPhone integration: 1 week
- Testing & deployment: 1-2 weeks

---

### Option 4: Extension of Current Backup System

**How it works:**
- Enhance existing backup/restore to support "sync folder"
- User manually exports to iCloud Drive folder
- Other device imports when needed
- Could add auto-import on file change detection

**Pros:**
- ✅ Minimal code changes (builds on existing backup)
- ✅ User controls when to sync
- ✅ No automatic sync complexity

**Cons:**
- ❌ Manual process (not seamless)
- ❌ Risk of overwriting changes
- ❌ Not a true sync solution

**Estimated Effort:** 1 week (just UI improvements)

---

## Recommendation

**For MVP / v1.0:** Option 1 (iCloud Drive File-Based Sync)

**Why:**
1. Builds on existing backup format
2. Zero infrastructure costs
3. User data stays on their devices
4. Reasonable implementation complexity
5. Works with Tauri (file system APIs available)

**For Future Enhancement:** Option 2 (CloudKit) if going fully native

**Migration Path:**
- Start with Option 1 (file-based sync)
- Can migrate to CloudKit later if needed
- Or keep file-based as the simpler solution

---

## Implementation Plan for iCloud Drive Sync

### Phase 1: Mac App (Tauri)

1. **Create sync utility** (`src/lib/sync.ts`):
   ```typescript
   - getSyncFilePath(): Promise<string>
   - readSyncFile(): Promise<BackupData | null>
   - writeSyncFile(data: BackupData): Promise<void>
   - watchSyncFile(callback: () => void): Promise<() => void> // unwatch
   ```

2. **Auto-save on changes**:
   - Hook into database write operations
   - Debounce sync writes (save every 5-10 seconds max)
   - Include device ID and timestamp in sync file

3. **Auto-import on file change**:
   - Watch iCloud Drive folder for changes
   - Merge incoming changes intelligently
   - Handle conflicts (last-write-wins or user choice)

4. **Tauri-specific**:
   - Use `@tauri-apps/api/path` for iCloud Drive path
   - Use `@tauri-apps/api/fs` for file operations
   - Use Tauri file watcher or polling

### Phase 2: iPhone App

**Option A: Native Swift/SwiftUI**
1. Use `FileManager` to access iCloud Drive
2. Use `NSMetadataQuery` to watch for changes
3. Store data in Core Data locally
4. Sync to/from iCloud Drive JSON file
5. Map Core Data ↔ Backup JSON format

**Option B: Capacitor (Reuse Web Code)**
1. Use Capacitor File System plugin
2. Use Capacitor Filesystem watcher
3. Reuse existing IndexedDB code
4. Sync to/from iCloud Drive JSON file

### Phase 3: Conflict Resolution

1. **Strategy: Timestamp-based with device priority**
   - Each sync file includes `lastModified` timestamp
   - Device with newer timestamp wins
   - For simultaneous edits, merge non-conflicting fields
   - User notification for conflicts requiring choice

2. **Merge Algorithm:**
   - Add new items (not in local)
   - Update existing items (newer timestamp)
   - Handle deletions carefully (tombstone markers)
   - For conflicts: merge arrays, use newer for single values

### Phase 4: Testing

1. Test sync with multiple devices
2. Test offline → online sync
3. Test simultaneous edits
4. Test large datasets
5. Test conflict scenarios

---

## Code Structure

```
src/
├── lib/
│   ├── backup.ts          # Existing backup/restore
│   ├── sync.ts            # NEW: iCloud Drive sync logic
│   └── sync-merger.ts     # NEW: Conflict resolution
└── stores/
    └── syncStore.ts       # NEW: Sync state management

For Tauri:
src-tauri/
├── src/
│   └── sync.rs            # Rust file watcher for iCloud Drive
└── Cargo.toml
```

---

## User Experience

1. **First Launch:**
   - Ask user to enable iCloud Drive sync
   - Create sync folder in iCloud Drive
   - Perform initial sync (upload existing data)

2. **Ongoing:**
   - Background sync every few seconds (when changes detected)
   - Subtle indicator when syncing
   - Notification if conflict detected

3. **Settings:**
   - Toggle sync on/off
   - Manual sync button
   - View last sync time
   - Conflict resolution preferences

---

## Effort Estimate Summary

| Option | Mac Implementation | iPhone Implementation | Total |
|--------|-------------------|----------------------|-------|
| iCloud Drive (File) | 3-5 days | 1-2 weeks | 2-3 weeks |
| CloudKit (Native) | 1-2 weeks | 1-2 weeks | 4-6 weeks |
| Custom Backend | 1 week | 1 week | 6-8 weeks |
| Manual Backup | 1-2 days | N/A | 1 week |
