import { describe, it, expect } from 'vitest';
import { stripOsis, extractCrossRefs, extractWordsWithStrongs } from './sword';

describe('stripOsis', () => {
  it('returns empty string for empty input', () => {
    expect(stripOsis('')).toBe('');
  });

  it('returns plain text unchanged', () => {
    expect(stripOsis('In the beginning God created')).toBe('In the beginning God created');
  });

  it('removes title tags', () => {
    expect(stripOsis('<title type="main">The Creation</title>In the beginning')).toBe('In the beginning');
  });

  it('removes note tags', () => {
    expect(stripOsis('God<note type="study">Heb. Elohim</note> created')).toBe('God created');
  });

  it('removes self-closing div tags', () => {
    expect(stripOsis('<div type="paragraph"/>In the beginning')).toBe('In the beginning');
  });

  it('removes div blocks', () => {
    expect(stripOsis('<div type="colophon">End note</div>The text')).toBe('The text');
  });

  it('removes w tags but keeps content', () => {
    expect(stripOsis('<w lemma="strong:H7225">beginning</w>')).toBe('beginning');
  });

  it('handles nested/reconstituted tags via loop', () => {
    // After removing inner tags, the outer tag might get reconstituted
    const input = '<note>some <em>emphasized</em> note</note>Text here';
    expect(stripOsis(input)).toBe('Text here');
  });

  it('normalizes whitespace', () => {
    expect(stripOsis('In   the   beginning')).toBe('In the beginning');
  });

  it('handles complex OSIS with multiple tag types', () => {
    const osis = '<title type="main">Genesis 1</title><div type="paragraph"/><w lemma="strong:H7225">In the beginning</w> <w lemma="strong:H430">God</w><note type="crossReference"><reference osisRef="John.1.1">John 1:1</reference></note> created';
    const result = stripOsis(osis);
    expect(result).toBe('In the beginning God created');
  });

  it('strips cross-reference notes', () => {
    const osis = 'God<note type="crossReference"><reference osisRef="Gen.1.1">Gen 1:1</reference></note> said';
    expect(stripOsis(osis)).toBe('God said');
  });
});

describe('extractCrossRefs', () => {
  it('returns empty array for empty input', () => {
    expect(extractCrossRefs('')).toEqual([]);
  });

  it('returns empty array for text without notes', () => {
    expect(extractCrossRefs('In the beginning God created')).toEqual([]);
  });

  it('extracts single cross-reference', () => {
    const osis = '<note type="crossReference"><reference osisRef="John.1.1">John 1:1</reference></note>';
    const refs = extractCrossRefs(osis);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ osisRef: 'John.1.1', label: 'John 1:1' });
  });

  it('extracts multiple cross-references from one note', () => {
    const osis = '<note type="crossReference"><reference osisRef="John.1.1">John 1:1</reference><reference osisRef="Heb.11.3">Heb 11:3</reference></note>';
    const refs = extractCrossRefs(osis);
    expect(refs).toHaveLength(2);
    expect(refs[0].osisRef).toBe('John.1.1');
    expect(refs[1].osisRef).toBe('Heb.11.3');
  });

  it('extracts refs from multiple notes', () => {
    const osis = 'text<note type="crossReference"><reference osisRef="A.1.1">A</reference></note>more<note type="crossReference"><reference osisRef="B.2.2">B</reference></note>';
    const refs = extractCrossRefs(osis);
    expect(refs).toHaveLength(2);
  });

  it('ignores non-crossReference notes', () => {
    const osis = '<note type="study">Study note</note><note type="crossReference"><reference osisRef="Gen.1.1">Gen 1:1</reference></note>';
    const refs = extractCrossRefs(osis);
    expect(refs).toHaveLength(1);
  });
});

describe('extractWordsWithStrongs', () => {
  it('returns empty array for empty input', () => {
    expect(extractWordsWithStrongs('')).toEqual([]);
  });

  it('returns empty array for text without w tags', () => {
    expect(extractWordsWithStrongs('In the beginning')).toEqual([]);
  });

  it('extracts word with single Strong number', () => {
    const osis = '<w lemma="strong:H430">God</w>';
    const result = extractWordsWithStrongs(osis);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ word: 'God', strongs: ['H430'] });
  });

  it('extracts word with multiple Strong numbers', () => {
    const osis = '<w lemma="strong:H430 strong:H1254">God created</w>';
    const result = extractWordsWithStrongs(osis);
    expect(result).toHaveLength(1);
    expect(result[0].strongs).toEqual(['H430', 'H1254']);
  });

  it('extracts multiple words', () => {
    const osis = '<w lemma="strong:H7225">beginning</w> <w lemma="strong:H430">God</w>';
    const result = extractWordsWithStrongs(osis);
    expect(result).toHaveLength(2);
    expect(result[0].word).toBe('beginning');
    expect(result[1].word).toBe('God');
  });

  it('skips w tags without lemma content', () => {
    const osis = '<w lemma="strong:H430">God</w> <w lemma="strong:H1254"> </w>';
    const result = extractWordsWithStrongs(osis);
    expect(result).toHaveLength(1);
  });

  it('normalizes Strong numbers to uppercase', () => {
    const osis = '<w lemma="strong:g2316">God</w>';
    const result = extractWordsWithStrongs(osis);
    expect(result[0].strongs).toEqual(['G2316']);
  });

  it('handles Greek NT Strong numbers', () => {
    const osis = '<w lemma="strong:G2316">God</w>';
    const result = extractWordsWithStrongs(osis);
    expect(result[0].strongs).toEqual(['G2316']);
  });
});
