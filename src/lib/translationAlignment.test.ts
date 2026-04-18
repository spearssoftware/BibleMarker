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

    it('returns the first occurrence when the same Strong\'s appears twice (polysemy)', () => {
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
      expect(target.text.substring(result.startOffset!, result.endOffset!)).toBe('loves');
      expect(result.startWordIndex).toBe(0);
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
