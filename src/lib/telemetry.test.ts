/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePreferencesStore } from '@/stores/preferencesStore';

vi.mock('./feature-flags', () => ({ platformTag: () => 'ios' }));

import { track, initTelemetry, shutdownTelemetry } from './telemetry';

interface EventsRequestBody {
  events: { name: string; feature?: string }[];
  appVersion: string;
  platform: string;
  sessionId?: string;
}

function lastRequestBody(mockFetch: ReturnType<typeof vi.fn>): EventsRequestBody {
  const call = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  const init = call?.[1] as RequestInit;
  return JSON.parse(init.body as string) as EventsRequestBody;
}

/** Let a scheduled microtask (`queueMicrotask`) run before asserting on it. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('telemetry', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('__APP_VERSION__', '9.9.9');
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);
    usePreferencesStore.setState({ telemetryEnabled: false, inductiveToolsEnabled: false, isHydrated: false });
  });

  afterEach(async () => {
    await shutdownTelemetry();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('never fetches when the user has not opted in', async () => {
    initTelemetry();
    for (let i = 0; i < 30; i++) track('discovery_chip_tapped', { feature: 'repetition' });
    await flushMicrotasks();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flushes once the queue reaches 20 events', async () => {
    usePreferencesStore.setState({ telemetryEnabled: true });
    initTelemetry();

    for (let i = 0; i < 20; i++) track('lens_toggled');
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = lastRequestBody(fetchMock);
    expect(body.events).toHaveLength(20);
    expect(body.appVersion).toBe('9.9.9');
    expect(body.platform).toBe('ios');
  });

  it('caps a single request at 30 events even when a burst queues more', async () => {
    usePreferencesStore.setState({ telemetryEnabled: true });
    initTelemetry();

    for (let i = 0; i < 65; i++) track('lens_toggled');
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastRequestBody(fetchMock).events).toHaveLength(30);
  });

  it('does not send events queued before opt-out, and clears the queue', async () => {
    usePreferencesStore.setState({ telemetryEnabled: true });
    initTelemetry();

    // Queue a few events — below the 20-event auto-flush threshold, so they
    // sit in the queue rather than being sent immediately.
    for (let i = 0; i < 5; i++) track('lens_toggled');
    expect(fetchMock).not.toHaveBeenCalled();

    // Opt out before anything flushes.
    usePreferencesStore.setState({ telemetryEnabled: false });

    // The periodic-flush path (also exercised by shutdownTelemetry) must bail
    // without sending, and must clear the stale queue.
    await shutdownTelemetry();
    expect(fetchMock).not.toHaveBeenCalled();

    // Opt back in (without re-initializing, so this isolates flush()'s own
    // clearing behavior from initTelemetry()'s reset) and queue a fresh
    // batch: if the old queue had lingered, this request would contain more
    // than 20 events.
    usePreferencesStore.setState({ telemetryEnabled: true });
    for (let i = 0; i < 20; i++) track('lens_toggled');
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastRequestBody(fetchMock).events).toHaveLength(20);
  });

  it('clears the discovery_chip_shown dedupe set on opt-out', async () => {
    usePreferencesStore.setState({ telemetryEnabled: true });
    initTelemetry();

    track('discovery_chip_shown', { feature: 'repetition', dedupeKey: 'JHN:1:sword-NASB' });

    // Opt out, then force a flush (without re-initializing, so this isolates
    // flush()'s own clearing behavior from initTelemetry()'s reset).
    usePreferencesStore.setState({ telemetryEnabled: false });
    await shutdownTelemetry();

    // Opt back in: the same dedupeKey must count again since the dedupe set
    // was cleared on opt-out, not just the queue.
    usePreferencesStore.setState({ telemetryEnabled: true });
    for (let i = 0; i < 19; i++) track('lens_toggled');
    track('discovery_chip_shown', { feature: 'repetition', dedupeKey: 'JHN:1:sword-NASB' });
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastRequestBody(fetchMock).events).toHaveLength(20);
  });

  it('flushes on visibilitychange -> hidden, even below the batch threshold', async () => {
    usePreferencesStore.setState({ telemetryEnabled: true });
    initTelemetry();

    track('discovery_find_confirmed', { feature: 'repetition' });
    expect(fetchMock).not.toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastRequestBody(fetchMock).events).toEqual([{ name: 'discovery_find_confirmed', feature: 'repetition' }]);
  });

  it('discards the batch on a network error without throwing', async () => {
    usePreferencesStore.setState({ telemetryEnabled: true });
    fetchMock.mockRejectedValue(new Error('network down'));
    initTelemetry();

    expect(() => {
      for (let i = 0; i < 20; i++) track('lens_toggled');
    }).not.toThrow();
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The failed batch was discarded, not requeued — a fresh burst of 20 triggers exactly one more request.
    for (let i = 0; i < 20; i++) track('lens_toggled');
    await flushMicrotasks();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('dedupes discovery_chip_shown per dedupeKey within a session', async () => {
    usePreferencesStore.setState({ telemetryEnabled: true });
    initTelemetry();

    for (let i = 0; i < 25; i++) {
      track('discovery_chip_shown', { feature: 'repetition', dedupeKey: 'JHN:1:sword-NASB' });
    }
    // A different chapter still counts.
    track('discovery_chip_shown', { feature: 'repetition', dedupeKey: 'JHN:3:sword-NASB' });
    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled(); // only 2 distinct events queued, below the batch threshold

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();

    expect(lastRequestBody(fetchMock).events).toHaveLength(2);
  });

  it('never includes the dedupeKey in the outgoing payload', async () => {
    usePreferencesStore.setState({ telemetryEnabled: true });
    initTelemetry();

    track('discovery_chip_shown', { feature: 'repetition', dedupeKey: 'JHN:1:sword-NASB' });
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await flushMicrotasks();

    const raw = fetchMock.mock.calls[fetchMock.mock.calls.length - 1][1] as RequestInit;
    expect(raw.body as string).not.toContain('JHN');
    expect(raw.body as string).not.toContain('dedupeKey');
  });
});
