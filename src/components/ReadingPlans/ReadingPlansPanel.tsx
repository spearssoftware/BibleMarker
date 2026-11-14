import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/shared';
import { useReadingPlanStore } from '@/stores/readingPlanStore';
import { planProgress, sortPlans } from '@/lib/readingPlans';
import { useTodayLocal } from '@/hooks/useTodayLocal';
import { NewPlanForm } from './NewPlanForm';
import { PlanCard } from './PlanCard';
import { PlanDetail } from './PlanDetail';

type View = { kind: 'list' } | { kind: 'new' } | { kind: 'detail'; planId: string };

interface ReadingPlansPanelProps {
  /** Called after a plan moved the reader to a chapter, so the host can close the panel if it covers the text. */
  onNavigate: () => void;
}

export function ReadingPlansPanel({ onNavigate }: ReadingPlansPanelProps) {
  const plans = useReadingPlanStore((state) => state.plans);
  const dayRows = useReadingPlanStore((state) => state.dayRows);
  const loaded = useReadingPlanStore((state) => state.loaded);
  const loadPlans = useReadingPlanStore((state) => state.loadPlans);
  const [view, setView] = useState<View>({ kind: 'list' });

  const [loadFailed, setLoadFailed] = useState(false);
  const today = useTodayLocal();

  const load = useCallback(() => {
    loadPlans().catch((error) => {
      console.error('Loading reading plans failed:', error);
      setLoadFailed(true);
    });
  }, [loadPlans]);

  useEffect(load, [load]);

  const retry = () => {
    setLoadFailed(false);
    load();
  };

  const showList = useCallback(() => setView({ kind: 'list' }), []);

  if (view.kind === 'detail') {
    return <PlanDetail planId={view.planId} onBack={showList} onNavigate={onNavigate} />;
  }

  if (view.kind === 'new') {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <NewPlanForm onCancel={showList} onCreated={showList} />
      </div>
    );
  }

  if (!loaded && loadFailed) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        <p role="alert" className="text-sm text-scripture-error">
          Couldn't load your reading plans.
        </p>
        <Button variant="secondary" onClick={retry}>
          Try again
        </Button>
      </div>
    );
  }

  if (!loaded) return null;

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
      {plans.length === 0 ? (
        <>
          <p className="text-sm text-scripture-muted">No reading plans yet.</p>
          <Button variant="primary" onClick={() => setView({ kind: 'new' })}>
            New plan
          </Button>
        </>
      ) : (
        <>
          <Button variant="primary" onClick={() => setView({ kind: 'new' })}>
            New plan
          </Button>
          <ul className="space-y-3">
            {sortPlans(plans, dayRows).map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                progress={planProgress(plan, dayRows, today)}
                onOpen={() => setView({ kind: 'detail', planId: plan.id })}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
