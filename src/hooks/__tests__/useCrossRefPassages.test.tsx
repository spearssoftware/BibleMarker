/**
 * @vitest-environment jsdom
 *
 * The HARD network-cost rule: a non-`sword-*` translation must never fetch a
 * target chapter speculatively — only when the reader expands that one row.
 * The `sword-*` (local, free) path is the opposite: fetch eagerly, drop any
 * candidate that shares no word with the source, and settle on the top 3.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useCrossRefPassages, __resetCrossRefPassageCache } from '../useCrossRefPassages';
import { useActiveChapterStore } from '@/stores/activeChapterStore';
import { makeChapterCrossRef } from '@/lib/__test__/factories';
import type { Chapter } from '@/types';

const { fetchChapterMock } = vi.hoisted(() => ({ fetchChapterMock: vi.fn() }));
vi.mock('@/lib/bible-api', () => ({
  fetchChapter: fetchChapterMock,
}));

function makeChapter(book: string, chapter: number, verses: Record<number, string>): Chapter {
  return {
    book,
    chapter,
    verses: Object.entries(verses).map(([num, text]) => ({
      ref: { book, chapter, verse: Number(num) },
      text,
    })),
  };
}

function seedActiveChapter(translationId: string, book: string, chapter: number, verses: Record<number, string>) {
  useActiveChapterStore.setState({
    translationId,
    book,
    chapter,
    verses: Object.entries(verses).map(([num, text]) => ({
      ref: { book, chapter, verse: Number(num) },
      text,
    })),
  });
}

describe('useCrossRefPassages', () => {
  beforeEach(() => {
    fetchChapterMock.mockReset();
    __resetCrossRefPassageCache();
    useActiveChapterStore.setState({ translationId: null, book: null, chapter: null, verses: [] });
  });

  it('returns no rows when the active chapter store does not match book/chapter/translation', () => {
    seedActiveChapter('sword-NASB', 'John', 1, { 29: 'Behold, the Lamb of God' });
    const crossRefs = [makeChapterCrossRef({ verse: 29, targetRef: 'Isa.53.7' })];

    const { result } = renderHook(() => useCrossRefPassages(crossRefs, 'John', 2, 'sword-NASB'));

    expect(result.current.rows).toEqual([]);
  });

  describe('local (sword-*) path', () => {
    it('drops a candidate with no shared words and caps at 3 shown rows', async () => {
      seedActiveChapter('sword-NASB', 'John', 1, {
        1: 'In the beginning was the Word, and the Word was with God',
        14: 'And the Word became flesh, the only begotten of the Father',
        29: 'Behold, the Lamb of God who takes away the sin of the world',
        36: 'Behold, the Lamb of God',
      });
      const crossRefs = [
        makeChapterCrossRef({ verse: 1, targetRef: 'Gen.1.1', votes: 100 }),
        makeChapterCrossRef({ verse: 14, targetRef: 'Ps.2.7', votes: 90 }),
        makeChapterCrossRef({ verse: 29, targetRef: 'Isa.53.7', votes: 80 }),
        makeChapterCrossRef({ verse: 36, targetRef: 'Xyz.9.9', votes: 999 }), // no shared word — must be dropped
      ];
      fetchChapterMock.mockImplementation(async (_t: string, book: string, chapter: number) => {
        if (book === 'Gen') return makeChapter('Gen', 1, { 1: 'In the beginning God created the heavens and the earth' });
        if (book === 'Ps') return makeChapter('Ps', 2, { 7: 'You are my Son, today I have begotten you' });
        if (book === 'Isa') return makeChapter('Isa', 53, { 7: 'He was oppressed and afflicted like a lamb led to slaughter' });
        if (book === 'Xyz') return makeChapter('Xyz', 9, { 9: 'Completely unrelated text with nothing in common' });
        throw new Error(`unexpected chapter ${book}.${chapter}`);
      });

      const { result } = renderHook(() => useCrossRefPassages(crossRefs, 'John', 1, 'sword-NASB'));

      expect(result.current.rows).toEqual([]); // hidden while loading — no flicker

      await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0));

      expect(result.current.rows).toHaveLength(3);
      expect(result.current.rows.every(r => r.status === 'ready')).toBe(true);
      expect(result.current.rows.map(r => r.crossRef.verse)).toEqual([1, 14, 29]);
      expect(result.current.rows.find(r => r.crossRef.targetRef === 'Xyz.9.9')).toBeUndefined();
    });

    it('dedupes two cross-references that land in the same target chapter into one fetch', async () => {
      seedActiveChapter('sword-NASB', 'Rom', 3, {
        10: 'There is none righteous, no, not one',
        11: 'There is none who understands',
      });
      const crossRefs = [
        makeChapterCrossRef({ verse: 10, targetRef: 'Ps.14.1', votes: 100 }),
        makeChapterCrossRef({ verse: 11, targetRef: 'Ps.14.2', votes: 90 }),
      ];
      fetchChapterMock.mockResolvedValue(
        makeChapter('Ps', 14, {
          1: 'There is none who does good, no, not one',
          2: 'To see if there is one who understands',
        })
      );

      const { result } = renderHook(() => useCrossRefPassages(crossRefs, 'Rom', 3, 'sword-NASB'));
      await waitFor(() => expect(result.current.rows.length).toBeGreaterThan(0));

      expect(fetchChapterMock).toHaveBeenCalledTimes(1);
      expect(fetchChapterMock).toHaveBeenCalledWith('sword-NASB', 'Ps', 14);
    });
  });

  describe('network (non-sword) path', () => {
    it('never fetches until expand, then fetches exactly once and reaches ready', async () => {
      seedActiveChapter('esv', 'John', 1, { 29: 'Behold, the Lamb of God who takes away the sin of the world' });
      const crossRefs = [makeChapterCrossRef({ verse: 29, targetRef: 'Isa.53.7', votes: 100 })];

      const { result } = renderHook(() => useCrossRefPassages(crossRefs, 'John', 1, 'esv'));

      expect(result.current.rows).toHaveLength(1);
      expect(result.current.rows[0].status).toBe('idle');
      expect(result.current.rows[0].targetVerses).toEqual([]);
      expect(fetchChapterMock).not.toHaveBeenCalled();

      fetchChapterMock.mockResolvedValueOnce(
        makeChapter('Isa', 53, { 7: 'He was led like a lamb to the slaughter' })
      );

      act(() => {
        result.current.expand(result.current.rows[0].key);
      });
      expect(result.current.rows[0].status).toBe('loading');

      await waitFor(() => expect(result.current.rows[0].status).toBe('ready'));
      expect(fetchChapterMock).toHaveBeenCalledTimes(1);
      expect(result.current.rows[0].targetVerses).toEqual([{ verse: 7, text: 'He was led like a lamb to the slaughter' }]);
      expect(result.current.rows[0].shared).toContain('lamb');
    });

    it('sets status error when the expand fetch rejects', async () => {
      seedActiveChapter('esv', 'John', 1, { 29: 'Behold, the Lamb of God' });
      const crossRefs = [makeChapterCrossRef({ verse: 29, targetRef: 'Isa.53.7' })];
      fetchChapterMock.mockRejectedValueOnce(new Error('network down'));

      const { result } = renderHook(() => useCrossRefPassages(crossRefs, 'John', 1, 'esv'));
      act(() => {
        result.current.expand(result.current.rows[0].key);
      });

      await waitFor(() => expect(result.current.rows[0].status).toBe('error'));
    });

    it('retries a failed row when expand is called again', async () => {
      seedActiveChapter('esv', 'John', 1, { 29: 'Behold, the Lamb of God' });
      const crossRefs = [makeChapterCrossRef({ verse: 29, targetRef: 'Isa.53.7' })];
      fetchChapterMock.mockRejectedValueOnce(new Error('network down'));

      const { result } = renderHook(() => useCrossRefPassages(crossRefs, 'John', 1, 'esv'));
      act(() => {
        result.current.expand(result.current.rows[0].key);
      });
      await waitFor(() => expect(result.current.rows[0].status).toBe('error'));

      fetchChapterMock.mockResolvedValueOnce(makeChapter('Isa', 53, { 7: 'He was led like a lamb' }));
      act(() => {
        result.current.expand(result.current.rows[0].key);
      });
      await waitFor(() => expect(result.current.rows[0].status).toBe('ready'));
      expect(fetchChapterMock).toHaveBeenCalledTimes(2);
    });

    it('returns multiple target verses for a same-chapter range, and only the start verse for a cross-chapter range', async () => {
      seedActiveChapter('esv', 'John', 1, {
        1: 'source verse one',
        2: 'source verse two',
      });
      const crossRefs = [
        makeChapterCrossRef({ verse: 1, targetRef: 'Ps.45.6', targetEndRef: 'Ps.45.7', votes: 100 }),
        makeChapterCrossRef({ verse: 2, targetRef: 'Deut.28.2', targetEndRef: 'Deut.29.1', votes: 90 }),
      ];
      fetchChapterMock.mockImplementation(async (_t: string, book: string, chapter: number) => {
        if (book === 'Ps') return makeChapter('Ps', 45, { 6: 'verse six', 7: 'verse seven' });
        if (book === 'Deut') return makeChapter('Deut', 28, { 2: 'verse two only' });
        throw new Error(`unexpected ${book}.${chapter}`);
      });

      const { result } = renderHook(() => useCrossRefPassages(crossRefs, 'John', 1, 'esv'));

      const psRow = result.current.rows.find(r => r.crossRef.targetRef === 'Ps.45.6')!;
      const deutRow = result.current.rows.find(r => r.crossRef.targetRef === 'Deut.28.2')!;

      act(() => {
        result.current.expand(psRow.key);
        result.current.expand(deutRow.key);
      });

      await waitFor(() => {
        const updatedPs = result.current.rows.find(r => r.crossRef.targetRef === 'Ps.45.6')!;
        const updatedDeut = result.current.rows.find(r => r.crossRef.targetRef === 'Deut.28.2')!;
        expect(updatedPs.status).toBe('ready');
        expect(updatedDeut.status).toBe('ready');
      });

      const finalPs = result.current.rows.find(r => r.crossRef.targetRef === 'Ps.45.6')!;
      const finalDeut = result.current.rows.find(r => r.crossRef.targetRef === 'Deut.28.2')!;
      expect(finalPs.targetVerses.map(v => v.verse)).toEqual([6, 7]);
      expect(finalDeut.targetVerses.map(v => v.verse)).toEqual([2]);
    });
  });
});
