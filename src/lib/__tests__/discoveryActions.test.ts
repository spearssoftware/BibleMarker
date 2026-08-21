/**
 * @vitest-environment jsdom
 *
 * `markRepetitionAsKeyword` seeds a highlight-only preset's variants from
 * `RepetitionResult.forms`, excluding whichever form matches the reader's own
 * selected text (case-insensitively) so the ripple picks up sibling forms
 * (e.g. "word"/"words") without duplicating the word itself as a variant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markRepetitionAsKeyword, createBookScopedKeywordPreset } from '../discoveryActions';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import type { TextSelection } from '@/stores/annotationStore';
import type { RepetitionResult } from '@/lib/chapterAnalysis';

vi.mock('@/lib/database', () => ({
  saveMarkingPreset: vi.fn(async () => {}),
  getAllMarkingPresets: vi.fn(async () => []),
}));

function selection(text: string): TextSelection {
  return { moduleId: 'sword-NASB', book: 'John', chapter: 1, startVerse: 9, endVerse: 9, text };
}

describe('markRepetitionAsKeyword', () => {
  beforeEach(() => {
    useMarkingPresetStore.setState({ presets: [], isLoading: false });
  });

  it('seeds variants from the other repetition.forms, excluding the selected word itself', async () => {
    const repetition: RepetitionResult = {
      token: 'word',
      count: 6,
      firstVerse: 1,
      lastVerse: 18,
      occurrences: [],
      forms: ['word', 'words', 'Word'],
    };

    const preset = await markRepetitionAsKeyword(selection('Word'), 'study-1', repetition);

    expect(preset.word).toBe('Word');
    expect(preset.variants.map(v => v.text)).toEqual(['words']);
    expect(preset.scopes).toEqual([{ book: 'John' }]);
    expect(preset.studyId).toBe('study-1');
    expect(preset.category).toBe('custom');
    expect(preset.highlight?.style).toBe('highlight');
    expect(preset.symbol).toBeUndefined();
  });

  it('trims the selected text before using it as the preset word', async () => {
    const repetition: RepetitionResult = {
      token: 'light',
      count: 5,
      firstVerse: 3,
      lastVerse: 7,
      occurrences: [],
      forms: ['light', 'lights'],
    };

    const preset = await markRepetitionAsKeyword(selection('  light  '), undefined, repetition);
    expect(preset.word).toBe('light');
  });

  it('produces no variants when there is no repetition result', async () => {
    const preset = await markRepetitionAsKeyword(selection('Grace'), 'study-1');
    expect(preset.variants).toEqual([]);
  });

  it('produces no variants when every form matches the selected word', async () => {
    const repetition: RepetitionResult = {
      token: 'grace',
      count: 5,
      firstVerse: 1,
      lastVerse: 5,
      occurrences: [],
      forms: ['grace', 'Grace'],
    };
    const preset = await markRepetitionAsKeyword(selection('grace'), undefined, repetition);
    expect(preset.variants).toEqual([]);
  });
});

describe('createBookScopedKeywordPreset', () => {
  beforeEach(() => {
    useMarkingPresetStore.setState({ presets: [], isLoading: false });
  });

  it('passes variants through to the created preset', async () => {
    const preset = await createBookScopedKeywordPreset({
      word: 'faith',
      variants: ['believe', 'trust'],
      book: 'Rom',
      highlight: { style: 'highlight', color: 'blue' },
    });
    expect(preset.variants.map(v => v.text)).toEqual(['believe', 'trust']);
    expect(preset.scopes).toEqual([{ book: 'Rom' }]);
  });
});
