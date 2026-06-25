/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SyncStatusIndicator } from '../SyncStatusIndicator';
import type { SyncStatus } from '@/lib/sync';

// Mock the sync module
const mockOnSyncStatusChange = vi.fn();
vi.mock('@/lib/sync', () => ({
  onSyncStatusChange: (...args: unknown[]) => mockOnSyncStatusChange(...args),
  getSyncStatusMessage: vi.fn((status: SyncStatus) => {
    if (status.state === 'signed-out') return 'Sign in to sync across devices';
    if (status.state === 'auth-expired') return 'Session expired — sign in again';
    return 'Sync enabled';
  }),
  getSyncStatusIcon: vi.fn(() => '→'),
  triggerSync: vi.fn(),
}));

// Mock panelStore
const mockOpenPanel = vi.fn();
vi.mock('@/stores/panelStore', () => ({
  usePanelStore: {
    getState: () => ({ openPanel: mockOpenPanel }),
  },
}));

function makeStatus(overrides: Partial<SyncStatus> = {}): SyncStatus {
  return {
    state: 'signed-out',
    last_sync: null,
    pending_changes: 0,
    error: null,
    sync_folder: null,
    connected_devices: [],
    ...overrides,
  };
}

describe('SyncStatusIndicator (compact)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it('shows a "Sign in" action when state is signed-out', () => {
    const status = makeStatus({ state: 'signed-out' });
    mockOnSyncStatusChange.mockImplementation((cb: (s: SyncStatus) => void) => {
      cb(status);
      return () => {};
    });

    render(<SyncStatusIndicator compact className="p-2 rounded-lg" />);

    // Click the icon to open the details panel
    const btn = screen.getByRole('button', { name: /sync status/i });
    fireEvent.click(btn);

    // The details panel should appear with a Sign in button
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
  });

  it('routes to settings data tab when Sign in is clicked', () => {
    const status = makeStatus({ state: 'signed-out' });
    mockOnSyncStatusChange.mockImplementation((cb: (s: SyncStatus) => void) => {
      cb(status);
      return () => {};
    });

    render(<SyncStatusIndicator compact className="p-2 rounded-lg" />);

    // Open details panel
    fireEvent.click(screen.getByRole('button', { name: /sync status/i }));

    // Click Sign in
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

    expect(mockOpenPanel).toHaveBeenCalledWith('settings', { settingsInitialTab: 'data' });
  });

  it('shows Sign in button when state is auth-expired', () => {
    const status = makeStatus({ state: 'auth-expired' });
    mockOnSyncStatusChange.mockImplementation((cb: (s: SyncStatus) => void) => {
      cb(status);
      return () => {};
    });

    render(<SyncStatusIndicator compact className="p-2 rounded-lg" />);

    fireEvent.click(screen.getByRole('button', { name: /sync status/i }));
    expect(screen.getByRole('button', { name: /sign in/i })).toBeTruthy();
  });
});
