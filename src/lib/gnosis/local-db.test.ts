import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for the gnosis-lite.db self-heal in local-db.ts.
 *
 * The scenario that matters: a device whose copy of the DB is damaged, or is
 * shadowed by a stale -wal/-shm pair, reads back as "file is not a database".
 * install_bundled_module alone can't fix that — it skips a file whose hash
 * already matches the bundled copy — so the DB has to be deleted and reinstalled.
 */

const state = vi.hoisted(() => ({
  /** select() throws like SQLite does on a damaged file. */
  corrupt: false,
  /** Tables visible in sqlite_master; 0 models a fresh empty DB. */
  tableCount: 12,
  /** Database.load() itself fails. */
  loadThrows: false,
  /** Recorded `invoke` calls, in order. */
  invocations: [] as { cmd: string; args?: Record<string, unknown> }[],
  closed: 0,
}));

const NOT_A_DB = 'error returned from database: (code: 26) file is not a database';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    state.invocations.push({ cmd, args });
    // Deleting the files lets the following reinstall lay down a good copy.
    if (cmd === 'delete_gnosis_database') {
      state.corrupt = false;
      state.tableCount = 12;
    }
    return null;
  }),
}));

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: vi.fn(async () => '/data'),
  join: vi.fn(async (...parts: string[]) => parts.join('/')),
}));

vi.mock('@tauri-apps/plugin-sql', () => {
  const fakeDb = {
    select: vi.fn(async (sql: string) => {
      if (state.corrupt) throw new Error(NOT_A_DB);
      if (sql.includes('sqlite_master')) return [{ tables: state.tableCount }];
      if (sql.includes('gnosis_meta')) return [];
      if (sql.includes('chapter_timeline')) return [{ year: -4, year_display: '4 BC' }];
      return [];
    }),
    close: vi.fn(async () => {
      state.closed += 1;
      return true;
    }),
  };
  return {
    default: {
      load: vi.fn(async () => {
        if (state.loadThrows) throw new Error(NOT_A_DB);
        return fakeDb;
      }),
    },
  };
});

/** Fresh module each time — the DB handle is memoized at module scope. */
async function freshDb() {
  vi.resetModules();
  const { GnosisLocalDb } = await import('./local-db');
  return new GnosisLocalDb();
}

const commands = () => state.invocations.map(i => i.cmd);

beforeEach(() => {
  state.corrupt = false;
  state.tableCount = 12;
  state.loadThrows = false;
  state.invocations = [];
  state.closed = 0;
});

describe('gnosis local DB self-heal', () => {
  it('installs once and does not delete anything when the DB is readable', async () => {
    const db = await freshDb();
    await expect(db.getChapterYear('Gen', 1)).resolves.toEqual({ year: -4, yearDisplay: '4 BC' });

    expect(commands()).toEqual(['install_bundled_module']);
    expect(state.closed).toBe(0);
  });

  it('deletes and reinstalls when the DB reads back as corrupt', async () => {
    state.corrupt = true;
    const db = await freshDb();

    await expect(db.getChapterYear('Gen', 1)).resolves.toEqual({ year: -4, yearDisplay: '4 BC' });

    expect(commands()).toEqual([
      'install_bundled_module',
      'delete_gnosis_database',
      'install_bundled_module',
    ]);
    // The unusable handle must be closed before its files are deleted.
    expect(state.closed).toBe(1);
  });

  it('rebuilds a DB that opens but has no tables', async () => {
    state.tableCount = 0;
    const db = await freshDb();

    await expect(db.getChapterYear('Gen', 1)).resolves.not.toBeNull();
    expect(commands()).toContain('delete_gnosis_database');
  });

  it('rebuilds when the DB cannot even be opened', async () => {
    state.loadThrows = true;
    const db = await freshDb();

    // load() keeps throwing, so recovery is attempted and then reported.
    await expect(db.getChapterYear('Gen', 1)).rejects.toThrow(/unreadable even after reinstalling/);
    expect(commands()).toContain('delete_gnosis_database');
  });

  it('retries initialization on a later call instead of caching the failure', async () => {
    state.loadThrows = true;
    const db = await freshDb();
    await expect(db.getChapterYear('Gen', 1)).rejects.toThrow();

    // Whatever was wrong with the device is now resolved.
    state.loadThrows = false;
    await expect(db.getChapterYear('Gen', 1)).resolves.not.toBeNull();
  });
});
