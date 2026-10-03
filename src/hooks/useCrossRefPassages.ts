/**
 * useCrossRefPassages — loads the source + target passages for the
 * Cross-References card's "read them together" flow.
 *
 * Source verse text always comes from `useActiveChapterStore` (already in
 * memory from the reader's own translation column) — never fetched. Target
 * verse text is a different story because of the HARD network-cost rule: a
 * `sword-*` translation is a free local file, but anything else is a paid or
 * rate-limited API, so a non-`sword-*` translation must never fetch a target
 * chapter until the reader explicitly expands that row.
 *
 * - Local (`sword-*`): fetch the top 6 candidates' target chapters up front
 *   (deduped through the module-level cache below), compute the words they
 *   share with the source verse, drop any candidate with no shared words,
 *   and keep the top 3 by votes. While that's in flight, `rows` is `[]` so
 *   the card stays hidden instead of flashing a wrong/partial list.
 * - Network (anything else): the top 3 candidates render immediately with
 *   `status: 'idle'` and no target text — nothing is fetched until the
 *   caller invokes `expand(key)` for that one row.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchChapter } from '@/lib/bible-api';
import { findSharedWords, formatCrossRefTarget } from '@/lib/chapterAnalysis';
import { useActiveChapterStore } from '@/stores/activeChapterStore';
import { formatVerseRef, parseOsisRef } from '@/types';
import type { Chapter, ChapterCrossRef } from '@/types';

const LOCAL_CANDIDATE_COUNT = 6;
const MAX_SHOWN_ROWS = 3;
const MAX_TARGET_VERSES = 3;
const MAX_CACHE_ENTRIES = 20;

export interface CrossRefPassageRow {
  key: string;
  crossRef: ChapterCrossRef;
  label: string;
  jumpTarget: { book: string; chapter: number; verse: number };
  sourceRefLabel: string;
  sourceText: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  targetVerses: { verse: number; text: string }[];
  shared: string[];
}

/** Metadata derivable synchronously from a `ChapterCrossRef`, before any fetch. */
interface CrossRefCandidate {
  key: string;
  crossRef: ChapterCrossRef;
  label: string;
  jumpTarget: { book: string; chapter: number; verse: number };
  sourceRefLabel: string;
  verseNumbers: number[];
}

interface RowRuntimeState {
  status: 'loading' | 'ready' | 'error';
  targetVerses: { verse: number; text: string }[];
  shared: string[];
}

/** Chapter fetch cache, shared across all cards/rows so two cross-references into the same chapter dedupe to one fetch. */
let chapterCache = new Map<string, Promise<Chapter>>();

function cacheKey(translationId: string, book: string, chapter: number): string {
  return `${translationId}:${book}.${chapter}`;
}

function getCachedChapter(translationId: string, book: string, chapter: number): Promise<Chapter> {
  const key = cacheKey(translationId, book, chapter);
  const existing = chapterCache.get(key);
  if (existing) return existing;

  const promise = fetchChapter(translationId, book, chapter);
  promise.catch(() => {
    // A failed fetch shouldn't poison the cache for a retry later — but only
    // evict our own entry, not a newer one stored under the same key.
    if (chapterCache.get(key) === promise) chapterCache.delete(key);
  });
  chapterCache.set(key, promise);
  if (chapterCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = chapterCache.keys().next().value;
    if (oldestKey !== undefined) chapterCache.delete(oldestKey);
  }
  return promise;
}

/** Test-only escape hatch — clears the module-level chapter cache between tests. */
export function __resetCrossRefPassageCache(): void {
  chapterCache = new Map();
}

const byVotesDesc = (a: { crossRef: ChapterCrossRef }, b: { crossRef: ChapterCrossRef }): number =>
  b.crossRef.votes - a.crossRef.votes;
const byVerse = (a: { crossRef: ChapterCrossRef }, b: { crossRef: ChapterCrossRef }): number =>
  a.crossRef.verse - b.crossRef.verse;

function buildCandidate(book: string, chapter: number, crossRef: ChapterCrossRef): CrossRefCandidate | null {
  const target = parseOsisRef(crossRef.targetRef);
  if (!target || target.verse === undefined) return null;

  const end = crossRef.targetEndRef ? parseOsisRef(crossRef.targetEndRef) : null;
  const sameChapterEndVerse =
    end && end.book === target.book && end.chapter === target.chapter && end.verse !== undefined
      ? end.verse
      : target.verse;
  const cappedEndVerse = Math.min(sameChapterEndVerse, target.verse + MAX_TARGET_VERSES - 1);

  const verseNumbers: number[] = [];
  for (let v = target.verse; v <= cappedEndVerse; v++) verseNumbers.push(v);

  return {
    key: `${book}.${chapter}:${crossRef.verse}:${crossRef.targetRef}`,
    crossRef,
    label: formatCrossRefTarget(crossRef.targetRef, crossRef.targetEndRef),
    jumpTarget: { book: target.book, chapter: target.chapter, verse: target.verse },
    sourceRefLabel: formatVerseRef(book, chapter, crossRef.verse),
    verseNumbers,
  };
}

async function loadTargetVerses(
  translationId: string,
  candidate: CrossRefCandidate
): Promise<{ verse: number; text: string }[]> {
  const chapterData = await getCachedChapter(translationId, candidate.jumpTarget.book, candidate.jumpTarget.chapter);
  const verseText = new Map(chapterData.verses.map(v => [v.ref.verse, v.text]));
  return candidate.verseNumbers
    .map(verse => ({ verse, text: verseText.get(verse) }))
    .filter((v): v is { verse: number; text: string } => v.text !== undefined);
}

