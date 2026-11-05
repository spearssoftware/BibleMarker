/**
 * RepetitionCard — the chapter's most-repeated meaningful word.
 *
 * Names the word and how often it appears, and offers to mark it. The mark
 * is a chapter-scoped key word (`markRepetitionAsKeyword`), so the ripple
 * across the text comes from the virtual-annotation matching `VerseText`
 * already does, and `useRepetitionKeyword` sees the new preset at once.
 * Whenever a key word in scope for this chapter (and active study) matches
 * the word — the card's own or the reader's — the card says so instead.
 */

import { useState } from 'react';
import { useRepetitionKeyword } from '@/stores/discoveryStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useStudyStore } from '@/stores/studyStore';
import { toast } from '@/stores/toastStore';
import { track } from '@/lib/telemetry';
import { markRepetitionAsKeyword } from '@/lib/discoveryActions';
import type { RepetitionResult } from '@/lib/chapterAnalysis';
import { Button } from '@/components/shared';
import { DiscoveryCard } from './DiscoveryCard';

interface RepetitionCardProps {
  repetition: RepetitionResult | null;
  translationCount: number;
  primaryTranslationAbbrev: string | null;
  book: string;
  chapter: number;
  translationId: string;
}

export function RepetitionCard({
  repetition,
  translationCount,
  primaryTranslationAbbrev,
  book,
  chapter,
  translationId,
}: RepetitionCardProps) {
  const inductiveToolsEnabled = usePreferencesStore(s => s.inductiveToolsEnabled);
  const activeStudyId = useStudyStore(s => s.activeStudyId) ?? undefined;
  const existingKeyword = useRepetitionKeyword(repetition?.token, book, chapter, translationId);
  const [marking, setMarking] = useState(false);

  if (!repetition) return null;

  const suffix = translationCount > 1 && primaryTranslationAbbrev ? ` (${primaryTranslationAbbrev})` : '';
  const title = `“${repetition.display}” appears ${repetition.count}× in this chapter${suffix}`;

  if (existingKeyword) {
    return (
      <DiscoveryCard title={title}>
        <p className="text-sm text-scripture-text">
          {"You've already marked it: "}
          <strong>{existingKeyword.word}</strong>
        </p>
      </DiscoveryCard>
    );
  }

  const handleMark = async () => {
    track('discovery_chip_tapped', { feature: 'repetition' });
    setMarking(true);
    try {
      await markRepetitionAsKeyword(repetition, book, chapter, activeStudyId);
    } catch (err) {
      console.error('[RepetitionCard] Failed to mark the repetition word:', err);
      toast.error("Couldn't highlight it — try again.");
    } finally {
      setMarking(false);
    }
  };

  return (
    <DiscoveryCard title={title}>
      <Button variant="primary" size="sm" onClick={handleMark} disabled={marking}>
        {inductiveToolsEnabled ? 'Mark it as a key word' : 'Highlight it in this chapter'}
      </Button>
    </DiscoveryCard>
  );
}
