import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ChangeEntry, SyncEngineStatus } from './sync-engine'

// Mock Tauri APIs before importing sync-engine
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  mkdir: vi.fn(),
  exists: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

vi.mock('./sqlite-db', () => ({
  getSqliteDb: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]) }),
  getDeviceId: vi.fn().mockReturnValue('device-aaaa-bbbb-cccc-ddddeeeeeeee'),
  getUnflushedChanges: vi.fn().mockResolvedValue([]),
  markChangesFlushed: vi.fn().mockResolvedValue(undefined),
  pruneChangeLog: vi.fn().mockResolvedValue(undefined),
  getSyncWatermark: vi.fn().mockResolvedValue(0),
  setSyncWatermark: vi.fn().mockResolvedValue(undefined),
  getSyncConfig: vi.fn().mockResolvedValue(null),
  setSyncConfig: vi.fn().mockResolvedValue(undefined),
  applyRemoteChange: vi.fn().mockResolvedValue(true),
  sqliteExportAll: vi.fn().mockResolvedValue({
    annotations: [], sectionHeadings: [], chapterTitles: [], notes: [],
    markingPresets: [], studies: [], multiTranslationViews: [],
    observationLists: [], timeExpressions: [],
    places: [], people: [], conclusions: [], interpretations: [],
    applications: [], preferences: null,
  }),
  SYNCED_TABLES: new Set([
    'annotations', 'section_headings', 'chapter_titles', 'notes',
    'marking_presets', 'studies', 'multi_translation_views',
    'observation_lists', 'time_expressions',
    'places', 'people', 'conclusions', 'interpretations', 'applications', 'preferences',
  ]),
}))

describe('ChangeEntry type', () => {
  it('represents a valid upsert entry', () => {
    const entry: ChangeEntry = {
      seq: 1,
      ts: '2025-01-01T00:00:00.000Z',
      device: 'device-123',
      table: 'annotations',
      op: 'upsert',
      id: 'ann-1',
      data: { id: 'ann-1', type: 'highlight', color: 'yellow' },
    }
    expect(entry.op).toBe('upsert')
    expect(entry.data).toBeDefined()
  })

  it('represents a valid delete entry', () => {
    const entry: ChangeEntry = {
      seq: 2,
      ts: '2025-01-01T00:00:01.000Z',
      device: 'device-123',
      table: 'annotations',
      op: 'delete',
      id: 'ann-1',
    }
    expect(entry.op).toBe('delete')
    expect(entry.data).toBeUndefined()
  })
})

describe('SyncEngineStatus', () => {
  it('has correct shape for disabled state', () => {
    const status: SyncEngineStatus = {
      state: 'disabled',
      syncFolderPath: null,
      lastSyncTime: null,
      pendingChanges: 0,
      connectedDevices: [],
      error: null,
    }
    expect(status.state).toBe('disabled')
    expect(status.syncFolderPath).toBeNull()
  })

  it('has correct shape for active sync state', () => {
    const status: SyncEngineStatus = {
      state: 'idle',
      syncFolderPath: '/path/to/sync',
      lastSyncTime: '2025-01-01T00:00:00.000Z',
      pendingChanges: 3,
      connectedDevices: ['Mac', 'iPhone'],
      error: null,
    }
    expect(status.connectedDevices).toHaveLength(2)
    expect(status.pendingChanges).toBe(3)
  })
})

