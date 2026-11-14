import type { ReadingPlan } from '@/types';
import type { PlanProgress } from '@/lib/readingPlans';
import { planName, readingLabel } from '@/lib/readingPlans';
import { Button } from '@/components/shared';
import { confirmAndRemovePlan, goToChapter, shiftPlanDates } from './planActions';

const CARD_CLASSES = 'p-4 bg-scripture-surface rounded-xl border border-scripture-border/50 shadow-sm space-y-3';

interface PlanCardProps {
  plan: ReadingPlan;
  progress: PlanProgress;
  onOpen: () => void;
  /** Called after "Read" has moved the reader to the day's first chapter. */
  onNavigate: () => void;
}

export function PlanCard({ plan, progress, onOpen, onNavigate }: PlanCardProps) {
  if (progress.status === 'unsupported') {
    return (
      <li className={CARD_CLASSES}>
        <h3 className="font-medium text-scripture-text break-words">{planName(plan)}</h3>
        <p className="text-sm text-scripture-muted">This plan needs a newer version of BibleMarker.</p>
        <Button variant="destructive" size="sm" onClick={() => confirmAndRemovePlan(plan.id)}>
          Delete plan
        </Button>
      </li>
    );
  }

  return (
    <li className={CARD_CLASSES}>
      <h3>
        <Button variant="ghost" size="sm" onClick={onOpen} className="text-left break-words">
          {planName(plan)}
        </Button>
      </h3>

      {progress.status === 'finished' ? (
        <p className="text-sm text-scripture-muted">Finished</p>
      ) : (
        <>
          <div>
            <div className="text-sm text-scripture-muted">
              Day {progress.day} of {progress.totalDays}
            </div>
            <div className="text-scripture-text">{readingLabel(progress.reading)}</div>
          </div>
          {progress.daysBehind > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-scripture-muted">
                {progress.daysBehind === 1 ? '1 day behind' : `${progress.daysBehind} days behind`}
              </span>
              <Button variant="secondary" size="sm" onClick={() => shiftPlanDates(plan.id)}>
                Shift my dates
              </Button>
            </div>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              goToChapter(progress.reading.chapters[0]);
              onNavigate();
            }}
          >
            Read
          </Button>
        </>
      )}
    </li>
  );
}
