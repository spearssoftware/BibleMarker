import { useLayoutEffect, useMemo, useRef } from 'react';
import { Button, Checkbox } from '@/components/shared';
import { useReadingPlanStore } from '@/stores/readingPlanStore';
import {
  completedDays,
  generateSchedule,
  isSupportedPlan,
  planName,
  readingLabel,
} from '@/lib/readingPlans';
import { confirmAndRemovePlan, goToChapter, markDayComplete, unmarkDay } from './planActions';

interface PlanDetailProps {
  planId: string;
  onBack: () => void;
  /** Called after a reading has moved the reader to its first chapter. */
  onNavigate: () => void;
}

export function PlanDetail({ planId, onBack, onNavigate }: PlanDetailProps) {
  const plan = useReadingPlanStore((state) => state.plans.find((p) => p.id === planId));
  const dayRows = useReadingPlanStore((state) => state.dayRows);
  const supported = plan !== undefined && isSupportedPlan(plan);
  const schedule = useMemo(() => (plan && supported ? generateSchedule(plan.scope, plan.days) : []), [plan, supported]);
  const done = useMemo(() => (plan ? completedDays(plan, dayRows) : new Set<number>()), [plan, dayRows]);

  const listRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(new Set<number>());
  const firstIncompleteRef = useRef<number | null>(null);
  if (firstIncompleteRef.current === null) {
    let day = 1;
    while (done.has(day)) day++;
    firstIncompleteRef.current = day;
  }

  // The plan can disappear while open (a sync removed it); there is nothing left to show.
  useLayoutEffect(() => {
    if (!plan || !supported) onBack();
  }, [plan, supported, onBack]);

  // Open with the first incomplete day at the top of the list. The list is the positioned
  // scroller, so offsetTop is relative to it and ancestors stay put.
  useLayoutEffect(() => {
    if (firstIncompleteRef.current === 1) return;
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-day="${firstIncompleteRef.current}"]`);
    if (list && row) list.scrollTop = row.offsetTop;
  }, []);

  if (!plan || !supported) return null;

  const toggle = async (day: number, checked: boolean) => {
    if (inFlightRef.current.has(day)) return;
    inFlightRef.current.add(day);
    try {
      await (checked ? markDayComplete(plan.id, day) : unmarkDay(plan.id, day));
    } finally {
      inFlightRef.current.delete(day);
    }
  };

  const handleDelete = async () => {
    if (await confirmAndRemovePlan(plan.id)) onBack();
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-3 p-4 pb-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
        <h3 className="flex-1 min-w-0 text-base font-ui font-semibold text-scripture-text break-words">
          {planName(plan)}
        </h3>
        <Button variant="destructive" size="sm" onClick={handleDelete}>
          Delete plan
        </Button>
      </div>

      <div ref={listRef} className="relative flex-1 min-h-0 overflow-y-auto px-4 pb-4">
        <ol className="space-y-1">
          {schedule.map((entry, index) => {
            const day = index + 1;
            const label = readingLabel(entry);
            return (
              <li key={day} data-day={day} className="flex items-center gap-2 min-h-[44px]">
                <Checkbox
                  id={`plan-${plan.id}-day-${day}`}
                  aria-label={`Day ${day}: ${label}`}
                  checked={done.has(day)}
                  onChange={(e) => toggle(day, e.target.checked)}
                />
                <span className="text-sm text-scripture-muted">Day {day}:</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    goToChapter(entry.chapters[0]);
                    onNavigate();
                  }}
                >
                  {label}
                </Button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
