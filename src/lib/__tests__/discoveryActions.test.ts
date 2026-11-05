/**
 * @vitest-environment jsdom
 *
 * `markRepetitionAsKeyword` names the preset after the repetition's display
 * form and seeds its variants from `RepetitionResult.forms`, excluding the
 * display form itself (case-insensitively) so the ripple picks up sibling
 * forms (e.g. "word"/"words") without duplicating the word as a variant.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { markRepetitionAsKeyword, createBookScopedKeywordPreset } from '../discoveryActions';
import { presetMarksToken } from '@/stores/discoveryStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import type { RepetitionResult } from '@/lib/chapterAnalysis';

vi.mock('@/lib/database', () => ({
  saveMarkingPreset: vi.fn(async () => {}),
  getAllMarkingPresets: vi.fn(async () => []),
}));

function repetition(overrides: Partial<RepetitionResult>): RepetitionResult {
  return { token: 'word', display: 'Word', count: 6, firstVerse: 1, lastVerse: 18, occurrences: [], forms: ['word', 'words'], ...overrides };
}

describe('markRepetitionAsKeyword', () => {
  beforeEach(() => {
    useMarkingPresetStore.setState({ presets: [], isLoading: false });
  });

  it('names the preset after the display form, pins it to the chapter, and seeds variants from the other forms', async () => {
    const preset = await markRepetitionAsKeyword(repetition({}), 'John', 1, 'study-1');

    expect(preset.word).toBe('Word');
    expect(preset.variants.map(v => v.text)).toEqual(['words']);
    expect(preset.scopes).toEqual([{ book: 'John', chapter: 1 }]);
    expect(preset.studyId).toBe('study-1');
    expect(preset.category).toBe('custom');
    expect(preset.highlight?.style).toBe('highlight');
    expect(preset.symbol).toBeUndefined();
  });

  it('creates a preset that presetMarksToken recognizes for that chapter and translation', async () => {
    const preset = await markRepetitionAsKeyword(repetition({ token: 'god', display: "God's", forms: ["god's", 'god'] }), 'Gen', 1);
    expect(presetMarksToken(preset, 'god', 'Gen', 1, 'sword-NASB')).toBe(true);
    expect(presetMarksToken(preset, 'god', 'Gen', 2, 'sword-NASB')).toBe(false);
  });

  it('produces no variants when the only form is the word itself', async () => {
    const preset = await markRepetitionAsKeyword(repetition({ token: 'grace', display: 'Grace', forms: ['grace'] }), 'John', 1);
    expect(preset.variants).toEqual([]);
    expect(preset.studyId).toBeUndefined();
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
