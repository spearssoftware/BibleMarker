import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests for sqlite-db.ts against a scripted fake driver.
 *
 * The @tauri-apps/plugin-sql driver is replaced with a fake that records every
 * execute() call and answers select() based on SQL patterns, so we can assert
 * the exact SQL + bindings produced by migrations, applyRemoteChange conflict
 * resolution, and clear-database.
 */

interface ExecuteCall {
  sql: string;
  params?: unknown[];
}

const state = vi.hoisted(() => ({
  executeCalls: [] as { sql: string; params?: unknown[] }[],
  schemaVersion: 11 as number | null,
  // Rows returned for "SELECT updated_at FROM <table> WHERE id = ?"
  existingRow: null as { updated_at: string } | null,
  // Rows returned for "SELECT * FROM notes"
  noteRows: [] as Record<string, unknown>[],
  selectCalls: [] as { sql: string; params?: unknown[] }[],
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

vi.mock('@tauri-apps/plugin-sql', () => {
  const fakeDb = {
    execute: vi.fn(async (sql: string, params?: unknown[]) => {
      state.executeCalls.push({ sql, params });
      return { rowsAffected: 0, lastInsertId: 0 };
    }),
    select: vi.fn(async (sql: string, params?: unknown[]) => {
      state.selectCalls.push({ sql, params });
      if (sql.includes('integrity_check')) {
        return [{ integrity_check: 'ok' }];
      }
      if (sql.includes('FROM schema_version')) {
        return state.schemaVersion === null ? [] : [{ version: state.schemaVersion }];
      }
      if (sql.includes("key = 'device_id'")) {
        return [{ value: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' }];
      }
      if (sql.includes('PRAGMA table_info')) {
        return [{ name: 'id' }, { name: 'data' }, { name: 'study_id' }];
      }
      if (sql.includes('SELECT updated_at FROM')) {
        return state.existingRow ? [state.existingRow] : [];
      }
      if (sql.includes('FROM notes')) {
        return state.noteRows;
      }
      return [];
    }),
    close: vi.fn(async () => true),
  };
  return {
    default: { load: vi.fn(async () => fakeDb) },
  };
});

async function loadModule() {
  vi.resetModules();
  return import('./sqlite-db');
}

function findCalls(pattern: RegExp): ExecuteCall[] {
  return state.executeCalls.filter((c) => pattern.test(c.sql));
}

beforeEach(() => {
  state.executeCalls = [];
  state.schemaVersion = 11;
  state.existingRow = null;
  state.noteRows = [];
  state.selectCalls = [];
});

describe('sqliteGetChapterNotes', () => {
  function noteRow(overrides: Record<string, unknown>) {
    return {
      id: 'note-1',
      module_id: 'sword-NASB2020',
      ref: JSON.stringify({ book: 'John', chapter: 3, verse: 16 }),
      range: null,
      content: 'For God so loved the world',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('returns notes from every translation, not just the one being read', async () => {
    state.noteRows = [
      noteRow({ id: 'nasb-note', module_id: 'sword-NASB2020' }),
      noteRow({ id: 'esv-note', module_id: 'esv' }),
      noteRow({ id: 'kjv-note', module_id: 'sword-KJV', content: 'a third note' }),
    ];
    const mod = await loadModule();

    const notes = await mod.sqliteGetChapterNotes('John', 3);

    expect(notes.map((n) => n.id).sort()).toEqual(['esv-note', 'kjv-note', 'nasb-note']);
  });

  // The driver mock cannot evaluate a WHERE clause, so the filtering tests
  // below exercise the JS filter only. These assertions are the sole guard on
  // the SQL predicate itself — a wrong JSON path would otherwise ship green
  // and return nothing on a real database.
  it('filters by book and chapter in SQL, with no module_id predicate', async () => {
    const mod = await loadModule();
    await mod.sqliteGetChapterNotes('John', 3);

    const noteSelect = state.selectCalls.find((c) => c.sql.includes('FROM notes'));
    expect(noteSelect).toBeDefined();
    expect(noteSelect!.sql).not.toMatch(/module_id/);
    expect(noteSelect!.params).toEqual(['John', 3]);
  });

  it('keys the SQL predicate off range.start with a fallback to ref', async () => {
    const mod = await loadModule();
    await mod.sqliteGetChapterNotes('John', 3);

    const sql = state.selectCalls.find((c) => c.sql.includes('FROM notes'))!.sql;
    expect(sql).toMatch(/json_extract\(\s*range\s*,\s*'\$\.start\.book'\s*\)/);
    expect(sql).toMatch(/json_extract\(\s*range\s*,\s*'\$\.start\.chapter'\s*\)/);
    expect(sql).toMatch(/json_extract\(\s*ref\s*,\s*'\$\.book'\s*\)/);
    expect(sql).toMatch(/json_extract\(\s*ref\s*,\s*'\$\.chapter'\s*\)/);
    // Malformed JSON in either column must not abort the whole statement.
    expect(sql).toMatch(/json_valid\(\s*range\s*\)/);
    expect(sql).toMatch(/json_valid\(\s*ref\s*\)/);
  });

  it('still filters to the requested book and chapter', async () => {
    state.noteRows = [
      noteRow({ id: 'in-chapter' }),
      noteRow({ id: 'other-chapter', ref: JSON.stringify({ book: 'John', chapter: 4, verse: 1 }) }),
      noteRow({ id: 'other-book', ref: JSON.stringify({ book: 'Mark', chapter: 3, verse: 16 }) }),
    ];
    const mod = await loadModule();

    const notes = await mod.sqliteGetChapterNotes('John', 3);

    expect(notes.map((n) => n.id)).toEqual(['in-chapter']);
  });

  it('matches a range note by the start of its range', async () => {
    state.noteRows = [
      noteRow({
        id: 'range-note',
        ref: JSON.stringify({ book: 'John', chapter: 3, verse: 16 }),
        range: JSON.stringify({
          start: { book: 'John', chapter: 3, verse: 16 },
          end: { book: 'John', chapter: 3, verse: 18 },
        }),
      }),
      noteRow({
        id: 'other-chapter-range',
        range: JSON.stringify({
          start: { book: 'John', chapter: 9, verse: 1 },
          end: { book: 'John', chapter: 9, verse: 3 },
        }),
      }),
    ];
    const mod = await loadModule();

    const notes = await mod.sqliteGetChapterNotes('John', 3);

    expect(notes.map((n) => n.id)).toEqual(['range-note']);
  });
});

describe('applyRemoteChange', () => {
  it('includes study_id for generic tables with a study_id column', async () => {
    const mod = await loadModule();
    const data = JSON.stringify({
      id: 'int-1',
      studyId: 'study-1',
      meaning: 'test',
      createdAt: '2026-01-01T00:00:00.000Z',
    });

    const applied = await mod.applyRemoteChange(
      'interpretations', 'upsert', 'int-1', data, '2026-01-02T00:00:00.000Z', 'remote-dev'
    );

    expect(applied).toBe(true);
    const inserts = findCalls(/INSERT OR REPLACE INTO interpretations/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toContain('study_id');
    expect(inserts[0].params).toEqual([
      'int-1', data, 'study-1',
      '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 'remote-dev',
    ]);
  });

  it.each(['observation_lists', 'applications', 'entity_notes'])(
    'includes study_id for %s',
    async (table) => {
      const mod = await loadModule();
      const data = JSON.stringify({ id: 'row-1', studyId: 'study-9' });

      await mod.applyRemoteChange(table, 'upsert', 'row-1', data, '2026-01-02T00:00:00.000Z', 'remote-dev');

      const inserts = findCalls(new RegExp(`INSERT OR REPLACE INTO ${table}`));
      expect(inserts).toHaveLength(1);
      expect(inserts[0].sql).toContain('study_id');
      expect(inserts[0].params).toContain('study-9');
    }
  );

  it('binds null study_id when the remote record has none', async () => {
    const mod = await loadModule();
    const data = JSON.stringify({ id: 'app-1', teaching: 'x' });

    await mod.applyRemoteChange('applications', 'upsert', 'app-1', data, '2026-01-02T00:00:00.000Z', 'remote-dev');

    const inserts = findCalls(/INSERT OR REPLACE INTO applications/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params?.[2]).toBeNull();
  });

  it('does not add study_id to generic tables without the column', async () => {
    const mod = await loadModule();
    const data = JSON.stringify({ id: 'place-1', name: 'Jerusalem', studyId: 'study-1' });

    await mod.applyRemoteChange('places', 'upsert', 'place-1', data, '2026-01-02T00:00:00.000Z', 'remote-dev');

    const inserts = findCalls(/INSERT OR REPLACE INTO places/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).not.toContain('study_id');
  });

  it('skips the upsert when the local row is newer (newest-wins)', async () => {
    const mod = await loadModule();
    state.existingRow = { updated_at: '2026-03-01T00:00:00.000Z' };
    const data = JSON.stringify({ id: 'int-1', studyId: 'study-1' });

    const applied = await mod.applyRemoteChange(
      'interpretations', 'upsert', 'int-1', data, '2026-01-02T00:00:00.000Z', 'remote-dev'
    );

    expect(applied).toBe(false);
    expect(findCalls(/INSERT OR REPLACE INTO interpretations/)).toHaveLength(0);
  });

  it('applies the upsert when the remote row is newer', async () => {
    const mod = await loadModule();
    state.existingRow = { updated_at: '2026-01-01T00:00:00.000Z' };
    const data = JSON.stringify({ id: 'int-1' });

    const applied = await mod.applyRemoteChange(
      'interpretations', 'upsert', 'int-1', data, '2026-01-02T00:00:00.000Z', 'remote-dev'
    );

    expect(applied).toBe(true);
    expect(findCalls(/INSERT OR REPLACE INTO interpretations/)).toHaveLength(1);
  });

  it('skips deletes when the local row is newer', async () => {
    const mod = await loadModule();
    state.existingRow = { updated_at: '2026-03-01T00:00:00.000Z' };

    const applied = await mod.applyRemoteChange(
      'interpretations', 'delete', 'int-1', null, '2026-01-02T00:00:00.000Z', 'remote-dev'
    );

    expect(applied).toBe(false);
    expect(findCalls(/DELETE FROM interpretations/)).toHaveLength(0);
  });

  it('rejects table names outside the whitelist', async () => {
    const mod = await loadModule();
    await expect(
      mod.applyRemoteChange('evil_table', 'upsert', 'x', '{}', '2026-01-02T00:00:00.000Z', 'remote-dev')
    ).rejects.toThrow('Invalid table name');
  });
});

/**
 * The structured (column-based) tables route their sync-apply through the local
 * save functions. These guard that the routed rows are written 'synced' with the
 * remote timestamp/device, in the correct column order — the sync-apply path was
 * previously untested.
 */
describe('applyRemoteChange — structured tables', () => {
  it('upserts annotations as synced with the remote timestamp and device', async () => {
    const mod = await loadModule();
    const obj = {
      id: 'ann-1', moduleId: 'NASB', type: 'highlight', presetId: 'p1',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    const data = JSON.stringify(obj);

    await mod.applyRemoteChange('annotations', 'upsert', 'ann-1', data, '2026-01-02T00:00:00.000Z', 'remote-dev');

    const inserts = findCalls(/INSERT OR REPLACE INTO annotations/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params).toEqual([
      'ann-1', 'NASB', 'highlight', data, 'p1',
      '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 'synced', 'remote-dev',
    ]);
  });

  it('normalizes legacy bookScope/chapterScope into scopes for marking_presets', async () => {
    const mod = await loadModule();
    const obj = {
      id: 'mp-1', word: 'God', variants: [], autoSuggest: true, usageCount: 5,
      bookScope: 'John', chapterScope: 3, createdAt: '2026-01-01T00:00:00.000Z',
    };

    await mod.applyRemoteChange('marking_presets', 'upsert', 'mp-1', JSON.stringify(obj), '2026-01-02T00:00:00.000Z', 'remote-dev');

    const inserts = findCalls(/INSERT OR REPLACE INTO marking_presets/);
    expect(inserts).toHaveLength(1);
    const p = inserts[0].params ?? [];
    expect(p[9]).toBe('John');                                       // book_scope
    expect(p[10]).toBe(3);                                           // chapter_scope
    expect(p[11]).toBe(JSON.stringify([{ book: 'John', chapter: 3 }])); // scopes
    expect(p[p.length - 2]).toBe('synced');                         // sync_status
    expect(p[p.length - 1]).toBe('remote-dev');                     // device_id
  });

  it('upserts studies as synced', async () => {
    const mod = await loadModule();
    const obj = { id: 's-1', name: 'Romans', book: 'Rom', isActive: true, createdAt: '2026-01-01T00:00:00.000Z' };

    await mod.applyRemoteChange('studies', 'upsert', 's-1', JSON.stringify(obj), '2026-01-02T00:00:00.000Z', 'remote-dev');

    const inserts = findCalls(/INSERT OR REPLACE INTO studies/);
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params).toEqual([
      's-1', 'Romans', 'Rom', 1,
      '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 'synced', 'remote-dev',
    ]);
  });
});

describe('schema migration v11', () => {
  it('backfills study_id from JSON data for all study-column tables', async () => {
    state.schemaVersion = 10;
    const mod = await loadModule();
    await mod.getSqliteDb();

    for (const table of ['observation_lists', 'interpretations', 'applications', 'entity_notes']) {
      const backfills = findCalls(new RegExp(`UPDATE ${table}[\\s\\S]*json_extract\\(data, '\\$\\.studyId'\\)`));
      expect(backfills.length, `expected v11 backfill for ${table}`).toBe(1);
      expect(backfills[0].sql).toContain('WHERE study_id IS NULL');
    }

    const versionWrites = findCalls(/INSERT OR REPLACE INTO schema_version/);
    expect(versionWrites).toHaveLength(1);
    expect(versionWrites[0].params?.[0]).toBe(11);
  });

  it('does not run the backfill when already at v11', async () => {
    state.schemaVersion = 11;
    const mod = await loadModule();
    await mod.getSqliteDb();

    expect(findCalls(/json_extract\(data, '\$\.studyId'\)/)).toHaveLength(0);
  });
});

describe('sqliteClearDatabase', () => {
  it('clears entity_notes and keyword_exclusions along with the other data tables', async () => {
    // The shared test setup defines a partial window without dispatchEvent.
    vi.stubGlobal('window', { ...globalThis.window, dispatchEvent: vi.fn() });
    const mod = await loadModule();
    await mod.sqliteClearDatabase();

    const deletes = findCalls(/^DELETE FROM /).map((c) => c.sql.replace('DELETE FROM ', ''));
    for (const table of [
      'annotations', 'notes', 'marking_presets', 'studies',
      'observation_lists', 'interpretations', 'applications',
      'entity_notes', 'keyword_exclusions',
    ]) {
      expect(deletes, `expected DELETE FROM ${table}`).toContain(table);
    }
  });
});
