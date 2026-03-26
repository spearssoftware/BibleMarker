import type {
  VerseRef, MarkingPreset, TextAnnotation, SymbolAnnotation,
  Study, ObservationList, ObservationItem, TimeExpression, Person, Place, Conclusion,
  InterpretationEntry, ApplicationEntry,
} from '@/types';
import type { SyncStatus } from '@/lib/sync';

export const ISO = '2025-01-01T00:00:00.000Z';

export function makeVerseRef(overrides?: Partial<VerseRef>): VerseRef {
  return { book: 'Gen', chapter: 1, verse: 1, ...overrides };
}

export function makeMarkingPreset(overrides?: Partial<MarkingPreset>): MarkingPreset {
  return {
    id: 'preset-1',
    word: 'God',
    highlight: { style: 'highlight', color: 'red' },
    variants: [],
    autoSuggest: false,
    usageCount: 0,
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
    ...overrides,
  };
}

export function makeHighlightAnnotation(overrides?: Partial<TextAnnotation>): TextAnnotation {
  return {
    id: 'ann-1',
    moduleId: 'eng-ESV',
    type: 'highlight',
    startRef: makeVerseRef(),
    endRef: makeVerseRef(),
    color: 'red',
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
    ...overrides,
  };
}

export function makeSymbolAnnotation(overrides?: Partial<SymbolAnnotation>): SymbolAnnotation {
  return {
    id: 'sym-1',
    moduleId: 'eng-ESV',
    type: 'symbol',
    ref: makeVerseRef(),
    position: 'before',
    symbol: 'triangle',
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
    ...overrides,
  };
}

export function makeSyncStatus(overrides?: Partial<SyncStatus>): SyncStatus {
  return {
    state: 'synced',
    last_sync: null,
    pending_changes: 0,
    error: null,
    sync_folder: null,
    connected_devices: [],
    ...overrides,
  };
}

export function makeStudy(overrides?: Partial<Study>): Study {
  return {
    id: 'study-1',
    name: 'Test Study',
    isActive: false,
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
    ...overrides,
  };
}

export function makeObservationItem(overrides?: Partial<ObservationItem>): ObservationItem {
  return {
    id: 'item-1',
    content: 'Test observation',
    verseRef: makeVerseRef(),
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
    ...overrides,
  };
}

export function makeObservationList(overrides?: Partial<ObservationList>): ObservationList {
  return {
    id: 'list-1',
    title: 'Test List',
    items: [],
    keyWordId: 'preset-1',
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
    ...overrides,
  };
}

export function makeTimeExpression(overrides?: Partial<TimeExpression>): TimeExpression {
  return {
    id: 'time-1',
    expression: 'In the beginning',
    verseRef: makeVerseRef(),
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
    ...overrides,
  };
}

export function makePerson(overrides?: Partial<Person>): Person {
  return {
    id: 'person-1',
    name: 'Moses',
    verseRef: makeVerseRef(),
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
    ...overrides,
  };
}

export function makePlace(overrides?: Partial<Place>): Place {
  return {
    id: 'place-1',
    name: 'Jerusalem',
    verseRef: makeVerseRef(),
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
    ...overrides,
  };
}

export function makeConclusion(overrides?: Partial<Conclusion>): Conclusion {
  return {
    id: 'conclusion-1',
    term: 'therefore',
    verseRef: makeVerseRef(),
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
    ...overrides,
  };
}

export function makeInterpretation(overrides?: Partial<InterpretationEntry>): InterpretationEntry {
  return {
    id: 'interp-1',
    verseRef: makeVerseRef(),
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
    ...overrides,
  };
}

export function makeApplication(overrides?: Partial<ApplicationEntry>): ApplicationEntry {
  return {
    id: 'app-1',
    verseRef: makeVerseRef(),
    createdAt: new Date(ISO),
    updatedAt: new Date(ISO),
    ...overrides,
  };
}

export function makeChapterCache(overrides?: Partial<{
  id: string;
  moduleId: string;
  book: string;
  chapter: number;
  verses: Record<number, string>;
  cachedAt: Date;
}>): {
  id: string;
  moduleId: string;
  book: string;
  chapter: number;
  verses: Record<number, string>;
  cachedAt: Date;
} {
  return {
    id: 'sword-NASB:Gen:1',
    moduleId: 'sword-NASB',
    book: 'Gen',
    chapter: 1,
    verses: { 1: 'In the beginning God created the heavens and the earth.' },
    cachedAt: new Date(ISO),
    ...overrides,
  };
}
