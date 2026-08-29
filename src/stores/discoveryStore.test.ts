import { describe, it, expect, beforeEach } from 'vitest';
import { useDiscoveryStore } from './discoveryStore';

describe('discoveryStore — checklistCompletedTracked latch', () => {
  beforeEach(() => {
    useDiscoveryStore.setState({
      context: null,
      lensActive: false,
      activePrompt: null,
      found: null,
      markedPresetId: null,
      revealedRungs: [],
      checklistCompletedTracked: false,
    });
  });

  it('defaults to false', () => {
    expect(useDiscoveryStore.getState().checklistCompletedTracked).toBe(false);
  });

  it('setChecklistCompletedTracked latches the flag on', () => {
    useDiscoveryStore.getState().setChecklistCompletedTracked(true);
    expect(useDiscoveryStore.getState().checklistCompletedTracked).toBe(true);
  });

  it('resetForChapter clears the latch, re-arming completion tracking for the next chapter', () => {
    useDiscoveryStore.getState().setChecklistCompletedTracked(true);
    useDiscoveryStore.getState().resetForChapter();
    expect(useDiscoveryStore.getState().checklistCompletedTracked).toBe(false);
  });

  it('resetForChapter leaves context untouched (only chapter-visit UI state resets)', () => {
    const context = {
      book: 'JHN',
      chapter: 3,
      translationId: 'nasb2020',
      analysis: { repetition: null, connectors: [] } as unknown as import('@/lib/chapterAnalysis').ChapterAnalysis,
      translationCount: 1,
      primaryTranslationAbbrev: 'NASB',
    };
    useDiscoveryStore.getState().setContext(context);
    useDiscoveryStore.getState().setChecklistCompletedTracked(true);
    useDiscoveryStore.getState().resetForChapter();
    expect(useDiscoveryStore.getState().context).toEqual(context);
    expect(useDiscoveryStore.getState().checklistCompletedTracked).toBe(false);
  });
});
