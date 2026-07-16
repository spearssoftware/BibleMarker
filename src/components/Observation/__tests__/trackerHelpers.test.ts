import { describe, it, expect } from 'vitest';
import {
  getVerseKey,
  groupByVerse,
  sortVerseGroups,
  groupByKeyword,
  sortKeywordGroups,
} from '@/components/Observation/trackerHelpers';
import type { VerseRef } from '@/types';

const ref = (book: string, chapter: number, verse: number): VerseRef => ({ book, chapter, verse });

interface Item {
  id: string;
  verseRef: VerseRef;
  presetId?: string;
  name: string;
}

const items: Item[] = [
  { id: '1', verseRef: ref('Gen', 1, 1), presetId: 'p1', name: 'Adam' },
  { id: '2', verseRef: ref('Gen', 1, 2), presetId: 'p1', name: 'Adam' },
  { id: '3', verseRef: ref('John', 3, 16), name: 'Nicodemus' },
];

describe('getVerseKey / groupByVerse', () => {
  it('keys a verse as book:chapter:verse', () => {
    expect(getVerseKey(ref('John', 3, 16))).toBe('John:3:16');
  });

  it('groups items under their verse key', () => {
    const map = groupByVerse(items);
    expect([...map.keys()].sort()).toEqual(['Gen:1:1', 'Gen:1:2', 'John:3:16']);
    expect(map.get('Gen:1:1')!.map(i => i.id)).toEqual(['1']);
  });
});

describe('sortVerseGroups', () => {
  it('orders verse groups canonically (book order, then chapter, then verse)', () => {
    const map = new Map<string, Item[]>([
      ['John:3:16', []],
      ['Gen:1:2', []],
      ['Gen:1:1', []],
    ]);
    expect(sortVerseGroups(map).map(([k]) => k)).toEqual(['Gen:1:1', 'Gen:1:2', 'John:3:16']);
  });
});

describe('groupByKeyword', () => {
  it('groups by keyOf and labels via labelOf', () => {
    const groups = groupByKeyword(
      items,
      i => i.presetId || `manual:${i.name.toLowerCase()}`,
      (key, grouped) => (key.startsWith('manual:') ? grouped[0].name : `preset:${key}`)
    );
    const byKey = Object.fromEntries(groups.map(g => [g.key, { label: g.label, n: g.items.length }]));
    expect(byKey['p1']).toEqual({ label: 'preset:p1', n: 2 });
    expect(byKey['manual:nicodemus']).toEqual({ label: 'Nicodemus', n: 1 });
  });
});

describe('sortKeywordGroups', () => {
  it('puts manual groups last, then sorts by label', () => {
    const groups = [
      { key: 'manual:x', label: 'Zeta', items: [{ verseRef: ref('Gen', 1, 1) }] },
      { key: 'p2', label: 'Beta', items: [{ verseRef: ref('Gen', 1, 5) }] },
      { key: 'p1', label: 'Alpha', items: [{ verseRef: ref('Gen', 1, 3) }] },
    ];
    const sorted = sortKeywordGroups(groups, key => key.startsWith('manual:'));
    expect(sorted.map(g => g.key)).toEqual(['p1', 'p2', 'manual:x']);
  });

  it('breaks label ties by earliest verse', () => {
    const groups = [
      { key: 'p2', label: 'Same', items: [{ verseRef: ref('John', 3, 16) }] },
      { key: 'p1', label: 'Same', items: [{ verseRef: ref('Gen', 1, 1) }] },
    ];
    const sorted = sortKeywordGroups(groups, () => false);
    expect(sorted.map(g => g.key)).toEqual(['p1', 'p2']);
  });
});