describe('sync engine status listener', () => {
  let onSyncEngineStatusChange: typeof import('./sync-engine').onSyncEngineStatusChange
  let getSyncEngineStatus: typeof import('./sync-engine').getSyncEngineStatus

  beforeEach(async () => {
    vi.resetModules()

    // Re-mock after resetModules
    vi.doMock('@tauri-apps/plugin-fs', () => ({
      readDir: vi.fn(),
      readTextFile: vi.fn(),
      mkdir: vi.fn(),
      exists: vi.fn(),
      remove: vi.fn(),
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
    }))
    vi.doMock('./sqlite-db', () => ({
      getSqliteDb: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]) }),
      getDeviceId: vi.fn().mockReturnValue('device-aaaa-bbbb-cccc-ddddeeeeeeee'),
      getUnflushedChanges: vi.fn().mockResolvedValue([]),
      markChangesFlushed: vi.fn().mockResolvedValue(undefined),
      pruneChangeLog: vi.fn().mockResolvedValue(undefined),
      getSyncWatermark: vi.fn().mockResolvedValue(0),
      setSyncWatermark: vi.fn().mockResolvedValue(undefined),
      getSyncConfig: vi.fn().mockResolvedValue(null),
      setSyncConfig: vi.fn().mockResolvedValue(undefined),
      applyRemoteChange: vi.fn().mockResolvedValue(true),
      sqliteExportAll: vi.fn().mockResolvedValue({
        annotations: [], sectionHeadings: [], chapterTitles: [], notes: [],
        markingPresets: [], studies: [], multiTranslationViews: [],
        observationLists: [], timeExpressions: [],
        places: [], people: [], conclusions: [], interpretations: [],
        applications: [], preferences: null,
      }),
      SYNCED_TABLES: new Set([
        'annotations', 'section_headings', 'chapter_titles', 'notes',
        'marking_presets', 'studies', 'multi_translation_views',
        'observation_lists', 'time_expressions',
        'places', 'people', 'conclusions', 'interpretations', 'applications', 'preferences',
      ]),
    }))

    const mod = await import('./sync-engine')
    onSyncEngineStatusChange = mod.onSyncEngineStatusChange
    getSyncEngineStatus = mod.getSyncEngineStatus
  })

  it('returns initial status as disabled', () => {
    const status = getSyncEngineStatus()
    expect(status.state).toBe('disabled')
    expect(status.syncFolderPath).toBeNull()
    expect(status.connectedDevices).toEqual([])
  })

  it('notifies listener with current status on subscribe', () => {
    const listener = vi.fn()
    onSyncEngineStatusChange(listener)
    expect(listener).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ state: 'disabled' }))
  })

  it('returns unsubscribe function', () => {
    const listener = vi.fn()
    const unsubscribe = onSyncEngineStatusChange(listener)
    expect(typeof unsubscribe).toBe('function')
    unsubscribe()
    // After unsubscribe, listener count check is implicit — no errors thrown
  })

  it('returns a defensive copy of status', () => {
    const status1 = getSyncEngineStatus()
    const status2 = getSyncEngineStatus()
    expect(status1).toEqual(status2)
    expect(status1).not.toBe(status2) // different object references
  })
})

