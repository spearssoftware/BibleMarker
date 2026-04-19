import { describe, expect, it } from 'vitest';
import type { Verse } from '@/types';
import { findAlignedMatch } from './translationAlignment';

function verse(text: string, words?: Array<{ word: string; strongs: string[] }>): Verse {
  return {
    ref: { book: 'John', chapter: 15, verse: 2 },
    text,
    words,
  };
}

describe('findAlignedMatch', () => {
  describe("Strong's path", () => {
    it('matches the first token whose Strong\'s intersects the source', () => {
      const target = verse(
        'Every branch in Me that does not bear fruit',
        [
          { word: 'Every', strongs: ['G3956'] },
          { word: 'branch', strongs: ['G2814'] },
          { word: 'in', strongs: ['G1722'] },
          { word: 'Me', strongs: ['G1473'] },
          { word: 'bear', strongs: ['G5342'] },
          { word: 'fruit', strongs: ['G2590'] },
        ],
      );
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'Me',
        sourceStrongsNumbers: ['G1473'],
      });
      expect(result.found).toBe(true);
      expect(result.method).toBe('strongs');
      expect(target.text.substring(result.startOffset!, result.endOffset!)).toBe('Me');
      expect(result.startWordIndex).toBe(3);
    });

    it('prefers the surface form that matches the source, even if it\'s not the first Strong\'s hit', () => {
      // Multiple tokens share the same Strong's. The user selected "love",
      // so we should mark "love" (exact surface match), not "loves" (earlier
      // in the verse but a different surface form).
      const target = verse(
        'He who loves his love is loved by God',
        [
          { word: 'loves', strongs: ['G25'] },
          { word: 'love', strongs: ['G25'] },
          { word: 'loved', strongs: ['G25'] },
        ],
      );
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'love',
        sourceStrongsNumbers: ['G25'],
      });
      expect(result.found).toBe(true);
      expect(result.method).toBe('strongs');
      expect(target.text.substring(result.startOffset!, result.endOffset!)).toBe('love');
      expect(result.startWordIndex).toBe(1);
    });

    it('skips verb tokens tagged with the pronoun\'s Strong\'s when a real pronoun token exists', () => {
      // Regression for John 15:10: "keep" is tagged with G3450 in some
      // modules' compound lemmas alongside G5083, but the user selected
      // the possessive "My" (G3450). Prefer the "my" token over "keep".
      const target = verse(
        'If you keep my commandments, you will abide in my love',
        [
          { word: 'If', strongs: [] },
          { word: 'you', strongs: [] },
          { word: 'keep', strongs: ['G5083', 'G3450'] },
          { word: 'my', strongs: ['G3450'] },
          { word: 'commandments', strongs: ['G1785'] },
          { word: 'abide', strongs: ['G3306'] },
          { word: 'my', strongs: ['G3450'] },
          { word: 'love', strongs: ['G26'] },
        ],
      );
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'My',
        sourceStrongsNumbers: ['G3450'],
      });
      expect(result.found).toBe(true);
      expect(result.method).toBe('strongs');
      expect(target.text.substring(result.startOffset!, result.endOffset!)).toBe('my');
      expect(result.startWordIndex).toBe(3);
    });

    it('falls back to a Strong\'s-only match when no target token shares a surface form', () => {
      // When every Strong's hit has a different surface form (e.g. "Myself"
      // or a Greek compound), pick the first hit and rely on the caller's
      // UX to show the match, rather than silently missing.
      const target = verse(
        'It is Myself who abides in Him',
        [
          { word: 'Myself', strongs: ['G3450'] },
          { word: 'abides', strongs: ['G3306'] },
          { word: 'Him', strongs: ['G846'] },
        ],
      );
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'my',
        sourceStrongsNumbers: ['G3450'],
      });
      expect(result.found).toBe(true);
      expect(result.method).toBe('strongs');
      // "Myself" contains "my" (score 2) — preferred over no match.
      expect(target.text.substring(result.startOffset!, result.endOffset!)).toBe('Myself');
    });

    it('rejects score-0 Strong\'s-only matches and falls through to text search', () => {
      // NASB95 sometimes tags the preposition before a pronoun with the
      // pronoun's Strong's as a compound lemma. If source "Me" (G1473) only
      // intersects "in" (also tagged G1473) and not the target "Me" token,
      // a score-0 Strong's hit on "in" would incorrectly win. Reject it and
      // let \bme\b fall through to find the real "Me".
      const target = verse(
        'Every branch in Me that does not bear fruit',
        [
          { word: 'Every', strongs: ['G3956'] },
          { word: 'branch', strongs: ['G2814'] },
          { word: 'in', strongs: ['G1722', 'G1473'] },
          { word: 'Me', strongs: [] },
        ],
      );
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'Me',
        sourceStrongsNumbers: ['G1473'],
      });
      expect(result.found).toBe(true);
      expect(result.method).toBe('text');
      expect(target.text.substring(result.startOffset!, result.endOffset!)).toBe('Me');
    });

    it('rejects compound target tokens (whitespace) for single-word source selections', () => {
      // Some SWORD modules tokenize multi-word phrases as a single <w> element
      // with one Strong's number (NASB95 John 15:2 tags "in Me that does not bear"
      // as a single token with G5342). A single-word source selection must not
      // accept a compound target — fall back to text search.
      const target = verse(
        'Every branch in Me that does not bear fruit',
        [
          { word: 'Every', strongs: ['G3956'] },
          { word: 'branch', strongs: ['G2814'] },
          { word: 'in Me that does not bear', strongs: ['G5342'] },
          { word: 'fruit', strongs: ['G2590'] },
        ],
      );
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'Me',
        sourceStrongsNumbers: ['G5342'],
      });
      expect(result.found).toBe(true);
      expect(result.method).toBe('text');
      expect(target.text.substring(result.startOffset!, result.endOffset!)).toBe('Me');
    });

    it('falls through to text path when target has no matching Strong\'s', () => {
      const target = verse(
        'Every branch of mine that does not bear fruit',
        [
          { word: 'Every', strongs: ['G3956'] },
          { word: 'branch', strongs: ['G2814'] },
          { word: 'mine', strongs: ['G1699'] },
        ],
      );
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'branch',
        sourceStrongsNumbers: ['G1473'],
      });
      expect(result.found).toBe(true);
      expect(result.method).toBe('text');
      expect(target.text.substring(result.startOffset!, result.endOffset!)).toBe('branch');
    });
  });

  describe('Text fallback', () => {
    it('finds the selected word when target has no Strong\'s data', () => {
      const target = verse('Every branch in me that beareth not fruit');
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'me',
      });
      expect(result.found).toBe(true);
      expect(result.method).toBe('text');
      expect(target.text.substring(result.startOffset!, result.endOffset!)).toBe('me');
    });

    it('is case-insensitive', () => {
      const target = verse('Every branch in ME');
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'me',
      });
      expect(result.found).toBe(true);
      expect(target.text.substring(result.startOffset!, result.endOffset!)).toBe('ME');
    });

    it('respects word boundaries — "me" does not match inside "some"', () => {
      const target = verse('Some branches bear no fruit');
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'me',
      });
      expect(result.found).toBe(false);
    });

    it('respects word boundaries — "I" does not match inside "if"', () => {
      const target = verse('if the branch abides in the vine');
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'I',
      });
      expect(result.found).toBe(false);
    });

    it('finds a word adjacent to punctuation', () => {
      const target = verse('Every branch, he takes away.');
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'he',
      });
      expect(result.found).toBe(true);
      expect(target.text.substring(result.startOffset!, result.endOffset!)).toBe('he');
    });

    it('returns the first occurrence when a word repeats', () => {
      const target = verse('branch that bears no fruit; every branch that bears fruit');
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'branch',
      });
      expect(result.found).toBe(true);
      expect(result.startOffset).toBe(0);
    });
  });

  describe('Misses', () => {
    it('returns not found when target text is empty', () => {
      const result = findAlignedMatch({
        targetVerse: verse(''),
        sourceSelectedText: 'God',
      });
      expect(result.found).toBe(false);
      expect(result.method).toBe('none');
    });

    it('returns not found when neither Strong\'s nor text matches', () => {
      const result = findAlignedMatch({
        targetVerse: verse('A wholly different paraphrase'),
        sourceSelectedText: 'covenant',
        sourceStrongsNumbers: ['H1285'],
      });
      expect(result.found).toBe(false);
    });

    it('returns not found when source selected text is empty', () => {
      const result = findAlignedMatch({
        targetVerse: verse('Every branch in me'),
        sourceSelectedText: '   ',
      });
      expect(result.found).toBe(false);
    });
  });

  describe('Strong\'s without target words still falls back', () => {
    it('uses text fallback when target has no .words array', () => {
      const target = verse('Every branch in me that does not bear fruit');
      const result = findAlignedMatch({
        targetVerse: target,
        sourceSelectedText: 'me',
        sourceStrongsNumbers: ['G1473'],
      });
      expect(result.found).toBe(true);
      expect(result.method).toBe('text');
    });
  });
});
