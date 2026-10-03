/**
 * Discovery Store
 *
 * Chapter-level state for the Discover panel — repetition challenge, the
 * connector and cross-reference lenses, and the entity teaser. Owned by the always-mounted
 * `useDiscoveryHost` (called once from `MultiTranslationView`) so it keeps
 * working while the reader reads even when the panel itself is unmounted.
 * Plain Zustand, not persisted — a fresh reader should never boot up with
 * the lens left on or a stale "found" confirmation from a previous chapter.
 */

import { create } from 'zustand';
import type { ChapterAnalysis, ConnectorHit, RepetitionRung } from '@/lib/chapterAnalysis';
import type { CrossRefPassageRow } from '@/hooks/useCrossRefPassages';
import type { TextSelection } from '@/stores/annotationStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { track } from '@/lib/telemetry';

/** Which reading-pane lens is on. Only one at a time — turning one on turns the other off. */
export type DiscoveryLens = 'connectors' | 'crossRefs' | null;

/**
 * Progress on one cross-reference's optional shared-word hunt, keyed by the
 * caller's row key. By default a row shows its shared words already lit;
 * `hunting` is set when the reader chooses to find them unaided and cleared
 * by "Show me". `found` accumulates the stems the reader has tapped
 * correctly (idempotent — tapping an already-found stem again is a no-op)
 * and survives the hunt being switched off and on.
 */
export interface CrossRefProgress {
  hunting: boolean;
  found: string[];
}

/** Cross-reference passages published by the host hook so the lens and the card share one source. */
export interface CrossRefPassages {
  rows: CrossRefPassageRow[];
  /** Fetches a network translation's target passage for one row; a no-op for local translations. */
  expand: (key: string) => void;
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

  /** Which lens dimming pass is active in the reading pane, if any. */
  lens: DiscoveryLens;
  /** The connector hit whose row/prompt is currently expanded, if any. */
  activePrompt: ConnectorHit | null;
  /** Row key of the cross-reference whose passages are currently expanded, if any. */
  activeCrossRefKey: string | null;
  /**
   * Cross-reference rows for the current chapter, published by
   * `useDiscoveryHost` so they exist while the panel is unmounted — the
   * cross-reference lens needs them to know which verses to light.
   */
  crossRefPassages: CrossRefPassages;
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
   * Cross-reference shared-word hunt progress, per row — keyed
   * `${book}.${chapter}:${verse}:${targetRef}` (the caller's concern;
   * book/chapter ride along in the key so a stale entry can't collide across
   * chapters even if the reset ever moves).
   */
  crossRefProgress: Record<string, CrossRefProgress>;

  setContext: (context: DiscoveryContext | null) => void;
  setLens: (lens: DiscoveryLens) => void;
  /** Turns `kind` on, or off if it is already the active lens. */
  toggleLens: (kind: Exclude<DiscoveryLens, null>) => void;
  setActivePrompt: (hit: ConnectorHit | null) => void;
  setActiveCrossRefKey: (key: string | null) => void;
  /** Marks a cross-reference row active and records the tap — the one path for both the card and the lens. */
  activateCrossRef: (key: string) => void;
  setCrossRefPassages: (passages: CrossRefPassages) => void;
  setFound: (found: DiscoveryFound | null) => void;
  setMarkedPresetId: (id: string | null) => void;
  revealRung: (rung: RepetitionRung) => void;
  setCrossRefHunting: (key: string, hunting: boolean) => void;
  /** Idempotent per stem: tapping a stem already found for `key` is a no-op. */
  findCrossRefWord: (key: string, stem: string) => void;
  /** Clears all Discover-layer UI state except context — called when the chapter changes. */
  resetForChapter: () => void;
}

export const EMPTY_CROSS_REF_PROGRESS: CrossRefProgress = { hunting: false, found: [] };
const NO_CROSS_REF_PASSAGES: CrossRefPassages = { rows: [], expand: () => {} };

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  context: null,
  lens: null,
  activePrompt: null,
  activeCrossRefKey: null,
  crossRefPassages: NO_CROSS_REF_PASSAGES,
  found: null,
  markedPresetId: null,
  revealedRungs: [],
  crossRefProgress: {},

  setContext: (context) => set({ context }),
  setLens: (lens) => set({ lens }),
  toggleLens: (kind) => set({ lens: get().lens === kind ? null : kind }),
  setActivePrompt: (hit) => set({ activePrompt: hit }),
  setActiveCrossRefKey: (key) => set({ activeCrossRefKey: key }),
  activateCrossRef: (key) => {
    set({ activeCrossRefKey: key });
    track('discovery_chip_tapped', { feature: 'crossref', dedupeKey: `crossref-tap:${key}` });
  },
  setCrossRefPassages: (passages) => set({ crossRefPassages: passages }),
  setFound: (found) => set({ found }),
  setMarkedPresetId: (id) => set({ markedPresetId: id }),
  revealRung: (rung) => {
    const { revealedRungs } = get();
    if (revealedRungs.includes(rung)) return;
    set({ revealedRungs: [...revealedRungs, rung] });
  },
  setCrossRefHunting: (key, hunting) => {
    const { crossRefProgress } = get();
    const current = crossRefProgress[key] ?? EMPTY_CROSS_REF_PROGRESS;
    if (current.hunting === hunting) return;
    set({ crossRefProgress: { ...crossRefProgress, [key]: { ...current, hunting } } });
  },
  findCrossRefWord: (key, stem) => {
    const { crossRefProgress } = get();
    const current = crossRefProgress[key] ?? EMPTY_CROSS_REF_PROGRESS;
    if (current.found.includes(stem)) return;
    set({ crossRefProgress: { ...crossRefProgress, [key]: { ...current, found: [...current.found, stem] } } });
  },
  resetForChapter: () =>
    set({
      lens: null,
      activePrompt: null,
      activeCrossRefKey: null,
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
