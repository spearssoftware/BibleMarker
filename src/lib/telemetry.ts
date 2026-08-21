/**
 * Telemetry — opt-in, anonymous usage counters for the Discover layer.
 *
 * Off by default; `track()` is a no-op unless the user has flipped "Share
 * anonymous usage data" on in Settings (`usePreferencesStore.telemetryEnabled`).
 * Events are an allowlisted union (`TelemetryEvent`) with at most a `feature`
 * tag — never book/chapter/verse/word, account id, or device id. Batched in
 * memory and flushed to the worker's `POST /events` (Cloudflare Analytics
 * Engine). Best-effort: nothing here throws, and a failed flush just discards
 * that batch rather than retrying.
 */

import { usePreferencesStore } from '@/stores/preferencesStore';
import { platformTag } from './feature-flags';

/** Allowlisted event names — mirrored exactly on the worker (`events.ts`). */
export type TelemetryEvent =
  | 'discovery_chip_shown'
  | 'discovery_chip_tapped'
  | 'discovery_find_confirmed'
  | 'lens_toggled';

export type TelemetryFeature = 'repetition' | 'connector' | 'entity';

export interface TelemetryProps {
  feature?: TelemetryFeature;
  /**
   * Local-only dedupe key for `discovery_chip_shown`, e.g. `${book}:${chapter}:${translationId}`.
   * Used to collapse repeat renders of the same chapter into one count.
   * NEVER sent to the server.
   */
  dedupeKey?: string;
}

interface QueuedEvent {
  name: TelemetryEvent;
  feature?: TelemetryFeature;
}

const EVENTS_URL = 'https://biblemarker.app/events';
/** Give up quickly so a slow/offline network never blocks app shutdown. */
const FETCH_TIMEOUT_MS = 5000;
const FLUSH_INTERVAL_MS = 30_000;
/** Flush as soon as the queue reaches this size, instead of waiting for the timer. */
const FLUSH_AT_QUEUE_SIZE = 20;
/** Cap on events sent in a single POST — the worker rejects a larger batch. */
const MAX_EVENTS_PER_REQUEST = 30;
/** Hard cap on the in-memory queue — oldest events are dropped beyond this. */
const MAX_QUEUE_SIZE = 200;

let queue: QueuedEvent[] = [];
/** Per-launch, in-memory only — never persisted or synced. */
let sessionId: string | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let visibilityAttached = false;
/** `discovery_chip_shown` dedupe set, keyed by the caller-supplied `dedupeKey`. */
const shownChipKeys = new Set<string>();
/** Coalesces a threshold-triggered flush to one microtask per burst — see `scheduleFlush`. */
let flushScheduled = false;

function getSessionId(): string {
  if (!sessionId) sessionId = crypto.randomUUID();
  return sessionId;
}

function onVisibilityChange(): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    void flush();
  }
}

/**
 * Defer the threshold-triggered flush to a microtask instead of running it
 * inline. This lets an entire synchronous burst of `track()` calls (e.g. a
 * chapter render that fires several chip-shown events back to back) finish
 * queuing before the queue is read, so `flush()`'s `MAX_EVENTS_PER_REQUEST`
 * cap is what actually bounds a request — not "however many happened to be
 * queued at the exact instant the 20th call ran."
 */
function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  queueMicrotask(() => {
    flushScheduled = false;
    void flush();
  });
}

/**
 * Record an event. Synchronous and never throws — drops silently (no queueing,
 * no network) unless the user has opted in. `discovery_chip_shown` is deduped
 * per `dedupeKey` for the life of the session so re-renders don't inflate counts.
 */
export function track(name: TelemetryEvent, props?: TelemetryProps): void {
  try {
    if (!usePreferencesStore.getState().telemetryEnabled) return;

    if (name === 'discovery_chip_shown' && props?.dedupeKey) {
      if (shownChipKeys.has(props.dedupeKey)) return;
      shownChipKeys.add(props.dedupeKey);
    }

    queue.push({ name, feature: props?.feature });
    if (queue.length > MAX_QUEUE_SIZE) {
      queue.splice(0, queue.length - MAX_QUEUE_SIZE);
    }

    if (queue.length >= FLUSH_AT_QUEUE_SIZE) {
      scheduleFlush();
    }
  } catch {
    // Telemetry must never break the caller.
  }
}

/**
 * Send up to `MAX_EVENTS_PER_REQUEST` queued events. Never throws. Bails —
 * and drops anything already queued — if the user has since opted out, so a
 * toggle flip mid-session can't flush a batch queued while opted in, and
 * nothing lingers in memory after opting out.
 */
async function flush(): Promise<void> {
  if (!usePreferencesStore.getState().telemetryEnabled) {
    queue = [];
    shownChipKeys.clear();
    return;
  }
  if (queue.length === 0) return;
  const batch = queue.splice(0, MAX_EVENTS_PER_REQUEST);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    await fetch(EVENTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: batch.map((e) => ({ name: e.name, feature: e.feature })),
        appVersion: __APP_VERSION__,
        platform: platformTag(),
        sessionId: getSessionId(),
      }),
      signal: controller.signal,
    });
  } catch {
    // Network error, timeout, or non-2xx: discard the batch. Telemetry never
    // retries and never surfaces a failure to the caller.
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Start the per-launch session: resets in-memory state, starts the periodic
 * flush timer, and (once) attaches the visibility-based flush. Call once at
 * app startup, next to `autoBackupService.start()`.
 */
export function initTelemetry(): void {
  sessionId = crypto.randomUUID();
  queue = [];
  shownChipKeys.clear();
  flushScheduled = false;

  if (flushTimer) clearInterval(flushTimer);
  flushTimer = setInterval(() => void flush(), FLUSH_INTERVAL_MS);

  if (!visibilityAttached && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
    visibilityAttached = true;
  }
}

/**
 * Stop the flush timer/listener and send one final, awaited flush. Best-effort:
 * a Tauri desktop window close doesn't reliably fire any of this, so loss at
 * quit is accepted — this only covers the in-app unmount path.
 */
export async function shutdownTelemetry(): Promise<void> {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
  if (visibilityAttached && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    visibilityAttached = false;
  }
  await flush();
}
