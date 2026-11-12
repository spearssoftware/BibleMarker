/**
 * Discovery Store
 *
 * Chapter-level state for the Discover panel — the connector and
 * cross-reference lenses and their active rows. Owned by
 * the always-mounted `useDiscoveryHost` (called once from
 * `MultiTranslationView`) so it keeps working while the reader reads even
 * when the panel itself is unmounted. Plain Zustand, not persisted — a fresh
 * reader should never boot up with the lens left on from a previous chapter.
 */

import { useMemo } from 'react';
import { create } from 'zustand';
import type { ChapterAnalysis, ConnectorHit } from '@/lib/chapterAnalysis';
import type { CrossRefPassageRow } from '@/hooks/useCrossRefPassages';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import { singularize } from '@/lib/chapterAnalysis';
import { normalizeForMatching, presetAppliesToChapter, variantAppliesToChapter } from '@/lib/keywordMatching';
import { filterPresetsByStudy } from '@/lib/studyFilter';
import type { MarkingPreset } from '@/types';
import { track } from '@/lib/telemetry';
import { trackChip } from '@/lib/discoveryTelemetry';

/** Which reading-pane lens is on. Only one at a time — turning one on turns the other off. */
export type DiscoveryLens = 'connectors' | 'crossRefs' | null;

/** Cross-reference passages published by the host hook so the lens and the card share one source. */
export interface CrossRefPassages {
  rows: CrossRefPassageRow[];
  /** Fetches a network translation's target passage for one row; a no-op for local translations. */
  expand: (key: string) => void;
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
  /** Same, for cross-references to later passages (votes-ordered). */
  laterCrossRefPassages: CrossRefPassages;

  setContext: (context: DiscoveryContext | null) => void;
  setLens: (lens: DiscoveryLens) => void;
  /** Turns `kind` on, or off if it is already the active lens. */
  toggleLens: (kind: Exclude<DiscoveryLens, null>) => void;
  setActivePrompt: (hit: ConnectorHit | null) => void;
  setActiveCrossRefKey: (key: string | null) => void;
  /** Marks a cross-reference row active and records the tap — the one path for both the card and the lens. */
  activateCrossRef: (key: string) => void;
  setCrossRefPassages: (passages: CrossRefPassages) => void;
  setLaterCrossRefPassages: (passages: CrossRefPassages) => void;
  /** Clears all Discover-layer UI state except context — called when the chapter changes. */
  resetForChapter: () => void;
}

const NO_CROSS_REF_PASSAGES: CrossRefPassages = { rows: [], expand: () => {} };

export const useDiscoveryStore = create<DiscoveryState>((set, get) => ({
  context: null,
  lens: null,
  activePrompt: null,
  activeCrossRefKey: null,
  crossRefPassages: NO_CROSS_REF_PASSAGES,
  laterCrossRefPassages: NO_CROSS_REF_PASSAGES,

  setContext: (context) => set({ context }),
  setLens: (lens) => set({ lens }),
  toggleLens: (kind) => set({ lens: get().lens === kind ? null : kind }),
  setActivePrompt: (hit) => set({ activePrompt: hit }),
  setActiveCrossRefKey: (key) => set({ activeCrossRefKey: key }),
  activateCrossRef: (key) => {
    const { context, laterCrossRefPassages } = get();
    set({ activeCrossRefKey: key });
    if (laterCrossRefPassages.rows.some(row => row.key === key)) {
      if (context) trackChip('discovery_chip_tapped', 'crossref_later', context);
      return;
    }
    track('discovery_chip_tapped', { feature: 'crossref', dedupeKey: `crossref-tap:${key}` });
  },
  setCrossRefPassages: (passages) => set({ crossRefPassages: passages }),
  setLaterCrossRefPassages: (passages) => set({ laterCrossRefPassages: passages }),
  resetForChapter: () =>
    set({
      lens: null,
      activePrompt: null,
      activeCrossRefKey: null,
    }),
}));

/**
 * A (study-filtered) preset counts as "the repetition word is marked" when
 * its scope covers this book+chapter, it applies to this translation, and
 * its word — or any variant applicable here — singularizes to the analysis
 * token. This is how the card knows the word is marked, whether by its own
 * button, by a revisit, or by a key word the reader made on their own.
 */
export function presetMarksToken(preset: MarkingPreset, token: string, book: string, chapter: number, translationId: string): boolean {
  if (preset.moduleScope && preset.moduleScope !== translationId) return false;
  if (!presetAppliesToChapter(preset, book, chapter)) return false;
  const matchesToken = (text: string | undefined): boolean =>
    text !== undefined && singularize(normalizeForMatching(text)) === token;
  if (matchesToken(preset.word)) return true;
  return preset.variants.some(v => variantAppliesToChapter(v, book, chapter) && matchesToken(v.text));
}

/** The reader's existing key word that already marks the current chapter's repetition word, if any. */
export function useRepetitionKeyword(
  token: string,
  book: string,
  chapter: number,
  translationId: string
): MarkingPreset | undefined {
  const presets = useMarkingPresetStore(s => s.presets);
  const activeStudyId = useStudyStore(s => s.activeStudyId);
  return useMemo(
    () => filterPresetsByStudy(presets, activeStudyId).find(p => presetMarksToken(p, token, book, chapter, translationId)),
    [presets, activeStudyId, token, book, chapter, translationId]
  );
}