describe('initSyncEngine', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('initializes with disabled state when no sync folder configured', async () => {
    vi.resetModules()

    vi.doMock('@tauri-apps/plugin-fs', () => ({
      readDir: vi.fn(),
      readTextFile: vi.fn(),
      mkdir: vi.fn(),
      exists: vi.fn(),
      remove: vi.fn(),
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
    }))
    vi.doMock('./sqlite-db', () => ({
      getSqliteDb: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]) }),
      getDeviceId: vi.fn().mockReturnValue('device-aaaa-bbbb-cccc-ddddeeeeeeee'),
      getUnflushedChanges: vi.fn().mockResolvedValue([]),
      markChangesFlushed: vi.fn().mockResolvedValue(undefined),
      pruneChangeLog: vi.fn().mockResolvedValue(undefined),
      getSyncWatermark: vi.fn().mockResolvedValue(0),
      setSyncWatermark: vi.fn().mockResolvedValue(undefined),
      getSyncConfig: vi.fn().mockResolvedValue(null),
      setSyncConfig: vi.fn().mockResolvedValue(undefined),
      applyRemoteChange: vi.fn().mockResolvedValue(true),
      sqliteExportAll: vi.fn(),
      SYNCED_TABLES: new Set(['annotations']),
    }))

    const { initSyncEngine, getSyncEngineStatus } = await import('./sync-engine')

    await initSyncEngine()

    const status = getSyncEngineStatus()
    expect(status.state).toBe('disabled')
    expect(status.syncFolderPath).toBeNull()
  })

  it('transitions to no-folder when configured folder does not exist', async () => {
    vi.resetModules()

    const mockExists = vi.fn().mockResolvedValue(false)

    vi.doMock('@tauri-apps/plugin-fs', () => ({
      readDir: vi.fn(),
      readTextFile: vi.fn(),
      mkdir: vi.fn(),
      exists: mockExists,
      remove: vi.fn(),
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
    }))
    vi.doMock('./sqlite-db', () => ({
      getSqliteDb: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]) }),
      getDeviceId: vi.fn().mockReturnValue('device-aaaa-bbbb-cccc-ddddeeeeeeee'),
      getUnflushedChanges: vi.fn().mockResolvedValue([]),
      markChangesFlushed: vi.fn().mockResolvedValue(undefined),
      pruneChangeLog: vi.fn().mockResolvedValue(undefined),
      getSyncWatermark: vi.fn().mockResolvedValue(0),
      setSyncWatermark: vi.fn().mockResolvedValue(undefined),
      getSyncConfig: vi.fn().mockImplementation((key: string) => {
        if (key === 'sync_folder_path') return '/iCloud/BibleMarker'
        if (key === 'sync_enabled') return 'true'
        return null
      }),
      setSyncConfig: vi.fn().mockResolvedValue(undefined),
      applyRemoteChange: vi.fn().mockResolvedValue(true),
      sqliteExportAll: vi.fn(),
      SYNCED_TABLES: new Set(['annotations']),
    }))

    const { initSyncEngine, getSyncEngineStatus } = await import('./sync-engine')

    await initSyncEngine()

    const status = getSyncEngineStatus()
    expect(status.state).toBe('no-folder')
    expect(status.syncFolderPath).toBe('/iCloud/BibleMarker')
    expect(status.error).toBe('Sync folder not found')
  })
})

describe('disableSync', () => {
  it('sets state to disabled and clears folder path', async () => {
    vi.resetModules()

    const mockSetSyncConfig = vi.fn().mockResolvedValue(undefined)

    vi.doMock('@tauri-apps/plugin-fs', () => ({
      readDir: vi.fn(),
      readTextFile: vi.fn(),
      mkdir: vi.fn(),
      exists: vi.fn(),
      remove: vi.fn(),
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
    }))
    vi.doMock('./sqlite-db', () => ({
      getSqliteDb: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([]) }),
      getDeviceId: vi.fn().mockReturnValue('device-aaaa-bbbb-cccc-ddddeeeeeeee'),
      getUnflushedChanges: vi.fn().mockResolvedValue([]),
      markChangesFlushed: vi.fn().mockResolvedValue(undefined),
      pruneChangeLog: vi.fn().mockResolvedValue(undefined),
      getSyncWatermark: vi.fn().mockResolvedValue(0),
      setSyncWatermark: vi.fn().mockResolvedValue(undefined),
      getSyncConfig: vi.fn().mockResolvedValue(null),
      setSyncConfig: mockSetSyncConfig,
      applyRemoteChange: vi.fn().mockResolvedValue(true),
      sqliteExportAll: vi.fn(),
      SYNCED_TABLES: new Set(['annotations']),
    }))

    const { disableSync, getSyncEngineStatus } = await import('./sync-engine')

    await disableSync()

    const status = getSyncEngineStatus()
    expect(status.state).toBe('disabled')
    expect(status.syncFolderPath).toBeNull()
    expect(status.connectedDevices).toEqual([])
    expect(mockSetSyncConfig).toHaveBeenCalledWith('sync_enabled', 'false')
  })
})

