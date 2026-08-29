/**
 * useLookAgain — derives the Look-Again checklist for the current chapter.
 *
 * Data source (see plan "Part 3 — Look-Again checklist" / verified fact B1):
 * `useAnnotationStore` is NOT chapter-current — nothing loads it on chapter
 * navigation, only `useAnnotations` mutations write it. So this hook queries
 * `getChapterAnnotations`/`getChapterTitle` from `@/lib/database` directly,
 * keyed on {book, chapter, translationId, activeStudyId}, and re-runs on the
 * `annotationsUpdated` window event (same pattern MTV uses for its own
 * chapter-scoped reloads).
 *
 * Marks that count toward the checklist (fix B2) are both real annotations
 * (filtered to the primary translation) AND virtual keyword matches — a
 * preset ("key word") mark produces no annotation row, so an inductive
 * reader marking e.g. "Egypt" as a key word would otherwise never check off
 * the person/place items. Virtual matches are computed the same way
 * `VerseText` does: `findKeywordMatches` over the active chapter's verses,
 * study-filtered presets, and keyword exclusions.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { getChapterAnnotations, getChapterTitle } from '@/lib/database';
import { useActiveChapterStore } from '@/stores/activeChapterStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useKeywordExclusionStore } from '@/stores/keywordExclusionStore';
import { useStudyStore } from '@/stores/studyStore';
import { useChapterEntities, useChapterEntityVerseIndex } from '@/hooks/useGnosis';
import { useDiscoveryStore, useMarkedPresetExists, type DiscoveryContext } from '@/stores/discoveryStore';
import { useDiscoveryConfig } from '@/lib/discovery-config';
import { filterPresetsByStudy } from '@/lib/studyFilter';
import { findKeywordMatches, normalizeForMatching } from '@/lib/keywordMatching';
import { track } from '@/lib/telemetry';
import { pluralize } from '@/lib/textUtils';
import { singularize } from '@/lib/chapterAnalysis';
import type { ConnectorHit } from '@/lib/chapterAnalysis';
import type { Annotation, ChapterTitle, MarkingPreset, TextAnnotation } from '@/types';

export interface LookAgainItem {
  id: 'repetition' | 'person' | 'place' | 'hinge' | 'title';
  label: string;
  done: boolean;
}

export interface LookAgainResult {
  items: LookAgainItem[];
  /**
   * True once the chapter's own DB data (annotations + title) has loaded AND
   * both Gnosis entity queries have settled (resolved, errored, or skipped —
   * a provider without the per-verse capability resolves quickly to null, so
   * its in-flight window is covered by `isLoading` too). Consumers should
   * render nothing (and never show the "all done" nudge) until this is true,
   * otherwise the pre-load placeholder items flash as a premature
   * "You've seen what's here".
   */
  ready: boolean;
}

/**
 * A mark's coverage of a chapter, in verse-granularity spans (S2 overlap
 * rules). `charStart`/`charEnd` are undefined when the span covers the
 * whole verse (an annotation with no offsets, or a symbol — symbols always
 * count by `ref.verse`, never by character range).
 */
interface MarkCoverage {
  verse: number;
  charStart?: number;
  charEnd?: number;
}

/**
 * S2: an annotation with no character offsets covers its whole verse; a
 * multi-verse annotation covers its start/end verses per their own offsets
 * (unbounded on the side facing into the selection) and every verse between
 * them fully, regardless of offsets.
 *
 * Coverage is clamped to the current {book, chapter}: an annotation whose
 * startRef lies in a different chapter contributes nothing here, and one
 * that starts here but runs into a later chapter is clamped to its start
 * verse's own span (we can't enumerate the chapter's remaining verse
 * numbers, so we deliberately under-count — an item staying undone is the
 * safe failure mode; verse numbers from another chapter must never leak
 * into this chapter's marked-verse set).
 */
