/**
 * Discovery Store
 *
 * Chapter-level state for the Discover panel — repetition challenge,
 * Connector Lens, and the entity teaser. Owned by the always-mounted
 * `useDiscoveryHost` (called once from `MultiTranslationView`) so it keeps
 * working while the reader reads even when the panel itself is unmounted.
 * Plain Zustand, not persisted — a fresh reader should never boot up with
 * the lens left on or a stale "found" confirmation from a previous chapter.
 */

import { create } from 'zustand';
import type { ChapterAnalysis, ConnectorHit, RepetitionRung } from '@/lib/chapterAnalysis';
import type { TextSelection } from '@/stores/annotationStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';

/**
 * A rung on the Echo Hints reveal ladder, per echo. `'reference'` is the top
 * rung — once earned it must never be downgraded back to `'category'` (a
 * stale reveal for the same key arriving late shouldn't hide a reference the
 * reader already earned).
 */
export type EchoRung = 'category' | 'reference';

export interface DiscoveryFound {
  book: string;
  chapter: number;
  translationId: string;
  /** The reader's own selection that confirmed the repetition word. */
  selection: TextSelection;
}

export interface DiscoveryContext {
  book: string;
  chapter: number;
  translationId: string;
  analysis: ChapterAnalysis;
  /** Number of translation columns currently displayed. */
  translationCount: number;
  /** Abbreviation (not full name) of the primary translation, e.g. "NASB". */
  primaryTranslationAbbrev: string | null;
}

interface DiscoveryState {
  /**
   * Chapter identity + analysis + translation meta published by the host
   * hook as one atomic unit, so the panel (read on demand) never sees a
   * chapter's analysis paired with a different chapter's translation meta.
   */
  context: DiscoveryContext | null;

  /** Whether the Connector Lens dimming pass is active. */
  lensActive: boolean;
  /** The connector hit whose row/prompt is currently expanded, if any. */
  activePrompt: ConnectorHit | null;
  /** Set once the reader's own selection confirms the Repetition Radar word. */
  found: DiscoveryFound | null;
  /** Preset id after "Highlight it…" / "Mark it as a key word" succeeds. */
  markedPresetId: string | null;
  /**
   * Which hint-ladder rungs have been revealed so far, in reveal order.
   * Stored as the rung identifiers themselves (not a count) so a
   * late-arriving category hint — which changes rung order — can't
   * rewind or relabel a rung the reader already earned.
   */
  revealedRungs: RepetitionRung[];
  /**
   * Echo Hints reveal state, per echo — keyed `${book}.${chapter}:${verse}:${targetRef}`
   * (the caller's concern; book/chapter ride along in the key so a stale
   * entry can't collide across chapters even if the reset ever moves).
   * Parallel to `revealedRungs`, not a reuse of it: that field is a single
   * flat array for one challenge, while Echo Hints needs independent rung
   * state per echo.
   */
  revealedEchoes: Record<string, EchoRung>;

  setContext: (context: DiscoveryContext | null) => void;
  setLensActive: (active: boolean) => void;
  toggleLens: () => void;
  setActivePrompt: (hit: ConnectorHit | null) => void;
  setFound: (found: DiscoveryFound | null) => void;
  setMarkedPresetId: (id: string | null) => void;
  revealRung: (rung: RepetitionRung) => void;
  /** Monotone: a `'reference'` rung already recorded for `key` is never downgraded back to `'category'`. */
  revealEchoRung: (key: string, rung: EchoRung) => void;
  /** Clears all Discover-layer UI state except context — called when the chapter changes. */
  resetForChapter: () => void;
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  context: null,
  lensActive: false,
  activePrompt: null,
  found: null,
  markedPresetId: null,
  revealedRungs: [],
  revealedEchoes: {},

  setContext: (context) => set({ context }),
  setLensActive: (active) => set({ lensActive: active }),
  toggleLens: () => set({ lensActive: !get().lensActive }),
  setActivePrompt: (hit) => set({ activePrompt: hit }),
  setFound: (found) => set({ found }),
  setMarkedPresetId: (id) => set({ markedPresetId: id }),
  revealRung: (rung) => {
    const { revealedRungs } = get();
    if (revealedRungs.includes(rung)) return;
    set({ revealedRungs: [...revealedRungs, rung] });
  },
  revealEchoRung: (key, rung) => {
    const { revealedEchoes } = get();
    const current = revealedEchoes[key];
    if (current === 'reference' || current === rung) return;
    set({ revealedEchoes: { ...revealedEchoes, [key]: rung } });
  },
  resetForChapter: () =>
    set({
      lensActive: false,
      activePrompt: null,
      found: null,
      markedPresetId: null,
      revealedRungs: [],
      revealedEchoes: {},
    }),
}));

/**
 * Whether the Repetition Radar "found" state's marked preset is still real —
 * i.e. `markedPresetId` is set AND that preset hasn't since been deleted.
 * Used to decide whether "Highlight it…" should stay disabled (already
 * marked) or re-enable itself (the mark was undone from Key Words). Shared
 * between `RepetitionCard` and the `Toolbar` badge so both reach the same
 * conclusion about whether the mark is still live.
 */
export function useMarkedPresetExists(): boolean {
  const markedPresetId = useDiscoveryStore(s => s.markedPresetId);
  return useMarkingPresetStore(s => markedPresetId !== null && s.presets.some(p => p.id === markedPresetId));
}
