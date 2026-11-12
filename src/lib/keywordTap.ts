/**
 * Keyword Tap
 *
 * What tapping a marked word in the reader does. In Study, it
 * opens the word's observation list (creating the list on first tap). With
 * elsewhere it opens the Key Words panel, in its simplified mode, on that mark
 * so the reader can restyle or remove it: no inductive panel opens and no
 * list is created.
 */

import type { VerseRef } from '@/types';
import { useListStore } from '@/stores/listStore';
import { getEffectiveStudyId } from '@/lib/effectiveStudy';
import { usePanelStore } from '@/stores/panelStore';

export type KeywordTapHandler = (presetId: string, verseRef: VerseRef) => void;

function openKeywordList(presetId: string, verseRef: VerseRef): void {
  const activeStudyId = getEffectiveStudyId() ?? undefined;
  useListStore.getState().getOrCreateListForKeyword(presetId, activeStudyId, verseRef.book).then(list => {
    window.dispatchEvent(new CustomEvent('openObservationTools', {
      detail: { tab: 'lists', listId: list.id, verseRef },
    }));
  });
}

function openMarkInKeyWords(presetId: string): void {
  usePanelStore.getState().openPanel('keywords', { keywordInitialPresetId: presetId });
}

export function getKeywordTapHandler(isStudyMode: boolean): KeywordTapHandler {
  return isStudyMode ? openKeywordList : openMarkInKeyWords;
}
