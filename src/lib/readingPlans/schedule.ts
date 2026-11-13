import { KJV_VERSE_COUNTS } from '@/types/bible';
import type { ReadingPlanScope } from '@/types/readingPlan';
import { selectionChapters } from './chapters';
import type { ChapterRef } from './chapters';

/** The balancing rule below is version 1; a plan records it so a later rule cannot move its days. */
export const SCHEDULE_VERSION = 1;

export interface ScheduleDay {
  /** 1-based */
  readonly day: number;
  readonly chapters: ReadonlyArray<Readonly<ChapterRef>>;
}

/** Schedules are cached and shared between callers, so they are read-only. */
export type Schedule = ReadonlyArray<ScheduleDay>;

const cache = new Map<string, Schedule>();

/**
 * Returns the exclusive end index of each of `days` runs over chapters with the
 * given verse counts. Day `d` (d < days) ends at the chapter index `e`, chosen from
 * `previous end + 1 … C − (days − d)`, that minimises |cum(e) × days − d × total|
 * in integers; on a tie the earlier chapter wins. The last day takes the rest.
 */
export function splitByVerses(verseCounts: readonly number[], days: number): number[] {
  const count = verseCounts.length;
  const cum = [0];
  for (const n of verseCounts) cum.push(cum[cum.length - 1] + n);
  const total = cum[count];

  const ends: number[] = [];
  let previousEnd = 0;
  for (let d = 1; d < days; d++) {
    const target = d * total;
    let end = previousEnd + 1;
    let best = Infinity;
    for (let e = previousEnd + 1; e <= count - (days - d); e++) {
      const diff = cum[e] * days - target;
      const distance = Math.abs(diff);
      if (distance < best) {
        best = distance;
        end = e;
      }
      // cum is strictly increasing, so distances only grow once past the target.
      if (diff >= 0) break;
    }
    ends.push(end);
    previousEnd = end;
  }
  ends.push(count);
  return ends;
}

/** Splits the selection into `days` contiguous runs of whole chapters, balanced by KJV verse count. */
export function generateSchedule(scope: ReadingPlanScope, days: number): Schedule {
  const chapters = selectionChapters(scope);
  if (!Number.isInteger(days) || days < 1 || days > chapters.length) {
    throw new RangeError(`Choose between 1 and ${chapters.length} days.`);
  }

  const key = `${scope.kind}:${scope.kind === 'book' ? scope.bookId : ''}:${days}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const ends = splitByVerses(
    chapters.map(({ bookId, chapter }) => KJV_VERSE_COUNTS[bookId][chapter - 1]),
    days
  );
  const schedule: Schedule = ends.map((end, i) => ({
    day: i + 1,
    chapters: chapters.slice(i === 0 ? 0 : ends[i - 1], end),
  }));
  cache.set(key, schedule);
  return schedule;
}
