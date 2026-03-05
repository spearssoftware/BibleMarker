import type { VerseRef, MarkingPreset, TextAnnotation, SymbolAnnotation } from '@/types';
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
