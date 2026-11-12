/**
 * @vitest-environment jsdom
 *
 * useAnnotations stamps new marks with the effective study: with a study
 * selected, Read files them under no study and Study files them under it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ChapterTitle, SectionHeading, TextAnnotation } from '@/types';

const db = vi.hoisted(() => ({
  saveAnnotation: vi.fn(async () => {}),
  saveSectionHeading: vi.fn(async () => {}),
  saveChapterTitle: vi.fn(async () => {}),
}));

vi.mock('@/lib/database', () => ({
  ...db,
  deleteAnnotation: vi.fn(async () => {}),
  findSisterAnnotations: vi.fn(async () => []),
  getAnnotationById: vi.fn(async () => undefined),
  getChapterAnnotations: vi.fn(async () => []),
  getChapterHeadings: vi.fn(async () => []),
  deleteSectionHeading: vi.fn(async () => {}),
  getChapterTitle: vi.fn(async () => undefined),
  deleteChapterTitle: vi.fn(async () => {}),
  getChapterNotes: vi.fn(async () => []),
  saveNote: vi.fn(async () => {}),
  deleteNote: vi.fn(async () => {}),
  getMarkingPreset: vi.fn(async () => undefined),
  updatePreferences: vi.fn(async () => {}),
}));
vi.mock('@/lib/bible-api', () => ({ fetchChapter: vi.fn(async () => ({ verses: [] })) }));
vi.mock('@/lib/observationAutoAdd', () => ({ autoAddToObservationTracker: vi.fn(async () => {}) }));

import { useAnnotations } from '../useAnnotations';
import { useAnnotationStore } from '@/stores/annotationStore';
import { useAppModeStore, type AppMode } from '@/stores/appModeStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useStudyStore } from '@/stores/studyStore';

function setup(mode: AppMode) {
  useAppModeStore.setState({ mode });
  useStudyStore.setState({ activeStudyId: 'romans' });
  useBibleStore.setState({ currentBook: 'Rom', currentChapter: 1, currentModuleId: 'kjv' });
  useAnnotationStore.setState({
    selection: { moduleId: 'kjv', book: 'Rom', chapter: 1, startVerse: 1, endVerse: 1, text: 'Paul' },
  });
  return renderHook(() => useAnnotations());
}

describe.each([
  ['read', undefined],
  ['study', 'romans'],
] as const)('useAnnotations stamping in %s', (mode, expected) => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps a preset-less text annotation', async () => {
    const { result } = setup(mode);
    await act(async () => {
      await result.current.createTextAnnotation('highlight', 'yellow');
    });
    const saved = db.saveAnnotation.mock.calls[0] as unknown as [TextAnnotation];
    expect(saved[0].studyId).toBe(expected);
  });

  it('stamps a quick highlight', async () => {
    const { result } = setup(mode);
    await act(async () => {
      await result.current.quickHighlight('yellow');
    });
    const saved = db.saveAnnotation.mock.calls[0] as unknown as [TextAnnotation];
    expect(saved[0].studyId).toBe(expected);
  });

  it('stamps a section heading', async () => {
    const { result } = setup(mode);
    await act(async () => {
      await result.current.createSectionHeading(1, 'Greeting');
    });
    const saved = db.saveSectionHeading.mock.calls[0] as unknown as [SectionHeading];
    expect(saved[0].studyId).toBe(expected);
  });

  it('stamps a chapter title', async () => {
    const { result } = setup(mode);
    await act(async () => {
      await result.current.createChapterTitle('Paul to Rome');
    });
    const saved = db.saveChapterTitle.mock.calls[0] as unknown as [ChapterTitle];
    expect(saved[0].studyId).toBe(expected);
  });
});
