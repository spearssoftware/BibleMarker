import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/shared';
import { useReadingPlanStore } from '@/stores/readingPlanStore';
import { planProgress, sortPlans, todayLocal } from '@/lib/readingPlans';
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

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

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

  if (!loaded) return null;

  // Recomputed each render, so a date change while the app is open applies on the next one.
  const today = todayLocal();

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
          {sortPlans(plans, dayRows).map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              progress={planProgress(plan, dayRows, today)}
              onOpen={() => setView({ kind: 'detail', planId: plan.id })}
              onNavigate={onNavigate}
            />
          ))}
        </>
      )}
    </div>
  );
}
