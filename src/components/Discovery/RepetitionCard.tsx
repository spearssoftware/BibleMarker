/**
 * RepetitionCard — Repetition Radar (replaces the old `RepetitionChip`)
 *
 * "One word appears N× — can you find it?" never says which word. Presents
 * a hint ladder (category hint, auto-skipped when Gnosis has no matching
 * entity → verse range → first-occurrence verse) revealed one press at a
 * time, backed by `discoveryStore.revealedHints` so it survives the panel
 * closing and reopening. The confirm effect itself lives in
 * `useDiscoveryHost` — this component is purely presentational and reads
 * `found`/`markedPresetId` from the store. `RepetitionResult.token` never
 * reaches the DOM (no title/aria/data attribute renders it) — the hint
 * ladder is deliberately Socratic.
 */

import { useMemo } from 'react';
import { Button } from '@/components/shared';
import { DiscoveryCard } from './DiscoveryCard';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useStudyStore } from '@/stores/studyStore';
import { track } from '@/lib/telemetry';
import { markRepetitionAsKeyword } from '@/lib/discoveryActions';
import { verseRangeLabel, deriveCategoryHint, type RepetitionResult } from '@/lib/chapterAnalysis';
import type { ChapterEntities } from '@/types';

interface RepetitionCardProps {
  repetition: RepetitionResult | null;
  translationCount: number;
  primaryTranslationAbbrev: string | null;
  book: string;
  chapter: number;
  translationId: string;
  entities: ChapterEntities | null;
}

type HintRung = 'hint' | 'range' | 'first';

export function RepetitionCard({
  repetition,
  translationCount,
  primaryTranslationAbbrev,
  book,
  chapter,
  translationId,
  entities,
}: RepetitionCardProps) {
  const found = useDiscoveryStore(s => s.found);
  const revealedHints = useDiscoveryStore(s => s.revealedHints);
  const revealNextHint = useDiscoveryStore(s => s.revealNextHint);
  const markedPresetId = useDiscoveryStore(s => s.markedPresetId);
  const setMarkedPresetId = useDiscoveryStore(s => s.setMarkedPresetId);
  const inductiveToolsEnabled = usePreferencesStore(s => s.inductiveToolsEnabled);
  const activeStudyId = useStudyStore(s => s.activeStudyId) ?? undefined;

  const categoryHint = useMemo(
    () => (repetition ? deriveCategoryHint(repetition, entities) : undefined),
    [repetition, entities]
  );

  if (!repetition) return null;

  const isFound =
    found?.book === book && found?.chapter === chapter && found?.translationId === translationId;

  const rungs: HintRung[] = categoryHint ? ['hint', 'range', 'first'] : ['range', 'first'];
  const allHintsShown = revealedHints >= rungs.length;

  const rungText = (r: HintRung) =>
    r === 'hint'
      ? categoryHint === 'people'
        ? "It's a name for someone."
        : "It's a name for a place."
      : r === 'range'
        ? `Look ${verseRangeLabel(repetition)}.`
        : `It first shows up in v.${repetition.firstVerse}.`;

  const handleHint = () => {
    if (revealedHints === 0) track('discovery_chip_tapped', { feature: 'repetition' });
    revealNextHint();
  };

  if (isFound) {
    const alreadyMarked = !!markedPresetId;
    const buttonLabel = inductiveToolsEnabled ? 'Mark it as a key word' : 'Highlight it in this chapter';

    const handleMark = async () => {
      if (!found) return;
      const preset = await markRepetitionAsKeyword(found.selection, activeStudyId, repetition);
      setMarkedPresetId(preset.id);
    };

    return (
      <DiscoveryCard title="You found it">
        <p className="text-sm text-scripture-text">
          You found it: <strong>{found.selection.text}</strong>
        </p>
        <Button variant="primary" size="sm" onClick={handleMark} disabled={alreadyMarked}>
          {alreadyMarked ? 'Highlighted ✓' : buttonLabel}
        </Button>
      </DiscoveryCard>
    );
  }

  const suffix = translationCount > 1 && primaryTranslationAbbrev ? ` (${primaryTranslationAbbrev})` : '';

  return (
    <DiscoveryCard title={`One word appears ${repetition.count}× in this chapter${suffix}`}>
      <p className="text-sm text-scripture-text">
        Can you find it? When you spot it, select the word in the text to check.
      </p>
      {rungs.slice(0, revealedHints).map(r => (
        <p key={r} className="text-sm text-scripture-text">
          {rungText(r)}
        </p>
      ))}
      {allHintsShown ? (
        <p className="text-xs text-scripture-muted">{"That's all the hints — keep looking."}</p>
      ) : (
        <Button variant="ghost" size="sm" onClick={handleHint}>
          Need a hint?
        </Button>
      )}
    </DiscoveryCard>
  );
}
