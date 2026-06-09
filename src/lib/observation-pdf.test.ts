import { describe, expect, it } from 'vitest';
import {
  buildObservationPdf,
  filterByBook,
  filterByStudy,
  filterConclusions,
  type BuildObservationPdfInput,
} from './observation-pdf';
import type { Conclusion, MarkingPreset, Study } from '@/types';

function preset(overrides: Partial<MarkingPreset>): MarkingPreset {
  return {
    id: 'p1', variants: [], autoSuggest: false, usageCount: 0,
    createdAt: new Date(0), updatedAt: new Date(0), ...overrides,
  };
}

const study: Study = { id: 's1', name: 'John — Abide', isActive: true, createdAt: new Date(0), updatedAt: new Date(0) };

describe('filterByStudy', () => {
  const items = [{ studyId: 's1' }, { studyId: 's2' }, {}];

  it('keeps global + matching when a study is active', () => {
    expect(filterByStudy(items, 's1')).toEqual([{ studyId: 's1' }, {}]);
  });

  it('keeps everything when no study is active', () => {
    expect(filterByStudy(items, null)).toEqual(items);
  });
});

describe('filterByBook', () => {
  const items = [
    { verseRef: { book: 'Ezek', chapter: 1, verse: 1 } },
    { verseRef: { book: 'Jer', chapter: 33, verse: 4 } },
  ];

  it('keeps only the study book when one is set', () => {
    expect(filterByBook(items, 'Ezek')).toEqual([items[0]]);
  });

  it('is a no-op when no book is set', () => {
    expect(filterByBook(items, undefined)).toEqual(items);
  });
});

describe('filterConclusions', () => {
  const mk = (id: string, presetId?: string): Conclusion =>
    ({ id, term: 't', verseRef: { book: 'John', chapter: 1, verse: id.length }, presetId,
       createdAt: new Date(0), updatedAt: new Date(0) });

  it('includes free-form (no preset) and study-preset-linked, excludes other-study', () => {
    const included = new Set(['pIn']);
    const out = filterConclusions([mk('a'), mk('b', 'pIn'), mk('c', 'pOut')], included);
    expect(out.map((c) => c.id)).toEqual(['a', 'b']);
  });
});

