import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ChangeEntry, SyncEngineStatus } from './sync-engine'
import { TABLES_SYNCED_BEFORE_V12 } from './table-registry'

// Mock Tauri APIs before importing sync-engine
vi.mock('@tauri-apps/plugin-fs', () => ({
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  mkdir: vi.fn(),
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
  hasSyncWatermarks: vi.fn().mockResolvedValue(false),
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
      lastSyncTime: null,
      pendingChanges: 0,
      connectedDevices: [],
      error: null,
    }
    expect(status.state).toBe('disabled')
    expect(status.connectedDevices).toEqual([])
  })

  it('has correct shape for active sync state', () => {
    const status: SyncEngineStatus = {
      state: 'idle',
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
      hasSyncWatermarks: vi.fn().mockResolvedValue(false),
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

  it('transitions to signed-out when no account is signed in', async () => {
    vi.resetModules()

    vi.doMock('@tauri-apps/plugin-fs', () => ({
      readDir: vi.fn(),
      readTextFile: vi.fn(),
      mkdir: vi.fn(),
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
      hasSyncWatermarks: vi.fn().mockResolvedValue(false),
      getSyncConfig: vi.fn().mockResolvedValue(null),
      setSyncConfig: vi.fn().mockResolvedValue(undefined),
      applyRemoteChange: vi.fn().mockResolvedValue(true),
      sqliteExportAll: vi.fn(),
      SYNCED_TABLES: new Set(['annotations']),
    }))
    vi.doMock('./sync-account', () => ({
      getSignedInAccount: vi.fn().mockResolvedValue(null),
      clearLocalSession: vi.fn(),
      isSyncError: vi.fn().mockReturnValue(false),
    }))

    const { initSyncEngine, getSyncEngineStatus } = await import('./sync-engine')

    await initSyncEngine()

    const status = getSyncEngineStatus()
    expect(status.state).toBe('signed-out')
  })

  it('activates HTTP backend when account is present', async () => {
    vi.resetModules()

    const mockInvoke = vi.fn().mockResolvedValue([]) // sync_list returns empty

    vi.doMock('@tauri-apps/plugin-fs', () => ({
      readDir: vi.fn(),
      readTextFile: vi.fn(),
      mkdir: vi.fn(),
      remove: vi.fn(),
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: mockInvoke,
    }))
    vi.doMock('./sqlite-db', () => ({
      getSqliteDb: vi.fn().mockResolvedValue({ select: vi.fn().mockResolvedValue([{ max_seq: 0 }]) }),
      getDeviceId: vi.fn().mockReturnValue('device-aaaa-bbbb-cccc-ddddeeeeeeee'),
      getUnflushedChanges: vi.fn().mockResolvedValue([]),
      markChangesFlushed: vi.fn().mockResolvedValue(undefined),
      pruneChangeLog: vi.fn().mockResolvedValue(undefined),
      getSyncWatermark: vi.fn().mockResolvedValue(0),
      setSyncWatermark: vi.fn().mockResolvedValue(undefined),
      hasSyncWatermarks: vi.fn().mockResolvedValue(false),
      getSyncConfig: vi.fn().mockResolvedValue(null),
      setSyncConfig: vi.fn().mockResolvedValue(undefined),
      applyRemoteChange: vi.fn().mockResolvedValue(true),
      sqliteExportAll: vi.fn().mockResolvedValue({
        annotations: [], sectionHeadings: [], chapterTitles: [], notes: [],
        markingPresets: [], studies: [], multiTranslationViews: [],
        observationLists: [], timeExpressions: [],
        places: [], people: [], conclusions: [], interpretations: [],
        applications: [], preferences: null, entityNotes: [], keywordExclusions: [],
        readingPlans: [], readingPlanDays: [],
      }),
      SYNCED_TABLES: new Set(['annotations']),
    }))
    vi.doMock('./sync-account', () => ({
      getSignedInAccount: vi.fn().mockResolvedValue('account-123'),
      clearLocalSession: vi.fn(),
      isSyncError: vi.fn().mockReturnValue(false),
    }))

    const { initSyncEngine, getSyncEngineStatus } = await import('./sync-engine')

    await initSyncEngine()

    const status = getSyncEngineStatus()
    // After activating, engine is in idle or synced state (not signed-out)
    expect(status.state).not.toBe('signed-out')
    expect(status.state).not.toBe('disabled')
  })
})

describe('disableSync', () => {
  it('sets state to signed-out so the user can sign back in', async () => {
    vi.resetModules()

    const mockSetSyncConfig = vi.fn().mockResolvedValue(undefined)

    vi.doMock('@tauri-apps/plugin-fs', () => ({
      readDir: vi.fn(),
      readTextFile: vi.fn(),
      mkdir: vi.fn(),
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
      hasSyncWatermarks: vi.fn().mockResolvedValue(false),
      getSyncConfig: vi.fn().mockResolvedValue(null),
      setSyncConfig: mockSetSyncConfig,
      applyRemoteChange: vi.fn().mockResolvedValue(true),
      sqliteExportAll: vi.fn(),
      SYNCED_TABLES: new Set(['annotations']),
    }))

    const { disableSync, getSyncEngineStatus } = await import('./sync-engine')

    await disableSync()

    const status = getSyncEngineStatus()
    expect(status.state).toBe('signed-out')
    expect(status.connectedDevices).toEqual([])
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
      disableSync: vi.fn(),
      onSyncEngineStatusChange: vi.fn(),
      getSyncEngineStatus: vi.fn().mockReturnValue({
        state: 'disabled',
        lastSyncTime: null,
        pendingChanges: 0,
        connectedDevices: [],
        error: null,
      }),
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
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
      disableSync: vi.fn(),
      onSyncEngineStatusChange: vi.fn(),
      getSyncEngineStatus: vi.fn().mockReturnValue({
        state: 'disabled',
        lastSyncTime: null,
        pendingChanges: 0,
        connectedDevices: [],
        error: null,
      }),
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
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
      disableSync: vi.fn(),
      onSyncEngineStatusChange: vi.fn(),
      getSyncEngineStatus: vi.fn().mockReturnValue({
        state: 'idle',
        lastSyncTime: null,
        pendingChanges: 0,
        connectedDevices: [],
        error: null,
      }),
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
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
      disableSync: vi.fn(),
      onSyncEngineStatusChange: vi.fn(),
      getSyncEngineStatus: vi.fn().mockReturnValue({
        state: 'disabled',
        lastSyncTime: null,
        pendingChanges: 0,
        connectedDevices: [],
        error: null,
      }),
    }))
    vi.doMock('@tauri-apps/api/core', () => ({
      invoke: vi.fn(),
    }))

    const { getPendingConflicts, markPendingSync, clearPendingSync, decrementPendingSync } = await import('./sync')

    expect(getPendingConflicts()).toEqual([])
    expect(() => markPendingSync()).not.toThrow()
    expect(() => clearPendingSync()).not.toThrow()
    expect(() => decrementPendingSync()).not.toThrow()
  })
})

