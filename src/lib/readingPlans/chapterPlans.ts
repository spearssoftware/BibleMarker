import type { ReadingPlan, ReadingPlanDay } from '@/types/readingPlan';
import type { ChapterRef } from './chapters';
import { planName } from './labels';
import { completedDays, isSupportedPlan, planProgress, sortPlans } from './progress';
import { generateSchedule } from './schedule';
import type { ScheduleDay } from './schedule';

/** A plan's relationship to the chapter the reader has open. */
export type ChapterPlanEntry =
  | {
      kind: 'current';
      planId: string;
      name: string;
      day: number;
      reading: ScheduleDay;
      /** The next chapter of the same day, if this is not the day's last. */
      nextInDay: ChapterRef | null;
    }
  | {
      kind: 'completed';
      planId: string;
      name: string;
      day: number;
      reading: ScheduleDay;
      /** The plan's new first incomplete day, or null when the plan is finished. */
      next: ScheduleDay | null;
    };

interface ChapterPlanInput {
  plans: readonly ReadingPlan[];
  dayRows: readonly ReadingPlanDay[];
  book: string;
  chapter: number;
  today: string;
  /** Day numbers completed from this chapter's end action, by plan id. */
  justCompleted: Readonly<Record<string, number>>;
}

const hasChapter = (day: ScheduleDay, book: string, chapter: number) =>
  day.chapters.some((c) => c.bookId === book && c.chapter === chapter);

/**
 * The plans that show something on this chapter, in list order: the day just
 * completed here (kept until the reader leaves), or the plan's current day.
 */
export function chapterPlanEntries({
  plans,
  dayRows,
  book,
  chapter,
  today,
  justCompleted,
}: ChapterPlanInput): ChapterPlanEntry[] {
  const entries: ChapterPlanEntry[] = [];
  for (const plan of sortPlans(plans, dayRows)) {
    if (!isSupportedPlan(plan)) continue;
    const name = planName(plan);
    const progress = planProgress(plan, dayRows, today);

    const doneDay = justCompleted[plan.id];
    if (doneDay !== undefined && completedDays(plan, dayRows).has(doneDay)) {
      const reading = generateSchedule(plan.scope, plan.days)[doneDay - 1];
      if (hasChapter(reading, book, chapter)) {
        entries.push({
          kind: 'completed',
          planId: plan.id,
          name,
          day: doneDay,
          reading,
          next: progress.status === 'active' ? progress.reading : null,
        });
        continue;
      }
    }

    if (progress.status !== 'active') continue;
    const index = progress.reading.chapters.findIndex((c) => c.bookId === book && c.chapter === chapter);
    if (index < 0) continue;
    entries.push({
      kind: 'current',
      planId: plan.id,
      name,
      day: progress.day,
      reading: progress.reading,
      nextInDay: progress.reading.chapters[index + 1] ?? null,
    });
  }
  return entries;
}
