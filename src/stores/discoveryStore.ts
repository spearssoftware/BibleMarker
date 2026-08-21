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

export interface DiscoveryFound {
  book: string;
  chapter: number;
  translationId: string;
  /** The reader's own selection that confirmed the repetition word. */
  selection: TextSelection;
}

interface DiscoveryState {
  /** Chapter analysis published by the host hook; read by the panel on demand. */
  analysis: ChapterAnalysis | null;
  /** Number of translation columns currently displayed. */
  translationCount: number;
  /** Abbreviation (not full name) of the primary translation, e.g. "NASB". */
  primaryTranslationAbbrev: string | null;

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

  setAnalysis: (analysis: ChapterAnalysis | null) => void;
  setTranslationMeta: (translationCount: number, primaryTranslationAbbrev: string | null) => void;
  setLensActive: (active: boolean) => void;
  toggleLens: () => void;
  setActivePrompt: (hit: ConnectorHit | null) => void;
  setFound: (found: DiscoveryFound | null) => void;
  setMarkedPresetId: (id: string | null) => void;
  revealRung: (rung: RepetitionRung) => void;
  /** Clears all Discover-layer UI state except analysis/translation meta — called when the chapter changes. */
  resetForChapter: () => void;
}

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  analysis: null,
  translationCount: 1,
  primaryTranslationAbbrev: null,
  lensActive: false,
  activePrompt: null,
  found: null,
  markedPresetId: null,
  revealedRungs: [],

  setAnalysis: (analysis) => set({ analysis }),
  setTranslationMeta: (translationCount, primaryTranslationAbbrev) =>
    set({ translationCount, primaryTranslationAbbrev }),
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
  resetForChapter: () =>
    set({
      lensActive: false,
      activePrompt: null,
      found: null,
      markedPresetId: null,
      revealedRungs: [],
    }),
}));