function coverageForTextAnnotation(ann: TextAnnotation, book: string, chapter: number): MarkCoverage[] {
  if (ann.startRef.book !== book || ann.startRef.chapter !== chapter) return [];

  const startVerse = ann.startRef.verse;
  const endsInThisChapter = ann.endRef.book === book && ann.endRef.chapter === chapter;
  const endVerse = endsInThisChapter ? ann.endRef.verse : startVerse;

  if (startVerse === endVerse) {
    if (!endsInThisChapter) {
      // Cross-chapter span clamped to its start verse: covered from
      // startOffset (when present) to the end of that verse.
      return ann.startOffset !== undefined
        ? [{ verse: startVerse, charStart: ann.startOffset, charEnd: Number.POSITIVE_INFINITY }]
        : [{ verse: startVerse }];
    }
    if (ann.startOffset !== undefined && ann.endOffset !== undefined) {
      return [{ verse: startVerse, charStart: ann.startOffset, charEnd: ann.endOffset }];
    }
    return [{ verse: startVerse }];
  }

  const spans: MarkCoverage[] = [];
  spans.push(
    ann.startOffset !== undefined
      ? { verse: startVerse, charStart: ann.startOffset, charEnd: Number.POSITIVE_INFINITY }
      : { verse: startVerse }
  );
  for (let v = startVerse + 1; v < endVerse; v++) {
    spans.push({ verse: v });
  }
  spans.push(
    ann.endOffset !== undefined ? { verse: endVerse, charStart: 0, charEnd: ann.endOffset } : { verse: endVerse }
  );
  return spans;
}

function coverageForMark(ann: Annotation, book: string, chapter: number): MarkCoverage[] {
  if (ann.type === 'symbol') {
    // Whole verse, per S2 — but only when the symbol sits in this chapter.
    if (ann.ref.book !== book || ann.ref.chapter !== chapter) return [];
    return [{ verse: ann.ref.verse }];
  }
  return coverageForTextAnnotation(ann, book, chapter);
}

/** Hinge overlap (S2): char-range intersection when the mark has one, else verse-level. */
function coverageIntersectsHit(cov: MarkCoverage, hit: ConnectorHit): boolean {
  if (cov.verse !== hit.verse) return false;
  if (cov.charStart === undefined || cov.charEnd === undefined) return true;
  return hit.start < cov.charEnd && hit.end > cov.charStart;
}

/**
 * Durable repetition check: a (study-filtered) preset counts as "the
 * repetition word is marked" when its scope covers this book+chapter, it
 * applies to this translation, and its word — or any variant applicable
 * here — singularizes to the analysis token. `useMarkedPresetExists` only
 * survives within a chapter visit (`markedPresetId` is cleared by
 * `resetForChapter`), so without this a revisited chapter would show the
 * repetition item unchecked even though the reader already marked the word.
 */
function presetMarksToken(preset: MarkingPreset, token: string, book: string, chapter: number, translationId: string): boolean {
  if (preset.moduleScope && preset.moduleScope !== translationId) return false;
  if (preset.scopes && preset.scopes.length > 0) {
    const covers = preset.scopes.some(
      s => s.book === book && (s.chapter === undefined || s.chapter === chapter)
    );
    if (!covers) return false;
  }
  const matchesToken = (text: string | undefined): boolean =>
    text !== undefined && singularize(normalizeForMatching(text)) === token;
  if (matchesToken(preset.word)) return true;
  return preset.variants.some(v => {
    if (v.bookScope && v.bookScope !== book) return false;
    if (v.bookScope && v.chapterScope !== undefined && v.chapterScope !== chapter) return false;
    return matchesToken(v.text);
  });
}