function toRow(candidate: CrossRefCandidate, sourceText: string | null, state: RowRuntimeState | undefined): CrossRefPassageRow {
  return {
    key: candidate.key,
    crossRef: candidate.crossRef,
    label: candidate.label,
    jumpTarget: candidate.jumpTarget,
    sourceRefLabel: candidate.sourceRefLabel,
    sourceText,
    status: state?.status ?? 'idle',
    targetVerses: state?.targetVerses ?? [],
    shared: state?.shared ?? [],
  };
}

export function useCrossRefPassages(
  crossRefs: ChapterCrossRef[],
  book: string,
  chapter: number,
  translationId: string
): { rows: CrossRefPassageRow[]; expand: (key: string) => void } {
  const isLocal = translationId.startsWith('sword-');

  const activeTranslationId = useActiveChapterStore(s => s.translationId);
  const activeBook = useActiveChapterStore(s => s.book);
  const activeChapter = useActiveChapterStore(s => s.chapter);
  const activeVerses = useActiveChapterStore(s => s.verses);
  const matches = activeTranslationId === translationId && activeBook === book && activeChapter === chapter;

  const getSourceText = useCallback(
    (verse: number): string | null => (matches ? activeVerses.find(v => v.ref.verse === verse)?.text ?? null : null),
    [matches, activeVerses]
  );

  const candidates = useMemo<CrossRefCandidate[]>(
    () =>
      crossRefs
        .map(crossRef => buildCandidate(book, chapter, crossRef))
        .filter((c): c is CrossRefCandidate => c !== null),
    [crossRefs, book, chapter]
  );

  const contextKey = `${translationId}:${book}.${chapter}`;
  const [prevContextKey, setPrevContextKey] = useState(contextKey);
  const [localRows, setLocalRows] = useState<CrossRefPassageRow[] | null>(null);
  const [rowStates, setRowStates] = useState<Record<string, RowRuntimeState>>({});
  if (contextKey !== prevContextKey) {
    setPrevContextKey(contextKey);
    setLocalRows(null);
    setRowStates({});
  }

  const contextKeyRef = useRef(contextKey);
  const rowStatesRef = useRef(rowStates);
  useEffect(() => {
    contextKeyRef.current = contextKey;
    rowStatesRef.current = rowStates;
  }, [contextKey, rowStates]);

  // Local path: fetch the top candidates' target chapters up front, filter to
  // rows that actually share a word with the source, and settle on the top 3.
  useEffect(() => {
    if (!isLocal || !matches) return;
    const topCandidates = [...candidates].sort(byVotesDesc).slice(0, LOCAL_CANDIDATE_COUNT);
    if (topCandidates.length === 0) return; // nothing to fetch — the `rows` memo below already returns [] for this case

    let cancelled = false;

    (async () => {
      const results = await Promise.all(
        topCandidates.map(async candidate => {
          const sourceText = getSourceText(candidate.crossRef.verse);
          if (!sourceText) return null;
          try {
            const targetVerses = await loadTargetVerses(translationId, candidate);
            if (targetVerses.length === 0) return null;
            const shared = findSharedWords(sourceText, targetVerses.map(v => v.text));
            if (shared.length === 0) return null;
            return { candidate, sourceText, targetVerses, shared };
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;

      const kept = results
        .filter((r): r is NonNullable<typeof r> => r !== null)
        .sort((a, b) => byVotesDesc(a.candidate, b.candidate))
        .slice(0, MAX_SHOWN_ROWS)
        .sort((a, b) => byVerse(a.candidate, b.candidate));

      setLocalRows(
        kept.map(({ candidate, sourceText, targetVerses, shared }) =>
          toRow(candidate, sourceText, { status: 'ready', targetVerses, shared })
        )
      );
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getSourceText already depends on matches/activeVerses
  }, [isLocal, matches, candidates, translationId]);

  const expand = useCallback(
    (key: string) => {
      if (isLocal) return;
      const status = rowStatesRef.current[key]?.status;
      if (status === 'loading' || status === 'ready') return;
      const candidate = candidates.find(c => c.key === key);
      if (!candidate) return;

      const callContextKey = contextKeyRef.current;
      const loading: RowRuntimeState = { status: 'loading', targetVerses: [], shared: [] };
      rowStatesRef.current = { ...rowStatesRef.current, [key]: loading };
      setRowStates(prev => ({ ...prev, [key]: loading }));

      (async () => {
        try {
          const targetVerses = await loadTargetVerses(translationId, candidate);
          if (contextKeyRef.current !== callContextKey) return;
          const sourceText = getSourceText(candidate.crossRef.verse);
          const shared = sourceText ? findSharedWords(sourceText, targetVerses.map(v => v.text)) : [];
          setRowStates(prev => ({ ...prev, [key]: { status: 'ready', targetVerses, shared } }));
        } catch {
          if (contextKeyRef.current !== callContextKey) return;
          setRowStates(prev => ({ ...prev, [key]: { status: 'error', targetVerses: [], shared: [] } }));
        }
      })();
    },
    [isLocal, candidates, translationId, getSourceText]
  );

  const rows = useMemo<CrossRefPassageRow[]>(() => {
    if (!matches) return [];
    if (isLocal) return candidates.length === 0 ? [] : localRows ?? [];

    return [...candidates]
      .sort(byVotesDesc)
      .slice(0, MAX_SHOWN_ROWS)
      .sort(byVerse)
      .map(candidate => toRow(candidate, getSourceText(candidate.crossRef.verse), rowStates[candidate.key]));
  }, [matches, isLocal, localRows, candidates, rowStates, getSourceText]);

  return { rows, expand };
}
