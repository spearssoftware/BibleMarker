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
import { useChapterEntityVerseIndex } from '@/hooks/useGnosis';
import { useMarkedPresetExists, type DiscoveryContext } from '@/stores/discoveryStore';
import { useDiscoveryConfig } from '@/lib/discovery-config';
import { filterPresetsByStudy } from '@/lib/studyFilter';
import { findKeywordMatches, normalizeForMatching, presetAppliesToChapter, variantAppliesToChapter } from '@/lib/keywordMatching';
import { track } from '@/lib/telemetry';
import { pluralize, agree } from '@/lib/textUtils';
import { singularize, shouldShowHinges } from '@/lib/chapterAnalysis';
import type { ConnectorHit } from '@/lib/chapterAnalysis';
import type { Annotation, ChapterEntities, ChapterTitle, MarkingPreset, TextAnnotation } from '@/types';

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
 * A span open-ended from `startOffset` to the end of the verse (unbounded on
 * the side facing into the rest of the selection), or the whole verse when
 * there's no offset. Shared by both branches of `coverageForTextAnnotation`
 * below that clamp a start verse this way.
 */
function openStartSpan(verse: number, startOffset: number | undefined): MarkCoverage {
  return startOffset !== undefined ? { verse, charStart: startOffset, charEnd: Number.POSITIVE_INFINITY } : { verse };
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
      return [openStartSpan(startVerse, ann.startOffset)];
    }
    if (ann.startOffset !== undefined && ann.endOffset !== undefined) {
      return [{ verse: startVerse, charStart: ann.startOffset, charEnd: ann.endOffset }];
    }
    return [{ verse: startVerse }];
  }

  const spans: MarkCoverage[] = [];
  spans.push(openStartSpan(startVerse, ann.startOffset));
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
  if (!presetAppliesToChapter(preset, book, chapter)) return false;
  const matchesToken = (text: string | undefined): boolean =>
    text !== undefined && singularize(normalizeForMatching(text)) === token;
  if (matchesToken(preset.word)) return true;
  return preset.variants.some(v => variantAppliesToChapter(v, book, chapter) && matchesToken(v.text));
}