/**
 * Catch-up for synced tables this device did not know while it was on an older
 * version. The sync backend is an in-memory file map behind the mocked `invoke`,
 * and sqlite-db is a shared in-memory state, so a "phase" is one app launch:
 * modules are reloaded with a different set of known synced tables while the
 * remote files, watermarks, config and rows carry over.
 */
describe('catch-up on newly known synced tables', () => {
  const OWN = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
  const PEER = '11111111-2222-3333-4444-555555555555'
  const LEGACY = ['annotations']
  const FULL = [...LEGACY, 'reading_plans', 'reading_plan_days']

  const plan = { id: 'plan-1', days: 21, startDate: '2026-11-13', createdAt: '2026-11-13T09:00:00.000Z', updatedAt: '2026-11-13T09:00:00.000Z' }
  const day = { id: 'plan-1:1', planId: 'plan-1', day: 1, completedAt: '2026-11-13T10:00:00.000Z', updatedAt: '2026-11-13T10:00:00.000Z' }
  const ann = { id: 'a1', createdAt: '2026-11-12T09:00:00.000Z', updatedAt: '2026-11-12T09:00:00.000Z' }

  const remote = {
    files: new Map<string, string>(),
    failReadOnce: null as string | null,
    failAlways: null as string | null,
    afterList: null as ((prefix: string) => void) | null,
    reads: [] as string[],
    listed: [] as string[],
  }
  const local = {
    synced: new Set<string>(),
    watermarks: new Map<string, number>(),
    config: new Map<string, string>(),
    rows: new Map<string, { updated_at: string; data: string }>(),
    applied: [] as string[],
    watermarkWrites: [] as string[],
    maxSeq: 0,
  }

  const journal = (device: string, entries: object[]) => JSON.stringify({ version: 1, device, entries })
  const entry = (seq: number, ts: string, table: string, data: { id: string }) => ({
    seq, ts, device: PEER, table, op: 'upsert', id: data.id, data,
  })

  function invokeMock(command: string, args: { prefix?: string; key?: string; content?: string }): unknown {
    if (command === 'sync_list') {
      const base = args.prefix ? `${args.prefix}/` : ''
      const seen = new Map<string, boolean>()
      remote.listed.push(args.prefix ?? '')
      for (const key of remote.files.keys()) {
        if (!key.startsWith(base)) continue
        const rest = key.slice(base.length)
        const slash = rest.indexOf('/')
        seen.set(slash === -1 ? rest : rest.slice(0, slash), slash !== -1)
      }
      const listing = [...seen].map(([name, isDirectory]) => ({ name, isDirectory }))
      remote.afterList?.(args.prefix ?? '')
      return listing
    }
    if (command === 'sync_read') {
      remote.reads.push(args.key!)
      if (remote.failAlways === args.key) throw new Error('network down')
      if (remote.failReadOnce === args.key) {
        remote.failReadOnce = null
        throw new Error('network down')
      }
      return remote.files.get(args.key!) ?? null
    }
    if (command === 'sync_write') remote.files.set(args.key!, args.content!)
    if (command === 'sync_remove') remote.files.delete(args.key!)
    return null
  }

  /** One app launch: fresh modules that know `synced`, one sync, returned engine still running. */
  async function launch(synced: string[]) {
    local.synced = new Set(synced)
    vi.resetModules()
    // Earlier tests in this file replace the engine itself with a stub.
    vi.doUnmock('./sync-engine')
    vi.doMock('@tauri-apps/api/core', () => ({ invoke: vi.fn(async (c: string, a: object) => invokeMock(c, a)) }))
    vi.doMock('./sync-account', () => ({
      getSignedInAccount: vi.fn().mockResolvedValue('acct'),
      clearLocalSession: vi.fn(),
      isSyncError: vi.fn().mockReturnValue(false),
    }))
    vi.doMock('./sqlite-db', () => ({
      getSqliteDb: vi.fn().mockResolvedValue({ select: vi.fn(async () => [{ max_seq: local.maxSeq }]) }),
      getDeviceId: vi.fn().mockReturnValue(OWN),
      getUnflushedChanges: vi.fn().mockResolvedValue([]),
      markChangesFlushed: vi.fn(),
      pruneChangeLog: vi.fn(),
      sqliteExportAll: vi.fn().mockResolvedValue({}),
      getSyncWatermark: vi.fn(async (d: string) => local.watermarks.get(d) ?? 0),
      setSyncWatermark: vi.fn(async (d: string, seq: number) => {
        local.watermarkWrites.push(`${d}:${seq}`)
        local.watermarks.set(d, seq)
      }),
      hasSyncWatermarks: vi.fn(async () => local.watermarks.size > 0),
      getSyncConfig: vi.fn(async (k: string) => local.config.get(k) ?? null),
      setSyncConfig: vi.fn(async (k: string, v: string) => { local.config.set(k, v) }),
      applyRemoteChange: vi.fn(async (table: string, op: string, id: string, data: string | null, ts: string) => {
        const key = `${table}:${id}`
        const existing = local.rows.get(key)
        if (existing && existing.updated_at > ts) return false
        if (op === 'delete') local.rows.delete(key)
        else if (data) local.rows.set(key, { updated_at: ts, data })
        else return false
        local.applied.push(key)
        return true
      }),
      SYNCED_TABLES: local.synced,
    }))
    const engine = await import('./sync-engine')
    await engine.initSyncEngine()
    return engine
  }

  const peerJournal = () => journal(PEER, [
    entry(1, ann.updatedAt, 'annotations', ann),
    entry(2, plan.updatedAt, 'reading_plans', plan),
    entry(3, day.updatedAt, 'reading_plan_days', day),
  ])
  const caughtUp = () => JSON.parse(local.config.get('caught_up_tables') ?? '[]') as string[]

  beforeEach(() => {
    remote.files.clear()
    remote.failReadOnce = null
    remote.failAlways = null
    remote.afterList = null
    remote.reads = []
    remote.listed = []
    local.watermarks.clear()
    local.config.clear()
    local.rows.clear()
    local.applied = []
    local.watermarkWrites = []
    local.maxSeq = 0
    local.config.set('caught_up_tables', JSON.stringify(LEGACY))
    vi.stubGlobal('window', { dispatchEvent: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() })
    vi.spyOn(console, 'log').mockImplementation(() => {})
    // The device's own folder holds a plan too; it must never be replayed.
    remote.files.set(`${OWN}/0000000001.json`, journal(OWN, [entry(1, plan.updatedAt, 'reading_plans', { id: 'own' })]))
    remote.files.set(`${PEER}/0000000003.json`, peerJournal())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function syncPastThenUpgrade() {
    const old = await launch(LEGACY)
    await old.disableSync()
    // The old version moved its watermark past the entries of tables it did not know.
    expect(local.watermarks.get(PEER)).toBe(3)
    expect([...local.rows.keys()]).toEqual(['annotations:a1'])
    expect(caughtUp()).toEqual(LEGACY)
    local.applied = []
    local.watermarkWrites = []
  }

  it('gives an upgraded device the plan and day rows without touching watermarks', async () => {
    await syncPastThenUpgrade()

    const engine = await launch(FULL)
    await engine.disableSync()

    expect([...local.rows.keys()].sort()).toEqual(['annotations:a1', 'reading_plan_days:plan-1:1', 'reading_plans:plan-1'])
    expect(local.applied.sort()).toEqual(['reading_plan_days:plan-1:1', 'reading_plans:plan-1'])
    expect(caughtUp()).toEqual([...FULL].sort())
    expect(local.watermarkWrites).toEqual([])
    expect(local.watermarks.get(PEER)).toBe(3)
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ detail: { applied: 2, tables: expect.arrayContaining(['reading_plans', 'reading_plan_days']) } })
    )
  })

  it('gives the same result when the peer journal was compacted into a snapshot', async () => {
    await syncPastThenUpgrade()
    remote.files.delete(`${PEER}/0000000003.json`)
    const snapshot = (atSeq: number, plans: object[], days: object[]) => JSON.stringify({
      version: 1, device: PEER, atSeq, createdAt: '2026-11-14T00:00:00.000Z',
      tables: { annotations: [ann], readingPlans: plans, readingPlanDays: days },
    })
    // Names are not zero-padded: P_9 sorts after P_10 lexically but is the older snapshot.
    remote.files.set(`snapshots/${PEER}_9.json`, snapshot(9, [{ ...plan, id: 'stale' }], []))
    remote.files.set(`snapshots/${PEER}_10.json`, snapshot(10, [plan], [day]))

    const engine = await launch(FULL)
    await engine.disableSync()

    expect([...local.rows.keys()].sort()).toEqual(['annotations:a1', 'reading_plan_days:plan-1:1', 'reading_plans:plan-1'])
    expect(local.applied.sort()).toEqual(['reading_plan_days:plan-1:1', 'reading_plans:plan-1'])
    expect(caughtUp()).toEqual([...FULL].sort())
    expect(local.watermarkWrites).toEqual([])
  })

  it('leaves the tables unrecorded after a failure and recovers on a later sync', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    await syncPastThenUpgrade()
    remote.failReadOnce = `${PEER}/0000000003.json`

    const engine = await launch(FULL)
    expect(caughtUp()).toEqual(LEGACY)
    expect(local.applied).toEqual([])

    vi.advanceTimersByTime(60_000)
    await engine.sync()
    await engine.disableSync()
    vi.useRealTimers()

    expect([...local.rows.keys()].sort()).toEqual(['annotations:a1', 'reading_plan_days:plan-1:1', 'reading_plans:plan-1'])
    expect(caughtUp()).toEqual([...FULL].sort())
    expect(local.watermarkWrites).toEqual([])
  })

  it('does not replay anything for a device that already recorded every synced table', async () => {
    local.config.set('caught_up_tables', JSON.stringify(FULL))
    local.watermarks.set(PEER, 3)

    const engine = await launch(FULL)
    await engine.disableSync()

    expect(local.applied).toEqual([])
    expect(remote.listed).not.toContain('snapshots')
    expect(remote.reads.filter((key) => !key.endsWith('meta.json'))).toEqual([])
  })

  it.each([
    ['missing', null],
    ['unreadable', 'not json'],
  ])('treats a device with sync history and a %s record as knowing only the pre-v12 tables', async (_label, value) => {
    local.config.delete('caught_up_tables')
    if (value !== null) local.config.set('caught_up_tables', value)
    local.watermarks.set(PEER, 3)

    const engine = await launch(FULL)
    await engine.disableSync()

    expect([...local.rows.keys()].sort()).toEqual(['reading_plan_days:plan-1:1', 'reading_plans:plan-1'])
    expect(caughtUp()).toEqual([...TABLES_SYNCED_BEFORE_V12, 'reading_plan_days', 'reading_plans'].sort())
    expect(local.watermarkWrites).toEqual([])
  })

  it.each([
    ['missing', null],
    ['unreadable', 'not json'],
  ])('records every synced table without a replay when there is no sync history and the record is %s', async (_label, value) => {
    local.config.delete('caught_up_tables')
    if (value !== null) local.config.set('caught_up_tables', value)

    const engine = await launch(FULL)
    await engine.disableSync()

    expect(caughtUp()).toEqual([...FULL].sort())
    // The ordinary first pull applied everything once; a catch-up would have applied it again.
    expect(local.applied.sort()).toEqual(['annotations:a1', 'reading_plan_days:plan-1:1', 'reading_plans:plan-1'])
  })

  describe('newest change per row across peers', () => {
    const PEER2 = '66666666-7777-8888-9999-000000000000'
    const OLD = '2026-11-13T09:00:00.000Z'
    const NEW = '2026-11-13T12:00:00.000Z'
    const upsertAt = (device: string, ts: string) => journal(device, [entry(1, ts, 'reading_plans', { id: 'plan-1' })].map((e) => ({ ...e, device })))
    const deleteAt = (device: string, ts: string) => journal(device, [
      { seq: 1, ts, device, table: 'reading_plans', op: 'delete', id: 'plan-1' },
    ])
    const setPeers = (first: [string, string], second: [string, string]) => {
      // Both peers were already pulled by the old version, which skipped these entries.
      local.watermarks.set(PEER, 3)
      local.watermarks.set(PEER2, 3)
      remote.files.delete(`${PEER}/0000000003.json`)
      remote.files.set(`${first[0]}/0000000001.json`, first[1])
      remote.files.set(`${second[0]}/0000000001.json`, second[1])
    }

    it.each([
      ['the upserting peer is listed first', true],
      ['the deleting peer is listed first', false],
    ])('does not bring back a row another peer deleted later when %s', async (_label, upsertFirst) => {
      const up: [string, string] = [PEER, upsertAt(PEER, OLD)]
      const del: [string, string] = [PEER2, deleteAt(PEER2, NEW)]
      await syncPastThenUpgrade()
      if (upsertFirst) setPeers(up, del)
      else setPeers(del, up)

      const engine = await launch(FULL)
      await engine.disableSync()

      expect(local.rows.has('reading_plans:plan-1')).toBe(false)
      expect(caughtUp()).toEqual([...FULL].sort())
    })

    it('keeps a row whose upsert is newer than the other peer\'s delete', async () => {
      await syncPastThenUpgrade()
      setPeers([PEER2, deleteAt(PEER2, OLD)], [PEER, upsertAt(PEER, NEW)])

      const engine = await launch(FULL)
      await engine.disableSync()

      expect(local.rows.has('reading_plans:plan-1')).toBe(true)
    })

    it('lets a delete win a tie against an upsert', async () => {
      await syncPastThenUpgrade()
      setPeers([PEER, upsertAt(PEER, NEW)], [PEER2, deleteAt(PEER2, NEW)])

      const engine = await launch(FULL)
      await engine.disableSync()

      expect(local.rows.has('reading_plans:plan-1')).toBe(false)
    })

    it('applies a peer delete over an older upsert held in another peer\'s snapshot', async () => {
      await syncPastThenUpgrade()
      local.watermarks.set(PEER, 5)
      local.watermarks.set(PEER2, 3)
      remote.files.delete(`${PEER}/0000000003.json`)
      remote.files.set(`${PEER2}/0000000001.json`, deleteAt(PEER2, NEW))
      remote.files.set(`snapshots/${PEER}_5.json`, JSON.stringify({
        version: 1, device: PEER, atSeq: 5, createdAt: NEW,
        tables: { readingPlans: [{ id: 'plan-1', updatedAt: OLD }] },
      }))

      const engine = await launch(FULL)
      await engine.disableSync()

      expect(local.rows.has('reading_plans:plan-1')).toBe(false)
      expect(local.applied).toEqual(['reading_plans:plan-1']) // the delete only
    })

    it('does not apply a superseded upsert at all', async () => {
      await syncPastThenUpgrade()
      setPeers([PEER, upsertAt(PEER, OLD)], [PEER2, upsertAt(PEER2, NEW)])
      const engine = await launch(FULL)
      await engine.disableSync()

      expect(local.applied.filter((key) => key === 'reading_plans:plan-1')).toHaveLength(1)
      expect(local.rows.get('reading_plans:plan-1')?.updated_at).toBe(NEW)
    })
  })

  it('reads journals before snapshots, so a compaction in between loses nothing', async () => {
    await syncPastThenUpgrade()
    // Once the snapshots are listed, the peer compacts: its journal is replaced by a snapshot.
    remote.afterList = (prefix) => {
      if (prefix !== 'snapshots') return
      remote.afterList = null
      remote.files.delete(`${PEER}/0000000003.json`)
      remote.files.set(`snapshots/${PEER}_3.json`, JSON.stringify({
        version: 1, device: PEER, atSeq: 3, createdAt: '2026-11-14T00:00:00.000Z',
        tables: { readingPlans: [plan], readingPlanDays: [day] },
      }))
    }

    const engine = await launch(FULL)
    await engine.disableSync()

    expect([...local.rows.keys()].sort()).toEqual(['annotations:a1', 'reading_plan_days:plan-1:1', 'reading_plans:plan-1'])
    expect(caughtUp()).toEqual([...FULL].sort())
  })

  describe('retry delay after a failed catch-up', () => {
    const journalKey = `${PEER}/0000000003.json`
    const journalReads = () => remote.reads.filter((key) => key === journalKey).length
    const MINUTE = 60_000

    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-13T12:00:00.000Z'))
    })
    afterEach(() => vi.useRealTimers())

    it('skips the catch-up until the delay has passed, doubling it up to an hour', async () => {
      await syncPastThenUpgrade()
      remote.failAlways = journalKey
      const engine = await launch(FULL)

      let attempts = journalReads()
      for (const minutes of [1, 2, 4, 8, 16, 32, 60, 60]) {
        await engine.sync()
        expect(journalReads()).toBe(attempts) // still waiting
        vi.advanceTimersByTime(minutes * MINUTE - 1)
        await engine.sync()
        expect(journalReads()).toBe(attempts)
        vi.advanceTimersByTime(1)
        await engine.sync()
        expect(journalReads()).toBe(attempts + 1)
        attempts++
      }
      expect(caughtUp()).toEqual(LEGACY)

      remote.failAlways = null
      vi.advanceTimersByTime(60 * MINUTE)
      await engine.sync()
      await engine.disableSync()
      expect(caughtUp()).toEqual([...FULL].sort())
      expect(local.watermarkWrites).toEqual([])
    })

    it('still pulls ordinary changes while the catch-up waits', async () => {
      await syncPastThenUpgrade()
      remote.failAlways = journalKey
      const engine = await launch(FULL)
      const later = { id: 'a2', createdAt: '2026-11-13T09:00:00.000Z', updatedAt: '2026-11-13T09:00:00.000Z' }
      remote.files.set(`${PEER}/0000000004.json`, journal(PEER, [{ ...entry(4, later.updatedAt, 'annotations', later) }]))

      await engine.sync()
      await engine.disableSync()

      expect(local.rows.has('annotations:a2')).toBe(true)
    })

    it('starts over when the engine is initialised again', async () => {
      await syncPastThenUpgrade()
      remote.failAlways = journalKey
      const engine = await launch(FULL)
      const attempts = journalReads()

      await engine.disableSync()
      remote.failAlways = null
      await engine.initSyncEngine()
      await engine.disableSync()

      expect(journalReads()).toBeGreaterThan(attempts)
      expect(caughtUp()).toEqual([...FULL].sort())
    })
  })

  describe('snapshot choice by sequence', () => {
    const snapshot = (device: string, atSeq: number, record: { id: string; updatedAt: string }) => JSON.stringify({
      version: 1, device, atSeq, createdAt: '2026-11-14T00:00:00.000Z', tables: { annotations: [record] },
    })

    it('bootstraps a new peer from its highest-seq snapshot, not the last one in text order', async () => {
      remote.files.set(`snapshots/${PEER}_95.json`, snapshot(PEER, 95, { id: 'older', updatedAt: ann.updatedAt }))
      remote.files.set(`snapshots/${PEER}_120.json`, snapshot(PEER, 120, { id: 'newest', updatedAt: ann.updatedAt }))

      const engine = await launch(LEGACY)
      await engine.disableSync()

      expect([...local.rows.keys()]).toEqual(['annotations:newest'])
      expect(local.watermarks.get(PEER)).toBe(120)
    })

    it('keeps the highest-seq snapshot of a device when compaction cleans up', async () => {
      for (let seq = 2; seq <= 101; seq++) {
        remote.files.set(`${OWN}/${String(seq).padStart(10, '0')}.json`, journal(OWN, []))
      }
      remote.files.set(`snapshots/${OWN}_95.json`, snapshot(OWN, 95, { id: 'older', updatedAt: ann.updatedAt }))
      remote.files.set(`snapshots/${OWN}_120.json`, snapshot(OWN, 120, { id: 'newest', updatedAt: ann.updatedAt }))
      remote.files.set(`snapshots/${PEER}_7.json`, snapshot(PEER, 7, { id: 'peer', updatedAt: ann.updatedAt }))
      local.maxSeq = 100

      const engine = await launch(LEGACY)
      await engine.disableSync()

      expect([...remote.files.keys()].filter((key) => key.startsWith('snapshots/')).sort()).toEqual([
        `snapshots/${PEER}_7.json`,
        `snapshots/${OWN}_120.json`,
      ])
    })
  })
})
