import type { ReadingPlan, ReadingPlanDay } from '@/types/readingPlan';
import { isValidScope, selectionChapters } from './chapters';
import { daysBehind, isValidDateString } from './dates';
import { SCHEDULE_VERSION, generateSchedule } from './schedule';
import type { ScheduleDay } from './schedule';

export type PlanProgress =
  | { status: 'unsupported' }
  | { status: 'finished' }
  | { status: 'active'; day: number; totalDays: number; reading: ScheduleDay; daysBehind: number };

export function readingPlanDayId(planId: string, day: number): string {
  return `${planId}:${day}`;
}

/** False for plans written by a newer version: unknown schedule rule or a scope this build cannot read. */
export function isSupportedPlan(plan: ReadingPlan): boolean {
  return (
    plan.scheduleVersion === SCHEDULE_VERSION &&
    isValidScope(plan.scope) &&
    Number.isInteger(plan.days) &&
    plan.days >= 1 &&
    plan.days <= selectionChapters(plan.scope).length &&
    isValidDateString(plan.startDate)
  );
}

/** Completed day numbers of `plan`; rows of other plans and days beyond its length are ignored. */
export function completedDays(plan: ReadingPlan, dayRows: readonly ReadingPlanDay[]): Set<number> {
  const done = new Set<number>();
  for (const row of dayRows) {
    if (row.planId === plan.id && Number.isInteger(row.day) && row.day >= 1 && row.day <= plan.days) {
      done.add(row.day);
    }
  }
  return done;
}

export function planProgress(
  plan: ReadingPlan,
  dayRows: readonly ReadingPlanDay[],
  today: string
): PlanProgress {
  if (!isSupportedPlan(plan)) return { status: 'unsupported' };
  const done = completedDays(plan, dayRows);
  let day = 1;
  while (day <= plan.days && done.has(day)) day++;
  if (day > plan.days) return { status: 'finished' };
  return {
    status: 'active',
    day,
    totalDays: plan.days,
    reading: generateSchedule(plan.scope, plan.days)[day - 1],
    daysBehind: daysBehind(plan.startDate, day, today),
  };
}

/** Unfinished plans first, newest first within each group. */
export function sortPlans(
  plans: readonly ReadingPlan[],
  dayRows: readonly ReadingPlanDay[]
): ReadingPlan[] {
  const finished = (plan: ReadingPlan) =>
    isSupportedPlan(plan) && completedDays(plan, dayRows).size >= plan.days;
  const created = (plan: ReadingPlan) => new Date(plan.createdAt).getTime();
  return [...plans].sort(
    (a, b) => Number(finished(a)) - Number(finished(b)) || created(b) - created(a)
  );
}
