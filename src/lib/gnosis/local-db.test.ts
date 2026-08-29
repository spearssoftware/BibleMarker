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
  closeSucceeds: true,
  /** Whether deleting the files actually yields a good copy. */
  deleteRepairs: true,
  /** Recorded `select` calls, in order. */
  selectCalls: [] as { sql: string; params?: unknown[] }[],
  /** Rows returned for the chapter entity-verse-index query. */
  entityVerseRows: [] as { kind: string; osis_ref: string }[],
}));

const NOT_A_DB = 'error returned from database: (code: 26) file is not a database';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    state.invocations.push({ cmd, args });
    // Deleting the files lets the following reinstall lay down a good copy.
    if (cmd === 'delete_gnosis_database' && state.deleteRepairs) {
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
    select: vi.fn(async (sql: string, params?: unknown[]) => {
      state.selectCalls.push({ sql, params });
      if (state.corrupt) throw new Error(NOT_A_DB);
      if (sql.includes('sqlite_master')) return [{ tables: state.tableCount }];
      if (sql.includes('gnosis_meta')) return [];
      if (sql.includes('chapter_timeline')) return [{ year: -4, year_display: '4 BC' }];
      if (sql.includes('person_verse')) return state.entityVerseRows;
      return [];
    }),
    close: vi.fn(async () => {
      state.closed += 1;
      return state.closeSucceeds;
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
  state.closeSucceeds = true;
  state.deleteRepairs = true;
  state.selectCalls = [];
  state.entityVerseRows = [];
});

describe('mapChapterEntityVerseIndexRows', () => {
  it('parses the verse number from the last osis_ref segment, per kind', async () => {
    const { mapChapterEntityVerseIndexRows } = await import('./local-db');
    const result = mapChapterEntityVerseIndexRows('Rom', 1, [
      { kind: 'person', osis_ref: 'Rom.1.1' },
      { kind: 'place', osis_ref: 'Rom.1.7' },
      { kind: 'person', osis_ref: 'Rom.1.13' },
    ]);
    expect(result).toEqual({
      book: 'Rom',
      chapter: 1,
      peopleVerses: [1, 13],
      placesVerses: [7],
    });
  });

  it('dedupes repeated verses and sorts ascending regardless of row order', async () => {
    const { mapChapterEntityVerseIndexRows } = await import('./local-db');
    const result = mapChapterEntityVerseIndexRows('Gen', 5, [
      { kind: 'person', osis_ref: 'Gen.5.20' },
      { kind: 'person', osis_ref: 'Gen.5.3' },
      { kind: 'person', osis_ref: 'Gen.5.3' },
      { kind: 'person', osis_ref: 'Gen.5.10' },
    ]);
    expect(result.peopleVerses).toEqual([3, 10, 20]);
    expect(result.placesVerses).toEqual([]);
  });

  it('ignores rows for kinds it does not track and unparsable refs', async () => {
    const { mapChapterEntityVerseIndexRows } = await import('./local-db');
    const result = mapChapterEntityVerseIndexRows('Gen', 1, [
      { kind: 'event', osis_ref: 'Gen.1.1' },
      { kind: 'person', osis_ref: 'Gen.1.NOPE' },
    ]);
    expect(result).toEqual({ book: 'Gen', chapter: 1, peopleVerses: [], placesVerses: [] });
  });
});

describe('getChapterEntityVerseIndex', () => {
  it('queries by osis_ref LIKE prefix for the chapter and maps the rows', async () => {
    state.entityVerseRows = [
      { kind: 'person', osis_ref: 'Gen.3.1' },
      { kind: 'place', osis_ref: 'Gen.3.8' },
    ];
    const db = await freshDb();

    await expect(db.getChapterEntityVerseIndex('Gen', 3)).resolves.toEqual({
      book: 'Gen',
      chapter: 3,
      peopleVerses: [1],
      placesVerses: [8],
    });

    const call = state.selectCalls.find(c => c.sql.includes('person_verse'));
    expect(call).toBeDefined();
    expect(call!.sql).toContain('v.osis_ref');
    expect(call!.sql).toContain('?1');
    expect(call!.params).toEqual(['Gen.3.%']);
  });
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

  it('rebuilds once per session, carrying the real cause into every failure', async () => {
    // A device that cannot be repaired: the rebuild runs but doesn't help.
    state.corrupt = true;
    state.deleteRepairs = false;
    const db = await freshDb();

    // The first failure names the underlying SQLite error…
    await expect(db.getChapterYear('Gen', 1)).rejects.toThrow(
      /after reinstalling.*file is not a database/
    );
    // …and the once-per-session guard repeats it instead of masking it, while
    // the expensive rebuild itself is not run again.
    await expect(db.getChapterYear('Gen', 1)).rejects.toThrow(
      /already rebuilt this session.*file is not a database/
    );
    await expect(db.getChapterYear('Gen', 1)).rejects.toThrow(/already rebuilt this session/);

    expect(commands().filter(c => c === 'delete_gnosis_database')).toHaveLength(1);
  });

  it('reports a close that fails, since the handle stays pooled', async () => {
    state.corrupt = true;
    state.closeSucceeds = false;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = await freshDb();

    await db.getChapterYear('Gen', 1).catch(() => null);

    expect(errors).toHaveBeenCalledWith(expect.stringContaining('Failed to close'));
    errors.mockRestore();
  });
});
