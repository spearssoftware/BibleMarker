/**
 * RepetitionChip — Repetition Radar
 *
 * "One word appears N× — can you find it?" never says which word. Tapping
 * opens a popover with an instruction to select the word in the text, plus a
 * "Need a hint?" button that reveals a hint ladder one press at a time
 * (category hint, auto-skipped when Gnosis has no matching entity → verse
 * range → first-occurrence verse) via `ToolbarPopover`. Previously revealed
 * hints stay visible as the ladder grows. The chip only confirms once the
 * reader selects the word themselves in the primary translation column;
 * `RepetitionResult.token` never reaches the DOM (no title/aria/data
 * attribute renders it) — the hint ladder is deliberately Socratic.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { track } from '@/lib/telemetry';
import { Button, ToolbarPopover } from '@/components/shared';
import { useAnnotationStore, type TextSelection } from '@/stores/annotationStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useStudyStore } from '@/stores/studyStore';
import { usePanelStore } from '@/stores/panelStore';
import { markRepetitionAsKeyword } from '@/lib/discoveryActions';
import { normalizeForMatching } from '@/lib/keywordMatching';
import { singularize, verseRangeLabel, deriveCategoryHint, type RepetitionResult } from '@/lib/chapterAnalysis';
import type { ChapterEntities } from '@/types';

interface RepetitionChipProps {
  repetition: RepetitionResult | null;
  translationCount: number;
  primaryTranslationName?: string;
  book: string;
  chapter: number;
  translationId: string;
  entities: ChapterEntities | null;
}

type HintRung = 'hint' | 'range' | 'first';

export function RepetitionChip({
  repetition,
  translationCount,
  primaryTranslationName,
  book,
  chapter,
  translationId,
  entities,
}: RepetitionChipProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [revealedCount, setRevealedCount] = useState(0);
  const [confirmedSelection, setConfirmedSelection] = useState<TextSelection | null>(null);

  const selection = useAnnotationStore(s => s.selection);
  const found = useDiscoveryStore(s => s.found);
  const setFound = useDiscoveryStore(s => s.setFound);
  const inductiveToolsEnabled = usePreferencesStore(s => s.inductiveToolsEnabled);
  const activeStudyId = useStudyStore(s => s.activeStudyId) ?? undefined;
  const openPanel = usePanelStore(s => s.openPanel);

  const isFound = found?.book === book && found?.chapter === chapter && found?.translationId === translationId;

  const categoryHint = useMemo(
    () => (repetition ? deriveCategoryHint(repetition, entities) : undefined),
    [repetition, entities]
  );

  const rungs: HintRung[] = categoryHint ? ['hint', 'range', 'first'] : ['range', 'first'];

  useEffect(() => {
    if (!repetition || isFound || !selection) return;
    if (selection.moduleId !== translationId) return;
    if (selection.book !== book || selection.chapter !== chapter) return;
    if (selection.startVerse !== selection.endVerse) return;
    const normalized = singularize(normalizeForMatching(selection.text));
    if (normalized === repetition.token) {
      // Subscribing to an external system (the reader's own text selection)
      // and reacting once it matches is exactly what an effect is for; the
      // three updates below all fire together as one atomic "confirmed" state,
      // not a chain of derived renders.
      setFound({ book, chapter, translationId });
      track('discovery_find_confirmed', { feature: 'repetition' });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfirmedSelection(selection);
      setPopoverOpen(false);
    }
  }, [selection, repetition, isFound, translationId, book, chapter, setFound]);

  if (!repetition) return null;

  if (isFound) {
    const buttonLabel = inductiveToolsEnabled ? 'Mark it as a key word' : 'Highlight it in this chapter';
    const handleMark = async () => {
      if (!confirmedSelection) return;
      await markRepetitionAsKeyword(confirmedSelection, activeStudyId, repetition);
      if (inductiveToolsEnabled) openPanel('keywords');
    };
    return (
      <div className="inline-flex items-center gap-2">
        <span className="px-3 py-1.5 rounded-full text-xs font-ui font-medium text-scripture-success border border-scripture-success/30">
          You found it
        </span>
        <Button variant="primary" size="sm" className="rounded-full" onClick={handleMark} disabled={!confirmedSelection}>
          {buttonLabel}
        </Button>
      </div>
    );
  }

  const label =
    translationCount > 1 && primaryTranslationName
      ? `One word appears ${repetition.count}× (${primaryTranslationName}) — can you find it?`
      : `One word appears ${repetition.count}× — can you find it?`;

  const handleChipClick = () => {
    if (popoverOpen) {
      setPopoverOpen(false);
      return;
    }
    track('discovery_chip_tapped', { feature: 'repetition' });
    setPopoverOpen(true);
    setRevealedCount(0);
  };

  const handleHint = () => {
    setRevealedCount(c => Math.min(c + 1, rungs.length));
  };

  const rungText = (r: HintRung) =>
    r === 'hint'
      ? categoryHint === 'people'
        ? "It's a name for someone."
        : "It's a name for a place."
      : r === 'range'
        ? `Look ${verseRangeLabel(repetition)}.`
        : `It first shows up in v.${repetition.firstVerse}.`;

  const allHintsShown = revealedCount >= rungs.length;

  return (
    <div ref={triggerRef} className="inline-block">
      <Button
        variant="secondary"
        size="sm"
        className="rounded-full"
        aria-expanded={popoverOpen}
        onClick={handleChipClick}
      >
        {label}
      </Button>
      {popoverOpen && (
        <ToolbarPopover
          triggerRef={triggerRef}
          width={260}
          label="Repetition hint"
          onClose={() => setPopoverOpen(false)}
        >
          <div className="p-4 space-y-3">
            <p className="text-sm text-scripture-text">
              When you spot it, select the word in the text to check.
            </p>
            {rungs.slice(0, revealedCount).map(r => (
              <p key={r} className="text-sm text-scripture-text">
                {rungText(r)}
              </p>
            ))}
            {allHintsShown && (
              <p className="text-xs text-scripture-muted">{"That's all the hints — keep looking."}</p>
            )}
            <div className="flex justify-end gap-2">
              {!allHintsShown && (
                <Button variant="ghost" size="sm" onClick={handleHint}>
                  Need a hint?
                </Button>
              )}
              <Button variant="secondary" size="sm" onClick={() => setPopoverOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </ToolbarPopover>
      )}
    </div>
  );
}
