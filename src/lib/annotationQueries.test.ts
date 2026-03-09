import { describe, it, expect } from 'vitest';
import { getAnnotationText, getAnnotationVerseRef } from '@/lib/annotationQueries';
import type { TextAnnotation, SymbolAnnotation } from '@/types';

const BASE = {
  id: 'ann-1',
  studyId: 'study-1',
  moduleId: 'sword-NASB',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const REF = { book: 'Gen', chapter: 1, verse: 1 };
const REF2 = { book: 'Jhn', chapter: 3, verse: 16 };

const textAnnotation: TextAnnotation = {
  ...BASE,
  type: 'highlight',
  startRef: REF,
  endRef: REF,
  selectedText: 'In the beginning',
  color: 'yellow',
};

const symbolAnnotation: SymbolAnnotation = {
  ...BASE,
  type: 'symbol',
  ref: REF2,
  position: 'after',
  symbol: 'clock',
};

describe('getAnnotationText', () => {
  it('returns selectedText for a text annotation', () => {
    expect(getAnnotationText(textAnnotation)).toBe('In the beginning');
  });

  it('returns empty string when selectedText is absent', () => {
    const ann: TextAnnotation = { ...textAnnotation, selectedText: undefined };
    expect(getAnnotationText(ann)).toBe('');
  });

  it('returns empty string for a symbol annotation (no selectedText)', () => {
    expect(getAnnotationText(symbolAnnotation)).toBe('');
  });
});

describe('getAnnotationVerseRef', () => {
  it('returns startRef for a text annotation', () => {
    expect(getAnnotationVerseRef(textAnnotation)).toBe(textAnnotation.startRef);
  });

  it('returns ref for a symbol annotation', () => {
    expect(getAnnotationVerseRef(symbolAnnotation)).toBe(symbolAnnotation.ref);
  });

  it('text annotation startRef has correct shape', () => {
    expect(getAnnotationVerseRef(textAnnotation)).toEqual(REF);
  });

  it('symbol annotation ref has correct shape', () => {
    expect(getAnnotationVerseRef(symbolAnnotation)).toEqual(REF2);
  });
});
