import { describe, it, expect, vi } from 'vitest';
import type { ReadingPlan, ReadingPlanDay } from '@/types';
import { createFakeStore, tableRows } from './__test__/fake-sqlite';
import type { FakeStore } from './__test__/fake-sqlite';

/**
 * Reading plan persistence against a stateful fake driver: two-device sync,
 * export/import, reset, and cascade delete. No real SQLite runs under Vitest.
 */

const fake = await vi.hoisted(async () => {
  const { createFakeSqlite, createFakeStore } = await import('./__test__/fake-sqlite');
  return createFakeSqlite(createFakeStore('unused'));
});

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn().mockResolvedValue(null),
}));

vi.mock('@tauri-apps/plugin-sql', () => ({
  default: { load: vi.fn(async () => fake.open()) },
}));

interface Device {
  store: FakeStore;
  db: typeof import('./database');
  sqlite: typeof import('./sqlite-db');
}

/** Loads fresh database modules bound to a new store, as a separate device would have. */
async function openDevice(deviceId: string, store = createFakeStore(deviceId)): Promise<Device> {
  fake.current = store;
  vi.resetModules();
  const db = await import('./database');
  const sqlite = await import('./sqlite-db');
  await sqlite.getSqliteDb();
  return { store, db, sqlite };
}

async function deliver(from: Device, to: Device): Promise<void> {
  for (const change of await from.sqlite.getUnflushedChanges()) {
    await to.sqlite.applyRemoteChange(
      change.table_name, change.op as 'upsert' | 'delete', change.row_id,
      change.data, change.updated_at, change.device_id
    );
  }
}

const at = new Date('2026-11-13T09:00:00.000Z');

const plan = (id: string): ReadingPlan => ({
  id,
  scope: { kind: 'book', bookId: 'John' },
  days: 21,
  startDate: '2026-11-13',
  scheduleVersion: 1,
  createdAt: at,
  updatedAt: at,
});

const dayRow = (planId: string, day: number): ReadingPlanDay => ({
  id: `${planId}:${day}`,
  planId,
  day,
  completedAt: at,
  updatedAt: at,
});

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe('reading plan sync', () => {
  it('keeps both day rows when two devices complete different days of one plan', async () => {
    const a = await openDevice('device-a');
    const b = await openDevice('device-b');

    await a.db.saveReadingPlan(plan('p'));
    await deliver(a, b);
    await a.db.saveReadingPlanDay(dayRow('p', 1));
    await b.db.saveReadingPlanDay(dayRow('p', 2));

    await deliver(a, b);
    await deliver(b, a);

    expect(ids(await a.db.getAllReadingPlanDays())).toEqual(['p:1', 'p:2']);
    expect(ids(await b.db.getAllReadingPlanDays())).toEqual(['p:1', 'p:2']);
    expect(ids(await a.db.getAllReadingPlans())).toEqual(['p']);
    expect(ids(await b.db.getAllReadingPlans())).toEqual(['p']);
  });

  it('converges on one row when both devices complete the same day', async () => {
    const a = await openDevice('device-a');
    const b = await openDevice('device-b');

    await a.db.saveReadingPlanDay(dayRow('p', 1));
    await b.db.saveReadingPlanDay(dayRow('p', 1));
    await deliver(a, b);
    await deliver(b, a);

    expect(ids(await a.db.getAllReadingPlanDays())).toEqual(['p:1']);
    expect(ids(await b.db.getAllReadingPlanDays())).toEqual(['p:1']);
  });

  it('propagates unmarking a day', async () => {
    const a = await openDevice('device-a');
    const b = await openDevice('device-b');

    await a.db.saveReadingPlanDay(dayRow('p', 1));
    await deliver(a, b);
    await a.db.deleteReadingPlanDay('p:1');
    await deliver(a, b);

    expect(await b.db.getAllReadingPlanDays()).toEqual([]);
  });
});

describe('reading plan export and import', () => {
  it('imports an exported plan and its days into an empty database', async () => {
    const source = await openDevice('device-a');
    await source.db.saveReadingPlan(plan('p'));
    await source.db.saveReadingPlanDay(dayRow('p', 1));
    await source.db.saveReadingPlanDay(dayRow('p', 2));
    const exported = await source.db.exportAllData();

    const target = await openDevice('device-b');
    expect(await target.db.getAllReadingPlans()).toEqual([]);
    await target.db.importAllData(exported);

    expect(await target.db.getAllReadingPlans()).toEqual(JSON.parse(JSON.stringify([plan('p')])));
    expect(await target.db.getAllReadingPlanDays()).toEqual(
      JSON.parse(JSON.stringify([dayRow('p', 1), dayRow('p', 2)]))
    );
  });
});

describe('clear database', () => {
  it('empties both reading plan tables', async () => {
    vi.stubGlobal('window', { ...globalThis.window, dispatchEvent: vi.fn() });
    const device = await openDevice('device-a');
    await device.db.saveReadingPlan(plan('p'));
    await device.db.saveReadingPlanDay(dayRow('p', 1));
    expect(tableRows(device.store, 'reading_plans').size).toBe(1);

    await device.db.clearDatabase();

    expect(await device.db.getAllReadingPlans()).toEqual([]);
    expect(await device.db.getAllReadingPlanDays()).toEqual([]);
  });
});

describe('deleteReadingPlan', () => {
  it('deletes the plan and its day rows, logging each, and leaves other plans alone', async () => {
    const device = await openDevice('device-a');
    await device.db.saveReadingPlan(plan('p'));
    await device.db.saveReadingPlan(plan('q'));
    await device.db.saveReadingPlanDay(dayRow('p', 1));
    await device.db.saveReadingPlanDay(dayRow('p', 2));
    await device.db.saveReadingPlanDay(dayRow('q', 1));
    const before = (await device.sqlite.getUnflushedChanges()).length;

    await device.db.deleteReadingPlan('p');

    expect(ids(await device.db.getAllReadingPlans())).toEqual(['q']);
    expect(ids(await device.db.getAllReadingPlanDays())).toEqual(['q:1']);
    const deletes = (await device.sqlite.getUnflushedChanges())
      .slice(before)
      .map((c) => `${c.table_name}:${c.op}:${c.row_id}`);
    expect(deletes.sort()).toEqual([
      'reading_plan_days:delete:p:1',
      'reading_plan_days:delete:p:2',
      'reading_plans:delete:p',
    ]);
  });
});
