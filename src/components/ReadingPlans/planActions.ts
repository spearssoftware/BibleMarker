import type { ReadingPlanScope } from '@/types';
import type { ChapterRef } from '@/lib/readingPlans';
import { useReadingPlanStore } from '@/stores/readingPlanStore';
import { useBibleStore } from '@/stores/bibleStore';
import { toast } from '@/stores/toastStore';
import { confirmDialog } from '@/stores/confirmDialogStore';

export const SAVE_ERROR = "Couldn't save your reading plan. Try again.";

/** Runs a store write; a failure is logged and shown as a toast, and the caller's screen stays as it was. */
export async function runPlanAction(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (error) {
    console.error('Reading plan action failed:', error);
    toast.error(SAVE_ERROR);
    return false;
  }
}

export const startPlan = (scope: ReadingPlanScope, days: number) =>
  runPlanAction(() => useReadingPlanStore.getState().createPlan(scope, days));

export const markDayComplete = (planId: string, day: number) =>
  runPlanAction(() => useReadingPlanStore.getState().completeDay(planId, day));

export const unmarkDay = (planId: string, day: number) =>
  runPlanAction(() => useReadingPlanStore.getState().uncompleteDay(planId, day));

export const shiftPlanDates = (planId: string) =>
  runPlanAction(() => useReadingPlanStore.getState().shiftDates(planId));

export const removePlan = (planId: string) =>
  runPlanAction(() => useReadingPlanStore.getState().deletePlan(planId));

export function goToChapter(ref: ChapterRef): void {
  useBibleStore.getState().setLocation(ref.bookId, ref.chapter);
}

/** Asks first; resolves true only when the plan was confirmed and deleted. */
export async function confirmAndRemovePlan(planId: string): Promise<boolean> {
  const confirmed = await confirmDialog({
    title: 'Delete this plan?',
    message: 'Your marks and notes in the text are not affected.',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
  });
  return confirmed && removePlan(planId);
}
