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
 * Progress on one cross-reference's "read them together" challenge, keyed by
 * the caller's row key. `opened` gates the passages being fetched/shown at
 * all; `found` accumulates the shared-word stems the reader has tapped
 * correctly (idempotent — tapping an already-found stem again is a no-op);
 * `shownAll` is set by "Show me" and, like `found`, is monotone — once true
 * it stays true regardless of what `found` does afterward.
 */
export interface CrossRefProgress {
  opened: boolean;
  found: string[];
  shownAll: boolean;
}

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
   * Cross-reference "read them together" progress, per row — keyed
   * `${book}.${chapter}:${verse}:${targetRef}` (the caller's concern;
   * book/chapter ride along in the key so a stale entry can't collide across
   * chapters even if the reset ever moves).
   */
  crossRefProgress: Record<string, CrossRefProgress>;

  setContext: (context: DiscoveryContext | null) => void;
  setLensActive: (active: boolean) => void;
  toggleLens: () => void;
  setActivePrompt: (hit: ConnectorHit | null) => void;
  setFound: (found: DiscoveryFound | null) => void;
  setMarkedPresetId: (id: string | null) => void;
  revealRung: (rung: RepetitionRung) => void;
  /** Idempotent: opening an already-opened row is a no-op. */
  openCrossRef: (key: string) => void;
  /** Idempotent per stem: tapping a stem already found for `key` is a no-op. */
  findCrossRefWord: (key: string, stem: string) => void;
  /** Idempotent: "Show me" on an already-`shownAll` row is a no-op. */
  showAllCrossRefWords: (key: string) => void;
  /** Clears all Discover-layer UI state except context — called when the chapter changes. */
  resetForChapter: () => void;
}

const EMPTY_CROSS_REF_PROGRESS: CrossRefProgress = { opened: false, found: [], shownAll: false };

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  context: null,
  lensActive: false,
  activePrompt: null,
  found: null,
  markedPresetId: null,
  revealedRungs: [],
  crossRefProgress: {},

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
  openCrossRef: (key) => {
    const { crossRefProgress } = get();
    const current = crossRefProgress[key] ?? EMPTY_CROSS_REF_PROGRESS;
    if (current.opened) return;
    set({ crossRefProgress: { ...crossRefProgress, [key]: { ...current, opened: true } } });
  },
  findCrossRefWord: (key, stem) => {
    const { crossRefProgress } = get();
    const current = crossRefProgress[key] ?? EMPTY_CROSS_REF_PROGRESS;
    if (current.found.includes(stem)) return;
    set({ crossRefProgress: { ...crossRefProgress, [key]: { ...current, found: [...current.found, stem] } } });
  },
  showAllCrossRefWords: (key) => {
    const { crossRefProgress } = get();
    const current = crossRefProgress[key] ?? EMPTY_CROSS_REF_PROGRESS;
    if (current.shownAll) return;
    set({ crossRefProgress: { ...crossRefProgress, [key]: { ...current, shownAll: true } } });
  },
  resetForChapter: () =>
    set({
      lensActive: false,
      activePrompt: null,
      found: null,
      markedPresetId: null,
      revealedRungs: [],
      crossRefProgress: {},
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
