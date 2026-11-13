/**
 * A small stateful stand-in for `@tauri-apps/plugin-sql`, for tests that need
 * rows to persist between writes and reads (sync between two devices, export
 * then import). Unlike the scripted fakes in sqlite-db.test.ts it understands
 * just enough SQL: the id-keyed JSON-row writes and reads of generic tables,
 * and the change_log. Every other statement is a no-op or returns no rows.
 *
 * Each "device" is a FakeStore. Point `current` at a store before a freshly
 * loaded sqlite-db module opens its connection; that module stays bound to it.
 */

type Row = Record<string, unknown>;

interface ChangeLogRow extends Row {
  seq: number;
  flushed: number;
}

export interface FakeStore {
  deviceId: string;
  tables: Map<string, Map<string, Row>>;
  changeLog: ChangeLogRow[];
}

export function createFakeStore(deviceId: string): FakeStore {
  return { deviceId, tables: new Map(), changeLog: [] };
}

/** Rows of a generic table, keyed by id. */
export function tableRows(store: FakeStore, table: string): Map<string, Row> {
  let rows = store.tables.get(table);
  if (!rows) {
    rows = new Map();
    store.tables.set(table, rows);
  }
  return rows;
}

/** Splits a SQL list on top-level commas, ignoring commas inside single quotes. */
function splitList(list: string): string[] {
  const parts: string[] = [];
  let current = '';
  let quoted = false;
  for (const ch of list) {
    if (ch === "'") quoted = !quoted;
    if (ch === ',' && !quoted) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current.trim());
  return parts;
}

function bindValues(values: string[], params: unknown[]): unknown[] {
  let next = 0;
  return values.map((token) => {
    if (token === '?') return params[next++];
    if (token.startsWith("'")) return token.slice(1, -1);
    return Number(token);
  });
}

class FakeDatabase {
  constructor(private readonly store: FakeStore) {}

  async execute(sql: string, params: unknown[] = []): Promise<{ rowsAffected: number; lastInsertId: number }> {
    const text = sql.replace(/\s+/g, ' ').trim();

    const insert = /^INSERT (?:OR REPLACE )?INTO (\w+) \(([^)]*)\) VALUES \((.*)\)$/.exec(text);
    if (insert) {
      const [, table, columns, values] = insert;
      const names = splitList(columns);
      const bound = bindValues(splitList(values), params);
      const row: Row = Object.fromEntries(names.map((name, i) => [name, bound[i]]));
      if (table === 'change_log') {
        this.store.changeLog.push({ ...row, seq: this.store.changeLog.length + 1, flushed: 0 } as ChangeLogRow);
      } else if (table !== 'sync_config') {
        tableRows(this.store, table).set(String(row.id), row);
      }
      return { rowsAffected: 1, lastInsertId: 0 };
    }

    const remove = /^DELETE FROM (\w+)(?: WHERE id = \?)?$/.exec(text);
    if (remove) {
      const rows = tableRows(this.store, remove[1]);
      if (text.includes('WHERE id = ?')) rows.delete(String(params[0]));
      else rows.clear();
      return { rowsAffected: 1, lastInsertId: 0 };
    }

    const flush = /^UPDATE change_log SET flushed = 1 WHERE seq <= \?/.exec(text);
    if (flush) {
      for (const entry of this.store.changeLog) {
        if (entry.seq <= Number(params[0])) entry.flushed = 1;
      }
    }
    return { rowsAffected: 0, lastInsertId: 0 };
  }

  async select(sql: string, params: unknown[] = []): Promise<Row[]> {
    const text = sql.replace(/\s+/g, ' ').trim();
    if (text.includes('integrity_check')) return [{ integrity_check: 'ok' }];
    if (text.includes('FROM schema_version')) return [{ version: 12 }];
    if (text.includes("key = 'device_id'")) return [{ value: this.store.deviceId }];

    if (/FROM change_log WHERE flushed = 0/.test(text)) {
      return this.store.changeLog.filter((entry) => entry.flushed === 0).map((entry) => ({ ...entry }));
    }

    const select = /^SELECT ([\w, ]+) FROM (\w+)(?: WHERE id = \?)?$/.exec(text);
    if (!select) return [];
    const columns = splitList(select[1]);
    const rows = tableRows(this.store, select[2]);
    const matching = text.includes('WHERE id = ?')
      ? [rows.get(String(params[0]))].filter((row): row is Row => row !== undefined)
      : [...rows.values()];
    return matching.map((row) => Object.fromEntries(columns.map((c) => [c, row[c]])));
  }

  async close(): Promise<boolean> {
    return true;
  }
}

export interface FakeSqlite {
  /** The store the next `Database.load` binds to. */
  current: FakeStore;
  open(): FakeDatabase;
}

export function createFakeSqlite(initial: FakeStore): FakeSqlite {
  const fake: FakeSqlite = {
    current: initial,
    open: () => new FakeDatabase(fake.current),
  };
  return fake;
}
