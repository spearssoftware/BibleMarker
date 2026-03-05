import { describe, it, expect } from 'vitest';
import { getSyncStatusMessage, getSyncStatusIcon } from './sync';
import { makeSyncStatus } from './__test__/factories';

describe('getSyncStatusMessage', () => {
  it('returns "Synced just now" for recent sync (<1 min)', () => {
    const status = makeSyncStatus({ last_sync: new Date().toISOString() });
    expect(getSyncStatusMessage(status)).toBe('Synced just now');
  });

  it('returns "Synced Xm ago" for minutes', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    const status = makeSyncStatus({ last_sync: fiveMinAgo });
    expect(getSyncStatusMessage(status)).toMatch(/^Synced \d+m ago$/);
  });

  it('returns "Synced Xh ago" for hours', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    const status = makeSyncStatus({ last_sync: twoHoursAgo });
    expect(getSyncStatusMessage(status)).toMatch(/^Synced \d+h ago$/);
  });

  it('returns "Synced Xd ago" for days', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString();
    const status = makeSyncStatus({ last_sync: threeDaysAgo });
    expect(getSyncStatusMessage(status)).toMatch(/^Synced \d+d ago$/);
  });

  it('returns device count when synced with devices but no last_sync', () => {
    const status = makeSyncStatus({ connected_devices: ['device-a', 'device-b'] });
    expect(getSyncStatusMessage(status)).toBe('Syncing with 2 devices');
  });

  it('returns singular device text for one device', () => {
    const status = makeSyncStatus({ connected_devices: ['device-a'] });
    expect(getSyncStatusMessage(status)).toBe('Syncing with 1 device');
  });

  it('returns "Sync enabled" for synced state with no last_sync and no devices', () => {
    const status = makeSyncStatus();
    expect(getSyncStatusMessage(status)).toBe('Sync enabled');
  });

  it('returns "Syncing..." for syncing state', () => {
    const status = makeSyncStatus({ state: 'syncing' });
    expect(getSyncStatusMessage(status)).toBe('Syncing...');
  });

  it('returns "Offline (N pending)" for offline state', () => {
    const status = makeSyncStatus({ state: 'offline', pending_changes: 5 });
    expect(getSyncStatusMessage(status)).toBe('Offline (5 pending)');
  });

  it('returns error message for error state', () => {
    const status = makeSyncStatus({ state: 'error', error: 'Disk full' });
    expect(getSyncStatusMessage(status)).toBe('Sync error: Disk full');
  });

  it('returns "Unknown" for error state with no error', () => {
    const status = makeSyncStatus({ state: 'error', error: null });
    expect(getSyncStatusMessage(status)).toBe('Sync error: Unknown');
  });

  it('returns "Sync folder not found" for unavailable state', () => {
    const status = makeSyncStatus({ state: 'unavailable' });
    expect(getSyncStatusMessage(status)).toBe('Sync folder not found');
  });

  it('returns "Sync disabled" for disabled state', () => {
    const status = makeSyncStatus({ state: 'disabled' });
    expect(getSyncStatusMessage(status)).toBe('Sync disabled');
  });
});

describe('getSyncStatusIcon', () => {
  it('returns checkmark for synced', () => {
    expect(getSyncStatusIcon(makeSyncStatus())).toBe('\u2713');
  });

  it('returns refresh for syncing', () => {
    expect(getSyncStatusIcon(makeSyncStatus({ state: 'syncing' }))).toBe('\u21BB');
  });

  it('returns circle for offline', () => {
    expect(getSyncStatusIcon(makeSyncStatus({ state: 'offline' }))).toBe('\u25CB');
  });

  it('returns warning for error', () => {
    expect(getSyncStatusIcon(makeSyncStatus({ state: 'error' }))).toBe('\u26A0');
  });

  it('returns minus for unavailable', () => {
    expect(getSyncStatusIcon(makeSyncStatus({ state: 'unavailable' }))).toBe('\u2212');
  });

  it('returns minus for disabled', () => {
    expect(getSyncStatusIcon(makeSyncStatus({ state: 'disabled' }))).toBe('\u2212');
  });
});
