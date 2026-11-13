export type ReadingPlanScope =
  | { kind: 'bible' }
  | { kind: 'ot' }
  | { kind: 'nt' }
  | { kind: 'book'; bookId: string };

export interface ReadingPlan {
  id: string;
  scope: ReadingPlanScope;
  days: number;
  /** Local calendar date `YYYY-MM-DD` on which day 1 is due. */
  startDate: string;
  scheduleVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

/** One row per completed day; the day is complete if and only if its row exists. */
export interface ReadingPlanDay {
  /** `{planId}:{day}` */
  id: string;
  planId: string;
  /** 1-based day number */
  day: number;
  completedAt: Date;
  updatedAt: Date;
}
