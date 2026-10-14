/**
 * useCommentaryPassage — the verses behind a commentary reference, shown
 * inline in the Commentary card.
 *
 * Fetches only while `osisRef` is non-null: a network translation (ESV) is
 * never touched until the reader taps a reference, and that tap is their
 * consent. Chapters come through the shared `getCachedChapter` cache. A
 * result belongs to the `osisRef` + translation that requested it; anything
 * else reads as loading, so a stale result never shows under a new request.
 */

import { useEffect, useMemo, useState } from 'react';
import { classifyPassageResult, resolveCommentaryPassage } from '@/lib/commentary';
import type { CommentaryPassage, PassageStatus } from '@/lib/commentary';
import { getCachedChapter } from '@/hooks/useCrossRefPassages';

export interface CommentaryPassageState {
  status: 'idle' | 'loading' | PassageStatus;
  verses: { verse: number; text: string }[];
  passage: CommentaryPassage | null;
}

interface Settled {
  key: string;
  status: PassageStatus;
  verses: { verse: number; text: string }[];
}

export function useCommentaryPassage(osisRef: string | null, translationId: string): CommentaryPassageState {
  const passage = useMemo(() => (osisRef ? resolveCommentaryPassage(osisRef) : null), [osisRef]);
  const key = osisRef ? `${translationId}|${osisRef}` : null;
  const [settled, setSettled] = useState<Settled | null>(null);

  useEffect(() => {
    if (!key || !passage) return;
    let cancelled = false;

    (async () => {
      let result: Parameters<typeof classifyPassageResult>[0];
      try {
        result = { chapter: await getCachedChapter(translationId, passage.book, passage.chapter) };
      } catch (error) {
        result = { error };
      }
      if (cancelled) return;
      const { status, verses } = classifyPassageResult(result, passage.startVerse, passage.endVerse);
      setSettled({ key, status, verses });
    })();

    return () => { cancelled = true; };
  }, [key, passage, translationId]);

  if (!key) return { status: 'idle', verses: [], passage: null };
  if (!passage) return { status: 'error', verses: [], passage: null };
  if (settled?.key !== key) return { status: 'loading', verses: [], passage };
  return { status: settled.status, verses: settled.verses, passage };
}
