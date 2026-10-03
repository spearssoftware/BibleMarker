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
  /** Remaining install_bundled_module calls that should throw. */
  installFailures: 0,
  /** Rows returned for the chapter cross-reference-index query. */
  crossRefRows: [] as { from_ref: string; to_start: string; to_end: string | null; votes: number }[],
  /** Rows returned for the chapter people / places / events / spread queries. */
  peopleRows: [] as { slug: string; name: string; osis_ref: string }[],
  placeRows: [] as {
    slug: string;
    name: string;
    latitude: number | null;
    longitude: number | null;
    osis_ref: string;
  }[],
  eventRows: [] as {
    slug: string;
    title: string;
    start_year_display: string | null;
    sort_key: number | null;
    osis_ref: string;
  }[],
  participantRows: [] as { event_slug: string; slug: string; name: string }[],
  spreadRows: [] as { slug: string; osis_ref: string }[],
}));

const NOT_A_DB = 'error returned from database: (code: 26) file is not a database';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async (cmd: string, args?: Record<string, unknown>) => {
    state.invocations.push({ cmd, args });
    if (cmd === 'install_bundled_module' && state.installFailures > 0) {
      state.installFailures -= 1;
      throw new Error('Failed to install gnosis-lite.db: transient I/O error');
    }
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
      // The chapter-data queries also touch person_verse / place_verse, so
      // each is matched on a fragment unique to it, above the generic branch.
      if (sql.includes('SELECT p.slug, p.name, v.osis_ref')) return state.peopleRows;
      if (sql.includes('pl.latitude')) return state.placeRows;
      if (sql.includes('e.sort_key')) return state.eventRows;
      if (sql.includes('FROM event_participant')) return state.participantRows;
      if (sql.includes('p.slug IN')) return state.spreadRows;
      if (sql.includes('person_verse')) return state.entityVerseRows;
      if (sql.includes('cross_reference')) {
        // Actually filter by the params the caller passed, rather than
        // handing back state.crossRefRows unconditionally — otherwise a caller
        // regression that sends the wrong prefix/minVotes would still pass
        // the `params` assertion in the getChapterCrossRefIndex test below,
        // since that assertion would be checking a value nothing downstream
        // depends on.
        const prefix = typeof params?.[0] === 'string' ? params[0].replace(/%$/, '') : '';
        const minVotes = typeof params?.[1] === 'number' ? params[1] : -Infinity;
        return state.crossRefRows.filter((r) => r.from_ref.startsWith(prefix) && r.votes >= minVotes);
      }
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
  state.installFailures = 0;
  state.crossRefRows = [];
  state.peopleRows = [];
  state.placeRows = [];
  state.eventRows = [];
  state.participantRows = [];
  state.spreadRows = [];
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

describe('mapChapterCrossRefIndexRows — dedupe, sort, ranges', () => {
  it.each([
    [
      'higher-voted row arrives first',
      [
        { from_ref: 'Heb.1.5', to_start: 'Ps.2.7', to_end: null, votes: 40 },
        { from_ref: 'Heb.1.5', to_start: 'Ps.89.27', to_end: null, votes: 15 },
      ],
    ],
    [
      'lower-voted row arrives first',
      [
        { from_ref: 'Heb.1.5', to_start: 'Ps.89.27', to_end: null, votes: 15 },
        { from_ref: 'Heb.1.5', to_start: 'Ps.2.7', to_end: null, votes: 40 },
      ],
    ],
  ])('keeps the highest-voted cross-reference per source verse regardless of row order (%s)', async (_label, rows) => {
    const { mapChapterCrossRefIndexRows } = await import('./local-db');
    const result = mapChapterCrossRefIndexRows('Heb', 1, rows);
    expect(result.crossRefs).toEqual([{ verse: 5, targetRef: 'Ps.2.7', targetEndRef: null, votes: 40 }]);
  });

  it('sorts cross-references by verse ascending regardless of row order', async () => {
    const { mapChapterCrossRefIndexRows } = await import('./local-db');
    const result = mapChapterCrossRefIndexRows('Heb', 1, [
      { from_ref: 'Heb.1.8', to_start: 'Ps.45.6', to_end: 'Ps.45.7', votes: 30 },
      { from_ref: 'Heb.1.5', to_start: 'Ps.2.7', to_end: null, votes: 40 },
    ]);
    expect(result.crossRefs.map((e) => e.verse)).toEqual([5, 8]);
  });

  it('drops rows whose target is not older, keeping the older ones alongside', async () => {
    // Wiring guard: every other fixture here is NT->OT, so without this case
    // deleting the mapper's isOlderTarget filter would leave the suite green.
    const { mapChapterCrossRefIndexRows } = await import('./local-db');
    const result = mapChapterCrossRefIndexRows('Heb', 1, [
      { from_ref: 'Heb.1.3', to_start: 'Col.1.15', to_end: null, votes: 63 }, // NT -> NT
      { from_ref: 'Heb.1.5', to_start: 'Heb.5.5', to_end: null, votes: 50 }, // same book
      { from_ref: 'Heb.1.7', to_start: 'Ps.104.4', to_end: null, votes: 37 }, // NT -> OT
    ]);
    expect(result.crossRefs).toEqual([
      { verse: 7, targetRef: 'Ps.104.4', targetEndRef: null, votes: 37 },
    ]);
  });

  it('preserves targetEndRef for range cross-references', async () => {
    const { mapChapterCrossRefIndexRows } = await import('./local-db');
    const result = mapChapterCrossRefIndexRows('Heb', 1, [
      { from_ref: 'Heb.1.8', to_start: 'Ps.45.6', to_end: 'Ps.45.7', votes: 30 },
    ]);
    expect(result.crossRefs[0]).toEqual({ verse: 8, targetRef: 'Ps.45.6', targetEndRef: 'Ps.45.7', votes: 30 });
  });
});

describe('getChapterCrossRefIndex', () => {
  it('queries via from_verse_id IN (SELECT ...), LEFT JOINs the range end, orders by votes then ref, and has no LIMIT', async () => {
    state.crossRefRows = [{ from_ref: 'John.1.1', to_start: 'Gen.1.1', to_end: null, votes: 276 }];
    const db = await freshDb();

    await expect(db.getChapterCrossRefIndex('John', 1, 20)).resolves.toEqual({
      book: 'John',
      chapter: 1,
      crossRefs: [{ verse: 1, targetRef: 'Gen.1.1', targetEndRef: null, votes: 276 }],
    });

    // SQL-shape assertions for the perf-critical query form — see the
    // getChapterCrossRefIndex doc comment in local-db.ts for the rationale.
    const call = state.selectCalls.find((c) => c.sql.includes('cross_reference'));
    expect(call).toBeDefined();
    expect(call!.sql).toContain('cr.from_verse_id IN (SELECT id FROM verse WHERE osis_ref LIKE ?1)');
    expect(call!.sql).toContain('LEFT JOIN verse ve ON cr.to_verse_end_id = ve.id');
    expect(call!.sql).toContain('ORDER BY cr.votes DESC, vs.osis_ref');
    expect(call!.sql).not.toMatch(/LIMIT/i);
    expect(call!.params).toEqual(['John.1.%', 20]);
  });
});

describe('chapterRange', () => {
  it('bounds osis_ref between "Book.N." and "Book.N/" so only that chapter matches', async () => {
    const { chapterRange } = await import('./local-db');
    const { params } = chapterRange('Gen', 12);
    expect(params).toEqual(['Gen.12.', 'Gen.12/']);
    expect('Gen.12.1' >= params[0] && 'Gen.12.1' < params[1]).toBe(true);
    expect('Gen.12.20' >= params[0] && 'Gen.12.20' < params[1]).toBe(true);
    expect('Gen.120.1' >= params[0] && 'Gen.120.1' < params[1]).toBe(false);
    expect('Gen.1.12' >= params[0] && 'Gen.1.12' < params[1]).toBe(false);
  });
});

describe('mapChapterPeopleRows', () => {
  it('groups verses per person and sorts by verse count, name, slug', async () => {
    const { mapChapterPeopleRows } = await import('./local-db');
    const result = mapChapterPeopleRows([
      { slug: 'sarai', name: 'Sarai', osis_ref: 'Gen.12.5' },
      { slug: 'abram', name: 'Abram', osis_ref: 'Gen.12.4' },
      { slug: 'abram', name: 'Abram', osis_ref: 'Gen.12.1' },
      { slug: 'pharaoh-2', name: 'Pharaoh', osis_ref: 'Gen.12.15' },
      { slug: 'pharaoh-1', name: 'Pharaoh', osis_ref: 'Gen.12.18' },
      { slug: 'bad', name: 'Bad', osis_ref: 'Gen.12.NOPE' },
    ]);
    expect(result).toEqual([
      { slug: 'abram', name: 'Abram', verses: [1, 4] },
      { slug: 'pharaoh-1', name: 'Pharaoh', verses: [18] },
      { slug: 'pharaoh-2', name: 'Pharaoh', verses: [15] },
      { slug: 'sarai', name: 'Sarai', verses: [5] },
    ]);
  });
});

describe('mapChapterPlaceRows', () => {
  it('excludes places without coordinates and groups verses', async () => {
    const { mapChapterPlaceRows } = await import('./local-db');
    const result = mapChapterPlaceRows([
      { slug: 'shechem', name: 'Shechem', latitude: 32.2, longitude: 35.3, osis_ref: 'Gen.12.7' },
      { slug: 'shechem', name: 'Shechem', latitude: 32.2, longitude: 35.3, osis_ref: 'Gen.12.6' },
      { slug: 'nowhere', name: 'Nowhere', latitude: null, longitude: null, osis_ref: 'Gen.12.1' },
      { slug: 'half', name: 'Half', latitude: 1, longitude: null, osis_ref: 'Gen.12.2' },
    ]);
    expect(result).toEqual([
      { slug: 'shechem', name: 'Shechem', latitude: 32.2, longitude: 35.3, verses: [6, 7] },
    ]);
  });
});

describe('mapChapterEventRows', () => {
  it('breaks the Genesis 12 sort_key tie by slug, puts null keys last, and attaches participants', async () => {
    const { mapChapterEventRows } = await import('./local-db');
    const result = mapChapterEventRows(
      [
        { slug: 'undated', title: 'Undated', start_year_display: null, sort_key: null, osis_ref: 'Gen.12.2' },
        { slug: 'abrahamic-covenant', title: 'Abrahamic Covenant', start_year_display: '2091 BC', sort_key: 5, osis_ref: 'Gen.12.3' },
        { slug: 'abraham-enters-canaan', title: 'Abraham Enters Canaan', start_year_display: '2091 BC', sort_key: 5, osis_ref: 'Gen.12.5' },
        { slug: 'abraham-enters-canaan', title: 'Abraham Enters Canaan', start_year_display: '2091 BC', sort_key: 5, osis_ref: 'Gen.12.4' },
        { slug: 'earlier', title: 'Earlier', start_year_display: null, sort_key: 1, osis_ref: 'Gen.12.1' },
      ],
      [
        { event_slug: 'abraham-enters-canaan', slug: 'sarai', name: 'Sarai' },
        { event_slug: 'abraham-enters-canaan', slug: 'abram', name: 'Abram' },
      ]
    );
    expect(result.map((e) => e.slug)).toEqual([
      'earlier',
      'abraham-enters-canaan',
      'abrahamic-covenant',
      'undated',
    ]);
    expect(result[1]).toEqual({
      slug: 'abraham-enters-canaan',
      title: 'Abraham Enters Canaan',
      startYearDisplay: '2091 BC',
      sortKey: 5,
      participants: [
        { slug: 'abram', name: 'Abram' },
        { slug: 'sarai', name: 'Sarai' },
      ],
      verses: [4, 5],
    });
    expect(result[3].sortKey).toBeNull();
  });
});

describe('mapPeopleSpreadRows', () => {
  it('computes firstRef by canonical order, not string order, and books in canonical order', async () => {
    const { mapPeopleSpreadRows } = await import('./local-db');
    const result = mapPeopleSpreadRows([
      { slug: 'jesus-son-of-joseph', osis_ref: '1Chr.17.13' },
      { slug: 'jesus-son-of-joseph', osis_ref: 'Matt.1.21' },
      { slug: 'jesus-son-of-joseph', osis_ref: 'Matt.1.1' },
      { slug: 'jesus-son-of-joseph', osis_ref: 'Gen.49.10' },
      { slug: 'jesus-son-of-joseph', osis_ref: 'Gen.9.3' },
      { slug: 'jesus-son-of-joseph', osis_ref: 'Gen.49.2' },
      { slug: 'other', osis_ref: 'Gen.10.2' },
      { slug: 'other', osis_ref: 'Gen.9.20' },
    ]);
    expect(result).toEqual([
      { slug: 'jesus-son-of-joseph', firstRef: 'Gen.9.3', firstNtRef: 'Matt.1.1', books: ['Gen', '1Chr', 'Matt'] },
      { slug: 'other', firstRef: 'Gen.9.20', firstNtRef: null, books: ['Gen'] },
    ]);
  });

  it('picks Gen.49.10 over 1Chr.17.13', async () => {
    const { mapPeopleSpreadRows } = await import('./local-db');
    const [jesus] = mapPeopleSpreadRows([
      { slug: 'jesus-son-of-joseph', osis_ref: '1Chr.17.13' },
      { slug: 'jesus-son-of-joseph', osis_ref: 'Gen.49.10' },
    ]);
    expect(jesus.firstRef).toBe('Gen.49.10');
  });
});

describe('chapter data queries', () => {
  it('getChapterPeople uses the range filter and maps rows', async () => {
    state.peopleRows = [{ slug: 'abram', name: 'Abram', osis_ref: 'Gen.12.1' }];
    const db = await freshDb();

    await expect(db.getChapterPeople('Gen', 12)).resolves.toEqual([{ slug: 'abram', name: 'Abram', verses: [1] }]);

    const call = state.selectCalls.find((c) => c.sql.includes('SELECT p.slug, p.name, v.osis_ref'));
    expect(call!.sql).toContain('v.osis_ref >= ?1 AND v.osis_ref < ?2');
    expect(call!.params).toEqual(['Gen.12.', 'Gen.12/']);
  });

  it('getChapterPlaces filters to places with coordinates', async () => {
    state.placeRows = [{ slug: 'haran', name: 'Haran', latitude: 36.8, longitude: 39.0, osis_ref: 'Gen.12.4' }];
    const db = await freshDb();

    await expect(db.getChapterPlaces('Gen', 12)).resolves.toEqual([
      { slug: 'haran', name: 'Haran', latitude: 36.8, longitude: 39.0, verses: [4] },
    ]);

    const call = state.selectCalls.find((c) => c.sql.includes('pl.latitude'));
    expect(call!.sql).toContain('pl.latitude IS NOT NULL');
    expect(call!.sql).toContain('v.osis_ref >= ?1 AND v.osis_ref < ?2');
    expect(call!.params).toEqual(['Gen.12.', 'Gen.12/']);
  });

  it('getChapterEvents runs the participants query with the same range and skips it when there are no events', async () => {
    const db = await freshDb();
    await expect(db.getChapterEvents('Gen', 12)).resolves.toEqual([]);
    expect(state.selectCalls.some((c) => c.sql.includes('FROM event_participant'))).toBe(false);

    state.eventRows = [
      { slug: 'abraham-enters-canaan', title: 'Abraham Enters Canaan', start_year_display: null, sort_key: 5, osis_ref: 'Gen.12.5' },
    ];
    state.participantRows = [{ event_slug: 'abraham-enters-canaan', slug: 'abram', name: 'Abram' }];

    const events = await db.getChapterEvents('Gen', 12);
    expect(events).toHaveLength(1);
    expect(events[0].participants).toEqual([{ slug: 'abram', name: 'Abram' }]);

    const call = state.selectCalls.find((c) => c.sql.includes('FROM event_participant'));
    expect(call!.sql).toContain('v.osis_ref >= ?1 AND v.osis_ref < ?2');
    expect(call!.params).toEqual(['Gen.12.', 'Gen.12/']);
  });

  it('getPeopleSpread binds one param per slug and returns early for none', async () => {
    const db = await freshDb();
    await expect(db.getPeopleSpread([])).resolves.toEqual([]);
    expect(state.selectCalls.some((c) => c.sql.includes('p.slug IN'))).toBe(false);

    state.spreadRows = [{ slug: 'abram', osis_ref: 'Gen.12.1' }];
    await expect(db.getPeopleSpread(['abram', 'sarai'])).resolves.toEqual([
      { slug: 'abram', firstRef: 'Gen.12.1', firstNtRef: null, books: ['Gen'] },
    ]);

    const call = state.selectCalls.find((c) => c.sql.includes('p.slug IN'));
    expect(call!.sql).toContain('p.slug IN (?1, ?2)');
    expect(call!.params).toEqual(['abram', 'sarai']);
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
    // Install attempts are bounded per session, not repeated on every retried
    // call: eager attempts stop after the cap, plus one inside the rebuild.
    expect(
      commands().filter(c => c === 'install_bundled_module').length
    ).toBeLessThanOrEqual(4);
  });

  it('recovers on a later call when an install failure was transient', async () => {
    // Both the eager install and the rebuild's reinstall fail once each,
    // then whatever was wrong with the device clears.
    state.corrupt = true;
    state.deleteRepairs = true;
    state.installFailures = 2;
    const db = await freshDb();

    await expect(db.getChapterYear('Gen', 1)).rejects.toThrow(/could not be reinstalled/);

    // The next call's eager install succeeds and the panel heals itself.
    await expect(db.getChapterYear('Gen', 1)).resolves.not.toBeNull();
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