describe('buildObservationPdf', () => {
  it('builds a PDF for a populated study without throwing', async () => {
    const presets: MarkingPreset[] = [
      preset({ id: 'pAbide', word: 'abide', symbol: 'cross', category: 'themes', usageCount: 5, highlight: { style: 'highlight', color: 'green' }, studyId: 's1' }),
      preset({ id: 'pJeru', word: 'Jerusalem', symbol: 'mapPin', category: 'places', studyId: 's1' }),
    ];
    const input: BuildObservationPdfInput = {
      study, presets,
      lists: [{ id: 'l1', title: 'Abide', keyWordId: 'pAbide', studyId: 's1',
        items: [{ id: 'i1', content: 'remain in me', verseRef: { book: 'John', chapter: 15, verse: 4 }, createdAt: new Date(0), updatedAt: new Date(0) }],
        createdAt: new Date(0), updatedAt: new Date(0) }],
      places: [{ id: 'pl1', name: 'Jerusalem', verseRef: { book: 'John', chapter: 2, verse: 13 }, presetId: 'pJeru', studyId: 's1', createdAt: new Date(0), updatedAt: new Date(0) }],
      people: [{ id: 'pe1', name: 'Nicodemus', verseRef: { book: 'John', chapter: 3, verse: 1 }, studyId: 's1', createdAt: new Date(0), updatedAt: new Date(0) }],
      time: [{ id: 't1', expression: 'at night', verseRef: { book: 'John', chapter: 3, verse: 2 }, studyId: 's1', createdAt: new Date(0), updatedAt: new Date(0) }],
      conclusions: [{ id: 'c1', term: 'therefore', verseRef: { book: 'John', chapter: 3, verse: 16 }, createdAt: new Date(0), updatedAt: new Date(0) }],
      interpretations: [{ id: 'in1', verseRef: { book: 'John', chapter: 3, verse: 16 }, meaning: 'God so loved', studyId: 's1', createdAt: new Date(0), updatedAt: new Date(0) }],
      applications: [{ id: 'ap1', verseRef: { book: 'John', chapter: 3, verse: 16 }, teaching: 'love sacrificially', studyId: 's1', createdAt: new Date(0), updatedAt: new Date(0) }],
    };
    const bytes = await buildObservationPdf(input);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(bytes.length).toBeGreaterThan(1000);
    // Section text appears in the (uncompressed) jsPDF content stream.
    expect(text).toContain('Keywords');
    expect(text).toContain('Conclusions');
  });

  it('still renders entries whose preset was deleted (orphaned presetId folded into Other)', async () => {
    const input: BuildObservationPdfInput = {
      study, presets: [], // no presets at all → 'pGone' is orphaned
      lists: [], people: [], time: [], conclusions: [], interpretations: [], applications: [],
      places: [{ id: 'pl1', name: 'ORPHANPLACE', verseRef: { book: 'John', chapter: 2, verse: 13 }, presetId: 'pGone', studyId: 's1', createdAt: new Date(0), updatedAt: new Date(0) }],
    };
    const text = new TextDecoder('latin1').decode(await buildObservationPdf(input));
    expect(text).toContain('ORPHANPLACE');
  });

  it('drops cross-book entries when the study targets a single book', async () => {
    const bookStudy: Study = { ...study, name: 'Ezekiel', book: 'Ezek' };
    const input: BuildObservationPdfInput = {
      study: bookStudy, presets: [],
      lists: [], conclusions: [], interpretations: [], applications: [], time: [],
      places: [
        { id: 'pIn', name: 'INBOOKPLACE', verseRef: { book: 'Ezek', chapter: 1, verse: 1 }, studyId: 's1', createdAt: new Date(0), updatedAt: new Date(0) },
        // tagged to this study but a Jeremiah verse — must not leak in
        { id: 'pOut', name: 'OTHERBOOKPLACE', verseRef: { book: 'Jer', chapter: 33, verse: 4 }, studyId: 's1', createdAt: new Date(0), updatedAt: new Date(0) },
      ],
      people: [],
    };
    const text = new TextDecoder('latin1').decode(await buildObservationPdf(input));
    expect(text).toContain('INBOOKPLACE');
    expect(text).not.toContain('OTHERBOOKPLACE');
  });

  it('book-scopes the keyword legend: global keywords unused in the book are dropped, counts are book-scoped', async () => {
    const bookStudy: Study = { ...study, name: 'Ezekiel', book: 'Ezek' };
    const presets: MarkingPreset[] = [
      preset({ id: 'pGod', word: 'God', symbol: 'triangle', category: 'identity', usageCount: 32 }), // global, marked here
      preset({ id: 'pJesus', word: 'Jesus', symbol: 'cross', category: 'identity', usageCount: 80 }), // global, NOT marked here
      preset({ id: 'pWheels', word: 'wheels', symbol: 'circle', category: 'custom', usageCount: 0, studyId: 's1' }), // study keyword, unmarked
    ];
    const input: BuildObservationPdfInput = {
      study: bookStudy, presets,
      lists: [], places: [], people: [], time: [], conclusions: [], interpretations: [], applications: [],
      markCounts: { pGod: 6 }, // Jesus has zero Ezekiel marks
    };
    const text = new TextDecoder('latin1').decode(await buildObservationPdf(input));
    expect(text).toContain('God');
    expect(text).toContain('6 marked');   // book count, not the global 32
    expect(text).not.toContain('Jesus');  // global keyword unused in this book
    expect(text).not.toContain('80 marked');
    expect(text).toContain('wheels');     // study-specific keyword always listed
  });

  it('lists all study keywords with global counts when the study has no book', async () => {
    const presets: MarkingPreset[] = [
      preset({ id: 'pJesus', word: 'Jesus', symbol: 'cross', category: 'identity', usageCount: 80 }),
    ];
    const input: BuildObservationPdfInput = {
      study, presets, // study has no book
      lists: [], places: [], people: [], time: [], conclusions: [], interpretations: [], applications: [],
    };
    const text = new TextDecoder('latin1').decode(await buildObservationPdf(input));
    expect(text).toContain('Jesus');
    expect(text).toContain('80 marked');
  });

  it('omits empty sections (no data → title-only doc still builds)', async () => {
    const input: BuildObservationPdfInput = {
      study, presets: [],
      lists: [], places: [], people: [], time: [], conclusions: [], interpretations: [], applications: [],
    };
    const bytes = await buildObservationPdf(input);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(bytes.length).toBeGreaterThan(500);
    expect(text).not.toContain('Conclusions');
  });
});
