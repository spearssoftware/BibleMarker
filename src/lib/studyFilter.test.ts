import { describe, it, expect } from 'vitest';
import {
  filterPresetsByStudy,
  filterAnnotationsByStudy,
} from './studyFilter';
import type { MarkingPreset } from '@/types/keyWord';
import type { Annotation, TextAnnotation } from '@/types/annotation';

function createPreset(overrides: Partial<MarkingPreset> & { id: string }): MarkingPreset {
  const { id, ...rest } = overrides;
  return {
    id,
    variants: [],
    autoSuggest: true,
    usageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    symbol: 'cross',
    ...rest,
  };
}

function createAnnotation(overrides: Partial<TextAnnotation> & { id: string }): TextAnnotation {
  const { id, ...rest } = overrides;
  return {
    id,
    type: 'highlight',
    moduleId: 'test',
    startRef: { book: 'Gen', chapter: 1, verse: 1 },
    endRef: { book: 'Gen', chapter: 1, verse: 1 },
    color: 'yellow',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...rest,
  };
}

describe('filterPresetsByStudy', () => {
  it('returns global presets only when activeStudyId is null', () => {
    const presets: MarkingPreset[] = [
      createPreset({ id: '1', studyId: undefined }),
      createPreset({ id: '2', studyId: undefined }),
      createPreset({ id: '3', studyId: 'study-a' }),
    ];
    const result = filterPresetsByStudy(presets, null);
    expect(result.map((p) => p.id)).toEqual(['1', '2']);
  });

  it('returns global + study presets when activeStudyId is set', () => {
    const presets: MarkingPreset[] = [
      createPreset({ id: '1', studyId: undefined }),
      createPreset({ id: '2', studyId: 'study-a' }),
      createPreset({ id: '3', studyId: 'study-b' }),
    ];
    const result = filterPresetsByStudy(presets, 'study-a');
    expect(result.map((p) => p.id)).toEqual(['1', '2']);
  });
});

describe('filterAnnotationsByStudy', () => {
  const globalPreset = createPreset({ id: 'global', studyId: undefined });
  const studyPreset = createPreset({ id: 'study-a', studyId: 'study-a' });
  const presetMap = new Map([
    ['global', globalPreset],
    ['study-a', studyPreset],
  ]);

  it('returns default-bucket only when activeStudyId is null', () => {
    const annotations: Annotation[] = [
      createAnnotation({ id: '1' }), // no preset = default
      createAnnotation({ id: '2', presetId: 'global' }), // global = default
      createAnnotation({ id: '3', presetId: 'study-a' }), // study = hide
    ];
    const result = filterAnnotationsByStudy(annotations, presetMap, null);
    expect(result.map((a) => a.id)).toEqual(['1', '2']);
  });

  it('returns global + study when activeStudyId is set', () => {
    const annotations: Annotation[] = [
      createAnnotation({ id: '1' }), // no preset = manual = hide
      createAnnotation({ id: '2', presetId: 'global' }),
      createAnnotation({ id: '3', presetId: 'study-a' }),
    ];
    const result = filterAnnotationsByStudy(annotations, presetMap, 'study-a');
    expect(result.map((a) => a.id)).toEqual(['2', '3']);
  });

  it('treats unknown presetId as default bucket', () => {
    const annotations: Annotation[] = [
      createAnnotation({ id: '1', presetId: 'unknown' }), // not in map
    ];
    const resultNull = filterAnnotationsByStudy(annotations, presetMap, null);
    const resultStudy = filterAnnotationsByStudy(annotations, presetMap, 'study-a');
    expect(resultNull.map((a) => a.id)).toEqual(['1']);
    expect(resultStudy.map((a) => a.id)).toEqual([]);
  });
});
