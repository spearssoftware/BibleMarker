/**
 * Discovery Actions
 *
 * The "every discovery resolves into a mark" plumbing for the Discover
 * layer's chips — Repetition Radar's "mark it" action and Connector Lens'
 * "Add to Flow" action. Kept out of the components so the chips stay pure
 * presentation.
 *
 * `markRepetitionAsKeyword` deliberately does *only* `createMarkingPreset` +
 * `useMarkingPresetStore.getState().addPreset` — the visible ripple across
 * the chapter comes from the virtual-annotation keyword matching `VerseText`
 * already does on every render, not from an explicit "apply to selection"
 * step. `Toolbar.quickAddKeyword` still needs an explicit apply (it also
 * highlights the exact selection immediately via a `useAnnotations` closure
 * that can't be lifted into a plain lib function), so it calls
 * `createBookScopedKeywordPreset` and then its own `applyPresetToSelection`.
 */

import type { VerseRef, MarkingPreset, KeyWordCategory, HighlightColor, SymbolKey, Variant } from '@/types';
import { createMarkingPreset, getRandomHighlightColor, normalizeVariants } from '@/types';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useConclusionStore } from '@/stores/conclusionStore';
import { usePanelStore } from '@/stores/panelStore';
import type { TextSelection } from '@/stores/annotationStore';
import type { ConnectorHit, RepetitionResult } from '@/lib/chapterAnalysis';

/**
 * Create a marking preset scoped to a single book (the discovery on-ramp
 * never goes global) and persist it via the marking-preset store.
 */
export async function createBookScopedKeywordPreset(options: {
  word: string;
  variants?: string[] | Variant[];
  book: string;
  studyId?: string;
  category?: KeyWordCategory;
  symbol?: SymbolKey;
  highlight: { style: 'none' | 'highlight' | 'textColor' | 'underline'; color: HighlightColor };
}): Promise<MarkingPreset> {
  const { word, variants, book, studyId, category, symbol, highlight } = options;
  const preset = createMarkingPreset({
    word,
    variants,
    symbol,
    highlight,
    category,
    studyId,
    scopes: [{ book }],
  });

  await useMarkingPresetStore.getState().addPreset(preset);
  return preset;
}

/**
 * Repetition Radar's "Highlight it everywhere" / "Mark it as a key word"
 * action — a highlight-only preset (never `style: 'none'`, which would
 * produce no visible decoration at all per `presetHasDecoration`), no
 * symbol, `category: 'custom'`, scoped to the book the reader found it in.
 *
 * `repetition.forms` (the distinct raw surface forms that tallied into the
 * token - e.g. "word"/"words") seed the preset's variants, minus whichever
 * form matches the reader's own selected text, so the ripple also catches
 * sibling forms without the reader having to add them by hand.
 */
export async function markRepetitionAsKeyword(
  selection: TextSelection,
  activeStudyId?: string,
  repetition?: RepetitionResult | null
): Promise<MarkingPreset> {
  const word = selection.text.trim();
  const color = getRandomHighlightColor();
  const normalizedWord = word.toLowerCase();
  const otherForms = (repetition?.forms ?? []).filter(form => form.toLowerCase() !== normalizedWord);

  return createBookScopedKeywordPreset({
    word,
    variants: normalizeVariants(otherForms),
    book: selection.book,
    studyId: activeStudyId,
    category: 'custom',
    highlight: { style: 'highlight', color },
  });
}

/**
 * Connector Lens' "Add to Flow" action — creates a Conclusion for the
 * tapped connector and opens the Observe panel to the Flow tab so the
 * reader sees it land.
 */
export async function addConnectorToFlow(hit: ConnectorHit, book: string, chapter: number): Promise<void> {
  const verseRef: VerseRef = { book, chapter, verse: hit.verse };
  await useConclusionStore.getState().createConclusion(hit.phrase, verseRef);
  usePanelStore.getState().openPanel('observe', { observeInitialTab: 'flow' });
}
