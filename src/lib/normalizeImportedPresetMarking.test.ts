import { describe, expect, it } from 'vitest';
import { normalizeImportedPresetMarking } from './database';
import type { MarkingPreset } from '@/types';

function makePreset(overrides: Partial<MarkingPreset>): MarkingPreset {
  return {
    id: 'p1',
    variants: [],
    autoSuggest: false,
    usageCount: 0,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  };
}

describe('normalizeImportedPresetMarking', () => {
  it('flips a symbol preset with highlight style to none (legacy v10 rule)', () => {
    const preset = makePreset({ symbol: 'idol', highlight: { style: 'highlight', color: 'yellow' } });
    const out = normalizeImportedPresetMarking(preset);
    expect(out.highlight?.style).toBe('none');
    expect(out.highlight?.color).toBe('yellow'); // color preserved
  });

  it('leaves a color-only highlight preset (no symbol) untouched', () => {
    const preset = makePreset({ highlight: { style: 'highlight', color: 'green' } });
    expect(normalizeImportedPresetMarking(preset).highlight?.style).toBe('highlight');
  });

  it('leaves a symbol preset with underline marking untouched', () => {
    const preset = makePreset({ symbol: 'idol', highlight: { style: 'underline', color: 'blue' } });
    expect(normalizeImportedPresetMarking(preset).highlight?.style).toBe('underline');
  });

  it('leaves a symbol preset already set to none untouched', () => {
    const preset = makePreset({ symbol: 'idol', highlight: { style: 'none', color: 'blue' } });
    expect(normalizeImportedPresetMarking(preset).highlight?.style).toBe('none');
  });

  it('leaves a symbol-only preset (no highlight) untouched', () => {
    const preset = makePreset({ symbol: 'idol' });
    expect(normalizeImportedPresetMarking(preset).highlight).toBeUndefined();
  });

  it('does not mutate the input preset', () => {
    const preset = makePreset({ symbol: 'idol', highlight: { style: 'highlight', color: 'yellow' } });
    normalizeImportedPresetMarking(preset);
    expect(preset.highlight?.style).toBe('highlight');
  });
});