export function useLookAgain(
  context: DiscoveryContext | null,
  entities: ChapterEntities | null,
  entitiesLoading: boolean,
  discoveryEnabled: boolean
): LookAgainResult {
  const activeStudyId = useStudyStore(s => s.activeStudyId);
  const presets = useMarkingPresetStore(s => s.presets);
  const exclusions = useKeywordExclusionStore(s => s.exclusions);
  const activeChapterBook = useActiveChapterStore(s => s.book);
  const activeChapterChapter = useActiveChapterStore(s => s.chapter);
  const activeChapterTranslationId = useActiveChapterStore(s => s.translationId);
  const activeChapterVerses = useActiveChapterStore(s => s.verses);
  const markedPresetExists = useMarkedPresetExists();
  const thresholds = useDiscoveryConfig();

  // Kill-switch (S3): when Discover is off, skip the per-verse entity query
  // entirely (`enabled=false`) rather than let it run in the background for a
  // panel that isn't rendering anything.
  const {
    index: entityVerseIndex,
    isLoading: indexLoading,
  } = useChapterEntityVerseIndex(context?.book, context?.chapter, discoveryEnabled && !!context);

  const [chapterAnnotations, setChapterAnnotations] = useState<Annotation[]>([]);
  const [chapterTitle, setChapterTitle] = useState<ChapterTitle | undefined>(undefined);
  // Whether the DB query below has resolved at least once for the current
  // context key. Gates the completion-telemetry effect (S4) so the pre-load
  // placeholder state (annotations/title both empty/undefined) never counts
  // as a real "undone" evaluation — otherwise every chapter visit would look
  // like an undone->done transition the instant the real data loads in,
  // even for a chapter that was already fully complete.
  const [loaded, setLoaded] = useState(false);

  // S4: whether this chapter visit's checklist had ≥1 undone item at some
  // point since the current {book, chapter, translationId, activeStudyId}
  // identity was last established — see the completion-telemetry effect
  // below. A ref (not state) so setting it doesn't itself trigger a render.
  // Task note: the natural place to reset this would be inline in the
  // render-time `contextKey` sync just below (alongside the other resets),
  // but `react-hooks/refs` (eslint-plugin-react-hooks 7.x, enabled in this
  // repo) forbids mutating `ref.current` during render, and switching this to
  // state instead trips `react-hooks/set-state-in-effect` where it's set to
  // `true` below (a direct, unconditional setState in an effect body).
  // Resetting it here, in the B1 effect just below — which already re-runs
  // on exactly this same identity (book/chapter/translationId/activeStudyId)
  // — satisfies both rules and still drops the separate tracking-key ref +
  // effect this used to need just to know when to reset.
  const hadUndoneRef = useRef(false);

  // Latches once `discovery_checklist_completed` has fired for this hook's
  // own {book, chapter, translationId, activeStudyId} identity, so a revisit
  // of an already-complete chapter (or a re-render after completion) never
  // fires it twice. Local to the hook (not `discoveryStore`) so it can share
  // exactly `hadUndoneRef`'s identity and reset timing instead of the
  // store's separate `resetForChapter` lifecycle, which didn't know about
  // study switches. Same ref-not-state reasoning as `hadUndoneRef` above.
  const checklistCompletedRef = useRef(false);

  const contextKey = context
    ? `${context.book}:${context.chapter}:${context.translationId}:${activeStudyId ?? ''}`
    : null;

  // Reset synchronously during render (allowed setState, same pattern as
  // useChapterEntities's cache-key sync in useGnosis.ts) rather than in the
  // effect body below — avoids the cascading-render lint on setState-in-effect.
  // Includes the active study: switching studies changes which chapter title
  // and presets apply, so it must reset the loaded data like any other
  // identity change.
  const [prevContextKey, setPrevContextKey] = useState(contextKey);
  if (contextKey !== prevContextKey) {
    setPrevContextKey(contextKey);
    setChapterAnnotations([]);
    setChapterTitle(undefined);
    setLoaded(false);
  }

  // B1: query the DB directly for this chapter's annotations + title, and
  // re-run whenever anything dispatches `annotationsUpdated` (creating a
  // title from ChapterAtAGlance, adding a mark from the reader, etc). Skipped
  // entirely while the Discover kill switch is off — see `discoveryEnabled`
  // in the final `ready`/return gate below.
  useEffect(() => {
    if (!context || !discoveryEnabled) return;
    const { book, chapter, translationId } = context;
    let cancelled = false;
    // Same identity as `contextKey` — re-arm "seen undone"/"seen complete"
    // tracking whenever this effect re-runs for a new chapter/translation/study.
    hadUndoneRef.current = false;
    checklistCompletedRef.current = false;
    // Monotonic request id: `annotationsUpdated` can fire while a previous
    // load is still in flight, and the DB queries can resolve out of order —
    // only the most recent request may commit its results.
    let requestId = 0;

    const load = async () => {
      const id = ++requestId;
      try {
        const [anns, title] = await Promise.all([
          getChapterAnnotations(translationId, book, chapter),
          getChapterTitle(null, book, chapter, activeStudyId),
        ]);
        if (cancelled || id !== requestId) return;
        setChapterAnnotations(anns);
        setChapterTitle(title);
        setLoaded(true);
      } catch (e) {
        console.error('[useLookAgain] Failed to load chapter annotations/title:', e);
        if (cancelled || id !== requestId) return;
        // Conservative fallback: render the checklist with everything undone
        // rather than leaving it stuck pre-load — `loaded` still flips true so
        // `ready` can become true even though the DB query itself failed.
        setChapterAnnotations([]);
        setChapterTitle(undefined);
        setLoaded(true);
      }
    };

    // Coalesce back-to-back `annotationsUpdated` dispatches (several marks
    // added in one interaction, e.g.) into a single query pass: the first
    // dispatch in a macrotask schedules `load`, later ones in that same
    // macrotask find `pending` already set and no-op.
    let pending = false;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const scheduleLoad = () => {
      if (pending) return;
      pending = true;
      timerId = setTimeout(() => {
        pending = false;
        void load();
      }, 0);
    };

    void load();
    window.addEventListener('annotationsUpdated', scheduleLoad);
    return () => {
      cancelled = true;
      window.removeEventListener('annotationsUpdated', scheduleLoad);
      if (timerId !== undefined) clearTimeout(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- context's own identity fully covered by its book/chapter/translationId
  }, [context?.book, context?.chapter, context?.translationId, activeStudyId, discoveryEnabled]);

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
  // Narrower than `ready` below: this only gates the person/place items
  // themselves, not the whole checklist's render/telemetry gate.
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
        label: `${pluralize(peopleCount, 'person', 'people')} ${agree(peopleCount, 'is', 'are')} named — mark one where a person appears`,
        done: personDone,
      });
    }

    if (entitySourcesResolved && placesVerses.length > 0 && placesCount > 0) {
      result.push({
        id: 'place',
        label: `${pluralize(placesCount, 'place')} ${agree(placesCount, 'is', 'are')} named — mark one where a place appears`,
        done: placeDone,
      });
    }

    // Same threshold gate as DiscoveryPanel's HingesCard, so this row can
    // never point at a card the panel decided not to render.
    if (shouldShowHinges(analysis.connectors.length, thresholds)) {
      result.push({
        id: 'hinge',
        label: `${pluralize(analysis.connectors.length, 'hinge')} ${agree(analysis.connectors.length, 'holds', 'hold')} this chapter together — mark one`,
        done: hingeDone,
      });
    }

    result.push({
      id: 'title',
      label: 'Say this chapter in your own words — give it a title',
      done: !!chapterTitle,
    });

    return result;
  }, [context, repetitionDone, entitySourcesResolved, peopleVerses.length, peopleCount, personDone, placesVerses.length, placesCount, placeDone, thresholds, hingeDone, chapterTitle]);

  // See `LookAgainResult.ready`. By the time `loaded` flips true (an awaited
  // DB round-trip), the entity hooks' effects have already run, so their
  // `isLoading` flags cover the entire settle window — including the
  // capability-miss path, which toggles isLoading around its provider check.
  // `items.length > 0` is included so `ready` alone is a safe single gate for
  // both the telemetry effect below and `LookAgainCard`'s render check — see
  // `entitySourcesResolved` above for the narrower per-item gate this isn't.
  const ready = loaded && !entitiesLoading && !indexLoading && items.length > 0;

  // S4: fire completion telemetry only on an in-session *transition* — this
  // chapter visit's checklist had ≥1 undone item at some point and now has
  // none — latched via `checklistCompletedRef`, local to this hook (see its
  // declaration above for why it moved out of `discoveryStore`). `hadUndoneRef`
  // tracks that "seen undone" state for the current {book, chapter,
  // translationId, activeStudyId} only, reset (in the B1 effect above)
  // whenever that identity changes — so revisiting an already-complete
  // chapter (first evaluation is already all-done) never fires, and
  // completing the checklist while the panel (and this hook) is unmounted is
  // an accepted undercount: nothing here runs to notice until the panel —
  // and this hook — mounts again, at which point the first evaluation is
  // already complete and, again, doesn't fire. See plan "Deliberate deltas" /
  // Risks.
  useEffect(() => {
    // Wait for `ready` — see `LookAgainResult.ready` for why the pre-load
    // placeholder state must never count as "seen undone". `ready` already
    // implies `items.length > 0`, so no separate empty-items guard is needed.
    if (!context || !ready) return;

    const allDone = items.every(i => i.done);
    if (!allDone) {
      hadUndoneRef.current = true;
      return;
    }
    if (hadUndoneRef.current && !checklistCompletedRef.current) {
      track('discovery_checklist_completed');
      checklistCompletedRef.current = true;
    }
  }, [context, items, ready]);

  // Kill-switch (S3): a disabled Discover layer never shows the checklist,
  // regardless of whatever the hooks above computed from stale state.
  if (!discoveryEnabled) return { items: [], ready: false };

  return { items, ready };
}
