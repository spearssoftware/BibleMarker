import { useCallback, useEffect, useMemo, useState } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useReadingPlanStore } from '@/stores/readingPlanStore';
import { markDayComplete } from '@/components/ReadingPlans/planActions';
import { chapterPlanEntries, todayLocal } from '@/lib/readingPlans';

interface JustCompleted {
  /** The chapter these marks were made on, as `book:chapter`. */
  key: string;
  byPlan: Record<string, number>;
}

const chapterKey = (book: string, chapter: number) => `${book}:${chapter}`;

/**
 * The reading plans that apply to the open chapter, plus the action that
 * completes a plan's day from the chapter's end. A completed day is remembered
 * until the reader leaves the chapter, so its strip and confirmation stay put
 * even though the plan's current day has moved on.
 */
export function useReaderPlans(book: string, chapter: number) {
  const plans = useReadingPlanStore((s) => s.plans);
  const dayRows = useReadingPlanStore((s) => s.dayRows);
  const key = chapterKey(book, chapter);
  const [completed, setCompleted] = useState<JustCompleted>({ key, byPlan: {} });
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  // A→B→A must not bring the first visit's marks back, so leaving the chapter clears them.
  useEffect(
    () =>
      useBibleStore.subscribe((state, prev) => {
        if (state.currentBook === prev.currentBook && state.currentChapter === prev.currentChapter) return;
        setCompleted({ key: chapterKey(state.currentBook, state.currentChapter), byPlan: {} });
      }),
    []
  );

  const today = todayLocal();
  const justCompleted = completed.key === key ? completed.byPlan : undefined;
  const entries = useMemo(
    () => chapterPlanEntries({ plans, dayRows, book, chapter, today, justCompleted: justCompleted ?? {} }),
    [plans, dayRows, book, chapter, today, justCompleted]
  );

  const complete = useCallback(
    async (planId: string, day: number) => {
      setPending((cur) => new Set(cur).add(planId));
      const ok = await markDayComplete(planId, day);
      setPending((cur) => {
        const next = new Set(cur);
        next.delete(planId);
        return next;
      });
      if (!ok) return;
      const { currentBook, currentChapter } = useBibleStore.getState();
      if (chapterKey(currentBook, currentChapter) !== key) return;
      setCompleted((cur) => ({
        key,
        byPlan: { ...(cur.key === key ? cur.byPlan : {}), [planId]: day },
      }));
    },
    [key]
  );

  return { entries, complete, pending };
}
