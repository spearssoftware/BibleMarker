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
import { filterPresetsByStudy } from '@/lib/studyFilter';
import { findKeywordMatches } from '@/lib/keywordMatching';
import { track } from '@/lib/telemetry';
import { pluralize } from '@/lib/textUtils';
import type { ConnectorHit } from '@/lib/chapterAnalysis';
import type { Annotation, ChapterTitle, TextAnnotation } from '@/types';

export interface LookAgainItem {
  id: 'repetition' | 'person' | 'place' | 'hinge' | 'title';
  label: string;
  done: boolean;
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
 */
function coverageForTextAnnotation(ann: TextAnnotation): MarkCoverage[] {
  const startVerse = ann.startRef.verse;
  const endVerse = ann.endRef.verse;

  if (startVerse === endVerse) {
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

function coverageForMark(ann: Annotation): MarkCoverage[] {
  if (ann.type === 'symbol') return [{ verse: ann.ref.verse }]; // whole verse, per S2
  return coverageForTextAnnotation(ann);
}

/** Hinge overlap (S2): char-range intersection when the mark has one, else verse-level. */
function coverageIntersectsHit(cov: MarkCoverage, hit: ConnectorHit): boolean {
  if (cov.verse !== hit.verse) return false;
  if (cov.charStart === undefined || cov.charEnd === undefined) return true;
  return hit.start < cov.charEnd && hit.end > cov.charStart;
}

export function useLookAgain(context: DiscoveryContext | null): LookAgainItem[] {
  const activeStudyId = useStudyStore(s => s.activeStudyId);
  const { presets } = useMarkingPresetStore();
  const { exclusions } = useKeywordExclusionStore();
  const activeChapterBook = useActiveChapterStore(s => s.book);
  const activeChapterChapter = useActiveChapterStore(s => s.chapter);
  const activeChapterTranslationId = useActiveChapterStore(s => s.translationId);
  const activeChapterVerses = useActiveChapterStore(s => s.verses);
  const markedPresetExists = useMarkedPresetExists();
  const checklistCompletedTracked = useDiscoveryStore(s => s.checklistCompletedTracked);
  const setChecklistCompletedTracked = useDiscoveryStore(s => s.setChecklistCompletedTracked);

  const { index: entityVerseIndex } = useChapterEntityVerseIndex(context?.book, context?.chapter, !!context);
  const { entities } = useChapterEntities(context?.book, context?.chapter, !!context);

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
  const contextKey = context ? `${context.book}:${context.chapter}:${context.translationId}` : null;
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

    const load = async () => {
      const [anns, title] = await Promise.all([
        getChapterAnnotations(translationId, book, chapter),
        getChapterTitle(null, book, chapter, activeStudyId),
      ]);
      if (cancelled) return;
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
    () => [...realMarks, ...virtualMarks].flatMap(coverageForMark),
    [realMarks, virtualMarks]
  );
  const markedVerseSet = useMemo(() => new Set(coverage.map(c => c.verse)), [coverage]);

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

  const items = useMemo<LookAgainItem[]>(() => {
    if (!context) return [];
    const { analysis } = context;
    const result: LookAgainItem[] = [];

    if (analysis.repetition) {
      result.push({
        id: 'repetition',
        label: `One word repeats ${analysis.repetition.count}× — find and mark it`,
        done: markedPresetExists,
      });
    }

    if (peopleVerses.length > 0) {
      result.push({
        id: 'person',
        label: `${pluralize(peopleCount, 'person', 'people')} are named — mark one where a person appears`,
        done: personDone,
      });
    }

    if (placesVerses.length > 0) {
      result.push({
        id: 'place',
        label: `${pluralize(placesCount, 'place')} are named — mark one where a place appears`,
        done: placeDone,
      });
    }

    if (analysis.connectors.length > 0) {
      result.push({
        id: 'hinge',
        label: `${pluralize(analysis.connectors.length, 'hinge')} hold this chapter together — mark one`,
        done: hingeDone,
      });
    }

    result.push({
      id: 'title',
      label: 'Say this chapter in your own words — give it a title',
      done: !!chapterTitle,
    });

    return result;
  }, [context, markedPresetExists, peopleVerses.length, peopleCount, personDone, placesVerses.length, placesCount, placeDone, hingeDone, chapterTitle]);

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
    const key = context ? `${context.book}:${context.chapter}:${context.translationId}` : null;
    if (trackingKeyRef.current !== key) {
      trackingKeyRef.current = key;
      hadUndoneRef.current = false;
    }
    // Wait for the real chapter data (B1) — see `loaded`'s own comment for why
    // the pre-load placeholder state must never count as "seen undone".
    if (!context || items.length === 0 || !loaded) return;

    const allDone = items.every(i => i.done);
    if (!allDone) {
      hadUndoneRef.current = true;
      return;
    }
    if (hadUndoneRef.current && !checklistCompletedTracked) {
      track('discovery_checklist_completed');
      setChecklistCompletedTracked(true);
    }
  }, [context, items, loaded, checklistCompletedTracked, setChecklistCompletedTracked]);

  return items;
}
