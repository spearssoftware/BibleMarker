import { describe, it, expect } from 'vitest';
import { wordStem, findSharedWords } from '../sharedWords';

describe('wordStem', () => {
  it('returns the singularized stem for an ordinary word', () => {
    expect(wordStem('lambs')).toBe('lamb');
    expect(wordStem('lamb')).toBe('lamb');
  });

  it('returns null for a stopword', () => {
    expect(wordStem('the')).toBeNull();
    expect(wordStem('was')).toBeNull();
  });

  it('returns null when the singularized stem is itself a stopword', () => {
    expect(wordStem('this')).toBeNull();
  });

  it('does not treat deliberately-kept words (god, word, light) as stopwords', () => {
    expect(wordStem('word')).toBe('word');
    expect(wordStem('god')).toBe('god');
  });
});

describe('findSharedWords', () => {
  it('finds shared content words, ordered by first appearance in the source, excluding stopwords', () => {
    const source =
      'In the beginning was the Word, and the Word was with God, and the Word was God.';
    const target = 'In the beginning God created the heavens and the earth.';
    expect(findSharedWords(source, [target])).toEqual(['beginning', 'god']);
  });

  it('matches a plural in the source against a singular in the target', () => {
    const source = 'Behold, the Lamb of God, who takes away the sin of the world!';
    const target = 'Worthy is the Lamb who was slain to receive lambs and honor.';
    expect(findSharedWords(source, [target])).toContain('lamb');
  });

  it('returns an empty list when the only overlap is stopwords', () => {
    const source = 'The and but for the this that';
    const target = 'The or if the this that';
    expect(findSharedWords(source, [target])).toEqual([]);
  });

  it('unions stems across multiple target texts', () => {
    const source = 'The prophet spoke of a servant who would suffer.';
    const targets = ['A servant is coming.', 'He will suffer for many.'];
    expect(findSharedWords(source, targets)).toEqual(['servant', 'suffer']);
  });

  it('returns unique stems even when the source repeats a word', () => {
    const source = 'Light, light, and more light.';
    const target = 'Let there be light.';
    expect(findSharedWords(source, [target])).toEqual(['light']);
  });
});