export function useLookAgain(context: DiscoveryContext | null): LookAgainResult {
  const activeStudyId = useStudyStore(s => s.activeStudyId);
  const { presets } = useMarkingPresetStore();
  const { exclusions } = useKeywordExclusionStore();
  const activeChapterBook = useActiveChapterStore(s => s.book);
  const activeChapterChapter = useActiveChapterStore(s => s.chapter);
  const activeChapterTranslationId = useActiveChapterStore(s => s.translationId);
  const activeChapterVerses = useActiveChapterStore(s => s.verses);
  const markedPresetExists = useMarkedPresetExists();
  const thresholds = useDiscoveryConfig();
  const checklistCompletedTracked = useDiscoveryStore(s => s.checklistCompletedTracked);
  const setChecklistCompletedTracked = useDiscoveryStore(s => s.setChecklistCompletedTracked);

  const {
    index: entityVerseIndex,
    isLoading: indexLoading,
  } = useChapterEntityVerseIndex(context?.book, context?.chapter, !!context);
  const { entities, isLoading: entitiesLoading } = useChapterEntities(context?.book, context?.chapter, !!context);

  const [chapterAnnotations, setChapterAnnotations] = useState<Annotation[]>([]);
  const [chapterTitle, setChapterTitle] = useState<ChapterTitle | undefined>(undefined);
  // Whether the DB query below has resolved at least once for the current
  // context key. Gates the completion-telemetry effect (S4) so the pre-load
  // placeholder state (annotations/title both empty/undefined) never counts
  // as a real "undone" evaluation — otherwise every chapter visit would look
  // like an undone->done transition the instant the real data loads in,
  // even for a chapter that was already fully complete.
  const [loaded, setLoaded] = useState(false);

  // Reset synchronously during render (allowed setState, same pattern as
  // useChapterEntities's cache-key sync in useGnosis.ts) rather than in the
  // effect body below — avoids the cascading-render lint on setState-in-effect.
  // Includes the active study: switching studies changes which chapter title
  // and presets apply, so it must reset the loaded data and re-arm tracking
  // like any other identity change.
  const contextKey = context
    ? `${context.book}:${context.chapter}:${context.translationId}:${activeStudyId ?? ''}`
    : null;
  const [prevContextKey, setPrevContextKey] = useState(contextKey);
  if (contextKey !== prevContextKey) {
    setPrevContextKey(contextKey);
    setChapterAnnotations([]);
    setChapterTitle(undefined);
    setLoaded(false);
  }

  // B1: query the DB directly for this chapter's annotations + title, and
  // re-run whenever anything dispatches `annotationsUpdated` (creating a
  // title from ChapterAtAGlance, adding a mark from the reader, etc).
  useEffect(() => {
    if (!context) return;
    const { book, chapter, translationId } = context;
    let cancelled = false;
    // Monotonic request id: `annotationsUpdated` can fire while a previous
    // load is still in flight, and the DB queries can resolve out of order —
    // only the most recent request may commit its results.
    let requestId = 0;

    const load = async () => {
      const id = ++requestId;
      const [anns, title] = await Promise.all([
        getChapterAnnotations(translationId, book, chapter),
        getChapterTitle(null, book, chapter, activeStudyId),
      ]);
      if (cancelled || id !== requestId) return;
      setChapterAnnotations(anns);
      setChapterTitle(title);
      setLoaded(true);
    };

    void load();
    window.addEventListener('annotationsUpdated', load);
    return () => {
      cancelled = true;
      window.removeEventListener('annotationsUpdated', load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- context's own identity fully covered by its book/chapter/translationId
  }, [context?.book, context?.chapter, context?.translationId, activeStudyId]);

  const realMarks = useMemo(
    () => (context ? chapterAnnotations.filter(a => a.moduleId === context.translationId) : []),
    [chapterAnnotations, context]
  );

  const filteredPresets = useMemo(() => filterPresetsByStudy(presets, activeStudyId), [presets, activeStudyId]);

  // B2: virtual keyword-preset matches, computed exactly like VerseText does,
  // so a key-word mark checks these items off just like a plain highlight.
  const virtualMarks = useMemo<Annotation[]>(() => {
    if (!context) return [];
    if (
      activeChapterBook !== context.book ||
      activeChapterChapter !== context.chapter ||
      activeChapterTranslationId !== context.translationId
    ) {
      return [];
    }
    const result: Annotation[] = [];
    for (const verse of activeChapterVerses) {
      result.push(...findKeywordMatches(verse.text, verse.ref, filteredPresets, context.translationId, exclusions));
    }
    return result;
  }, [context, activeChapterBook, activeChapterChapter, activeChapterTranslationId, activeChapterVerses, filteredPresets, exclusions]);

  const coverage = useMemo(
    () =>
      context
        ? [...realMarks, ...virtualMarks].flatMap(a => coverageForMark(a, context.book, context.chapter))
        : [],
    [realMarks, virtualMarks, context]
  );
  const markedVerseSet = useMemo(() => new Set(coverage.map(c => c.verse)), [coverage]);

  // Person/place readiness rule: BOTH Gnosis sources must have resolved —
  // the per-verse index (drives `done`) and the entity list (drives the
  // label count). Requiring both is the simple consistent rule: it can never
  // render "0 people are named" from one source while the other is pending
  // or errored, and a provider without the per-verse capability (index stays
  // null) hides the items entirely — their done-state would be uncomputable.
  const entitySourcesResolved = entityVerseIndex !== null && entities !== null;
  const peopleVerses = entityVerseIndex?.peopleVerses ?? [];
  const placesVerses = entityVerseIndex?.placesVerses ?? [];
  const peopleCount = entities?.people.length ?? 0;
  const placesCount = entities?.places.length ?? 0;
  const personDone = peopleVerses.some(v => markedVerseSet.has(v));
  const placeDone = placesVerses.some(v => markedVerseSet.has(v));

  const hingeDone = useMemo(() => {
    const connectors = context?.analysis.connectors ?? [];
    return connectors.some(hit => coverage.some(cov => coverageIntersectsHit(cov, hit)));
  }, [context, coverage]);

  // Durable across revisits (unlike `markedPresetExists`, which only lives
  // for the current chapter visit): any applicable preset whose word/variant
  // singularizes to the repetition token keeps the item checked.
  const repetitionDone = useMemo(() => {
    if (markedPresetExists) return true;
    const token = context?.analysis.repetition?.token;
    if (!context || !token) return false;
    return filteredPresets.some(p =>
      presetMarksToken(p, token, context.book, context.chapter, context.translationId)
    );
  }, [markedPresetExists, context, filteredPresets]);

  const items = useMemo<LookAgainItem[]>(() => {
    if (!context) return [];
    const { analysis } = context;
    const result: LookAgainItem[] = [];

    if (analysis.repetition) {
      result.push({
        id: 'repetition',
        label: `One word repeats ${analysis.repetition.count}× — find and mark it`,
        done: repetitionDone,
      });
    }

    if (entitySourcesResolved && peopleVerses.length > 0 && peopleCount > 0) {
      result.push({
        id: 'person',
        label: `${pluralize(peopleCount, 'person', 'people')} ${peopleCount === 1 ? 'is' : 'are'} named — mark one where a person appears`,
        done: personDone,
      });
    }

    if (entitySourcesResolved && placesVerses.length > 0 && placesCount > 0) {
      result.push({
        id: 'place',
        label: `${pluralize(placesCount, 'place')} ${placesCount === 1 ? 'is' : 'are'} named — mark one where a place appears`,
        done: placeDone,
      });
    }

    // Same threshold gate as DiscoveryPanel's HingesCard, so this row can
    // never point at a card the panel decided not to render.
    if (analysis.connectors.length >= thresholds.connectorChipMinCount && analysis.connectors.length > 0) {
      result.push({
        id: 'hinge',
        label: `${pluralize(analysis.connectors.length, 'hinge')} ${analysis.connectors.length === 1 ? 'holds' : 'hold'} this chapter together — mark one`,
        done: hingeDone,
      });
    }

    result.push({
      id: 'title',
      label: 'Say this chapter in your own words — give it a title',
      done: !!chapterTitle,
    });

    return result;
  }, [context, repetitionDone, entitySourcesResolved, peopleVerses.length, peopleCount, personDone, placesVerses.length, placesCount, placeDone, thresholds.connectorChipMinCount, hingeDone, chapterTitle]);

  // See `LookAgainResult.ready`. By the time `loaded` flips true (an awaited
  // DB round-trip), the entity hooks' effects have already run, so their
  // `isLoading` flags cover the entire settle window — including the
  // capability-miss path, which toggles isLoading around its provider check.
  const ready = loaded && !entitiesLoading && !indexLoading;

  // S4: fire completion telemetry only on an in-session *transition* — this
  // chapter visit's checklist had ≥1 undone item at some point and now has
  // none — latched via `discoveryStore.checklistCompletedTracked` (cleared
  // by `resetForChapter`, which also re-arms this on a primary-translation
  // switch). `hadUndoneRef` tracks that "seen undone" state for the current
  // {book, chapter, translationId} only, reset whenever that key changes —
  // so revisiting an already-complete chapter (first evaluation is already
  // all-done) never fires, and completing the checklist while the panel
  // (and this hook) is unmounted is an accepted undercount: nothing here
  // runs to notice until the panel — and this hook — mounts again, at which
  // point the first evaluation is already complete and, again, doesn't
  // fire. See plan "Deliberate deltas" / Risks.
  const trackingKeyRef = useRef<string | null>(null);
  const hadUndoneRef = useRef(false);

  useEffect(() => {
    // Same identity as `contextKey` (including the active study — switching
    // studies re-arms tracking like any other identity change).
    if (trackingKeyRef.current !== contextKey) {
      trackingKeyRef.current = contextKey;
      hadUndoneRef.current = false;
    }
    // Wait for the full ready state — see `LookAgainResult.ready` for why the
    // pre-load placeholder state must never count as "seen undone".
    if (!context || items.length === 0 || !ready) return;

    const allDone = items.every(i => i.done);
    if (!allDone) {
      hadUndoneRef.current = true;
      return;
    }
    if (hadUndoneRef.current && !checklistCompletedTracked) {
      track('discovery_checklist_completed');
      setChecklistCompletedTracked(true);
    }
  }, [context, contextKey, items, ready, checklistCompletedTracked, setChecklistCompletedTracked]);

  return { items, ready };
}
