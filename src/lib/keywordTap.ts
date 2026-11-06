/**
 * Keyword Tap
 *
 * What tapping a marked word in the reader does. With inductive tools on, it
 * opens the word's observation list (creating the list on first tap). With
 * them off there is no tap handler at all: marks behave like plain text, so
 * no inductive panel opens and no list is created. The reader changes or
 * removes a mark by selecting the word again.
 */

import type { VerseRef } from '@/types';
import { useListStore } from '@/stores/listStore';
import { useStudyStore } from '@/stores/studyStore';

export type KeywordTapHandler = (presetId: string, verseRef: VerseRef) => void;

function openKeywordList(presetId: string, verseRef: VerseRef): void {
  const activeStudyId = useStudyStore.getState().activeStudyId ?? undefined;
  useListStore.getState().getOrCreateListForKeyword(presetId, activeStudyId, verseRef.book).then(list => {
    window.dispatchEvent(new CustomEvent('openObservationTools', {
      detail: { tab: 'lists', listId: list.id, verseRef },
    }));
  });
}

export function getKeywordTapHandler(inductiveToolsEnabled: boolean): KeywordTapHandler | undefined {
  return inductiveToolsEnabled ? openKeywordList : undefined;
}
