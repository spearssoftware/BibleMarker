import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ReadingPlan, ReadingPlanDay, ReadingPlanScope } from '@/types';
import {
  getAllReadingPlans,
  getAllReadingPlanDays,
  saveReadingPlan,
  saveReadingPlanDay,
  deleteReadingPlanDay,
  deleteReadingPlan,
} from '@/lib/database';
import {
  SCHEDULE_VERSION,
  generateSchedule,
  planProgress,
  readingPlanDayId,
  shiftedStartDate,
  todayLocal,
} from '@/lib/readingPlans';

/**
 * Every action writes to the database first and updates state only after the
 * write succeeds. A failed write throws and leaves state as it was; the caller
 * owns the "couldn't save" message.
 */
interface ReadingPlanState {
  plans: ReadingPlan[];
  dayRows: ReadingPlanDay[];
  loaded: boolean;

  loadPlans: () => Promise<void>;
  createPlan: (scope: ReadingPlanScope, days: number, today?: string) => Promise<ReadingPlan>;
  completeDay: (planId: string, day: number) => Promise<void>;
  uncompleteDay: (planId: string, day: number) => Promise<void>;
  /** Moves the start date so the first incomplete day is due today. No-op unless the plan is behind. */
  shiftDates: (planId: string, today?: string) => Promise<void>;
  deletePlan: (planId: string) => Promise<void>;
}

export const useReadingPlanStore = create<ReadingPlanState>()(
  persist(
    (set, get) => ({
      plans: [],
      dayRows: [],
      loaded: false,

      loadPlans: async () => {
        const [plans, dayRows] = await Promise.all([getAllReadingPlans(), getAllReadingPlanDays()]);
        set({ plans, dayRows, loaded: true });
      },

      createPlan: async (scope, days, today = todayLocal()) => {
        // Throws RangeError for a day count the selection cannot support, before anything is written.
        generateSchedule(scope, days);
        const now = new Date();
        const plan: ReadingPlan = {
          id: crypto.randomUUID(),
          scope,
          days,
          startDate: today,
          scheduleVersion: SCHEDULE_VERSION,
          createdAt: now,
          updatedAt: now,
        };
        await saveReadingPlan(plan);
        set({ plans: [...get().plans, plan] });
        return plan;
      },

      completeDay: async (planId, day) => {
        const plan = get().plans.find((p) => p.id === planId);
        if (!plan || !Number.isInteger(day) || day < 1 || day > plan.days) {
          throw new RangeError(`Day ${day} is not part of this reading plan.`);
        }
        const id = readingPlanDayId(planId, day);
        if (get().dayRows.some((row) => row.id === id)) return;
        const now = new Date();
        const row: ReadingPlanDay = { id, planId, day, completedAt: now, updatedAt: now };
        await saveReadingPlanDay(row);
        set({ dayRows: [...get().dayRows, row] });
      },

      uncompleteDay: async (planId, day) => {
        const id = readingPlanDayId(planId, day);
        await deleteReadingPlanDay(id);
        set({ dayRows: get().dayRows.filter((row) => row.id !== id) });
      },

      shiftDates: async (planId, today = todayLocal()) => {
        const plan = get().plans.find((p) => p.id === planId);
        if (!plan) return;
        const progress = planProgress(plan, get().dayRows, today);
        if (progress.status !== 'active' || progress.daysBehind === 0) return;
        const startDate = shiftedStartDate(progress.day, today);
        if (startDate === plan.startDate) return;
        const updated: ReadingPlan = { ...plan, startDate, updatedAt: new Date() };
        await saveReadingPlan(updated);
        set({ plans: get().plans.map((p) => (p.id === planId ? updated : p)) });
      },

      deletePlan: async (planId) => {
        await deleteReadingPlan(planId);
        set({
          plans: get().plans.filter((p) => p.id !== planId),
          dayRows: get().dayRows.filter((row) => row.planId !== planId),
        });
      },
    }),
    {
      name: 'reading-plan-store',
      partialize: (_state) => ({}),
    }
  )
);