describe('sync.ts state mapping', () => {
  // Test the public sync.ts wrapper functions that map engine state to UI state
  // These are pure functions already tested in sync.test.ts for message/icon,
  // but we can also verify the listener bridging and getSyncStatus

  it('getSyncStatus returns defensive copy', async () => {
    vi.resetModules()

    vi.doMock('./sync-engine', () => ({
      initSyncEngine: vi.fn(),
      stopSyncEngine: vi.fn(),
      sync: vi.fn(),
      configureSyncFolder: vi.fn(),
      disableSync: vi.fn(),
      onSyncEngineStatusChange: vi.fn(),
      getSyncEngineStatus: vi.fn().mockReturnValue({
        state: 'disabled',
        syncFolderPath: null,
        lastSyncTime: null,
        pendingChanges: 0,
        connectedDevices: [],
        error: null,
      }),
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
    }))
    vi.doMock('./platform', () => ({
      isApplePlatform: vi.fn().mockReturnValue(false),
      isIOS: vi.fn().mockReturnValue(false),
    }))

    const { getSyncStatus } = await import('./sync')
    const s1 = getSyncStatus()
    const s2 = getSyncStatus()
    expect(s1).toEqual(s2)
    expect(s1).not.toBe(s2)
  })

  it('triggerSync returns false on error', async () => {
    vi.resetModules()

    vi.doMock('./sync-engine', () => ({
      initSyncEngine: vi.fn(),
      stopSyncEngine: vi.fn(),
      sync: vi.fn().mockRejectedValue(new Error('sync failed')),
      configureSyncFolder: vi.fn(),
      disableSync: vi.fn(),
      onSyncEngineStatusChange: vi.fn(),
      getSyncEngineStatus: vi.fn().mockReturnValue({
        state: 'disabled',
        syncFolderPath: null,
        lastSyncTime: null,
        pendingChanges: 0,
        connectedDevices: [],
        error: null,
      }),
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
    }))
    vi.doMock('./platform', () => ({
      isApplePlatform: vi.fn().mockReturnValue(false),
      isIOS: vi.fn().mockReturnValue(false),
    }))

    const { triggerSync } = await import('./sync')
    const result = await triggerSync()
    expect(result).toBe(false)
  })

  it('triggerSync returns true on success', async () => {
    vi.resetModules()

    vi.doMock('./sync-engine', () => ({
      initSyncEngine: vi.fn(),
      stopSyncEngine: vi.fn(),
      sync: vi.fn().mockResolvedValue(undefined),
      configureSyncFolder: vi.fn(),
      disableSync: vi.fn(),
      onSyncEngineStatusChange: vi.fn(),
      getSyncEngineStatus: vi.fn().mockReturnValue({
        state: 'idle',
        syncFolderPath: '/sync',
        lastSyncTime: null,
        pendingChanges: 0,
        connectedDevices: [],
        error: null,
      }),
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
    }))
    vi.doMock('./platform', () => ({
      isApplePlatform: vi.fn().mockReturnValue(false),
      isIOS: vi.fn().mockReturnValue(false),
    }))

    const { triggerSync } = await import('./sync')
    const result = await triggerSync()
    expect(result).toBe(true)
  })

  it('deprecated functions are safe no-ops', async () => {
    vi.resetModules()

    vi.doMock('./sync-engine', () => ({
      initSyncEngine: vi.fn(),
      stopSyncEngine: vi.fn(),
      sync: vi.fn(),
      configureSyncFolder: vi.fn(),
      disableSync: vi.fn(),
      onSyncEngineStatusChange: vi.fn(),
      getSyncEngineStatus: vi.fn().mockReturnValue({
        state: 'disabled',
        syncFolderPath: null,
        lastSyncTime: null,
        pendingChanges: 0,
        connectedDevices: [],
        error: null,
      }),
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
    }))
    vi.doMock('./platform', () => ({
      isApplePlatform: vi.fn().mockReturnValue(false),
      isIOS: vi.fn().mockReturnValue(false),
    }))

    const { getPendingConflicts, markPendingSync, clearPendingSync, decrementPendingSync } = await import('./sync')

    expect(getPendingConflicts()).toEqual([])
    expect(() => markPendingSync()).not.toThrow()
    expect(() => clearPendingSync()).not.toThrow()
    expect(() => decrementPendingSync()).not.toThrow()
  })
})
