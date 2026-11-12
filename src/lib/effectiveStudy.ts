/**
 * Effective study
 *
 * The study that marks are stamped with and filtered by. Only Study mode works
 * in the selected study; Read and Discover work with no study ("My Bible").
 */

import type { AppMode } from '@/stores/appModeStore';
import { useStudyStore } from '@/stores/studyStore';
import { getEffectiveMode, useEffectiveMode } from '@/lib/effectiveMode';

/** `mode` is the effective mode. */
export function effectiveStudyId(mode: AppMode, activeStudyId: string | null): string | null {
  return mode === 'study' ? activeStudyId : null;
}

export function useEffectiveStudyId(): string | null {
  const activeStudyId = useStudyStore(state => state.activeStudyId);
  return effectiveStudyId(useEffectiveMode(), activeStudyId);
}

export function getEffectiveStudyId(): string | null {
  return effectiveStudyId(getEffectiveMode(), useStudyStore.getState().activeStudyId);
}
