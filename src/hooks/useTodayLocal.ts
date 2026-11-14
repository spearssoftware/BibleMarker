import { useEffect, useState } from 'react';
import { todayLocal } from '@/lib/readingPlans';

function msUntilNextMidnight(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Today's local date as `YYYY-MM-DD`, kept current across midnight and when the app returns to the foreground. */
export function useTodayLocal(): string {
  const [today, setToday] = useState(() => todayLocal());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      setToday(todayLocal());
      clearTimeout(timer);
      timer = setTimeout(refresh, msUntilNextMidnight());
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    timer = setTimeout(refresh, msUntilNextMidnight());
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return today;
}
