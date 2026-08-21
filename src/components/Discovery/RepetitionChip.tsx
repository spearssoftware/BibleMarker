/**
 * RepetitionChip — Repetition Radar
 *
 * "One word appears N× in this chapter" never says which word. Tapping opens
 * a hint ladder (count → category hint, auto-skipped when Gnosis has no
 * matching entity → verse range) via `ToolbarPopover`. The chip only
 * confirms once the reader selects the word themselves in the primary
 * translation column; `RepetitionResult.token` never reaches the DOM (no
 * title/aria/data attribute renders it) — the hint ladder is deliberately
 * Socratic.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ToolbarPopover } from '@/components/shared';
import { useAnnotationStore, type TextSelection } from '@/stores/annotationStore';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useStudyStore } from '@/stores/studyStore';
import { usePanelStore } from '@/stores/panelStore';
import { useChapterEntities } from '@/hooks/useGnosis';
import { markRepetitionAsKeyword } from '@/lib/discoveryActions';
import { normalizeForMatching } from '@/lib/keywordMatching';
import { singularize, verseRangeLabel, deriveCategoryHint, type RepetitionResult } from '@/lib/chapterAnalysis';

interface RepetitionChipProps {
  repetition: RepetitionResult | null;
  translationCount: number;
  primaryTranslationName?: string;
  book: string;
  chapter: number;
  translationId: string;
}

type Rung = 'count' | 'hint' | 'range';

export function RepetitionChip({
  repetition,
  translationCount,
  primaryTranslationName,
  book,
  chapter,
  translationId,
}: RepetitionChipProps) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [rung, setRung] = useState(0);
  const [confirmedSelection, setConfirmedSelection] = useState<TextSelection | null>(null);

  const selection = useAnnotationStore(s => s.selection);
  const found = useDiscoveryStore(s => s.found);
  const setFound = useDiscoveryStore(s => s.setFound);
  const inductiveToolsEnabled = usePreferencesStore(s => s.inductiveToolsEnabled);
  const activeStudyId = useStudyStore(s => s.activeStudyId) ?? undefined;
  const openPanel = usePanelStore(s => s.openPanel);
  const { entities } = useChapterEntities(book, chapter);

  const isFound = found?.book === book && found?.chapter === chapter && found?.translationId === translationId;

  const categoryHint = useMemo(
    () => (repetition ? deriveCategoryHint(repetition, entities) : undefined),
    [repetition, entities]
  );

  const rungs: Rung[] = categoryHint ? ['count', 'hint', 'range'] : ['count', 'range'];

  useEffect(() => {
    if (!repetition || isFound || !selection) return;
    if (selection.moduleId !== translationId) return;
    if (selection.startVerse !== selection.endVerse) return;
    const normalized = singularize(normalizeForMatching(selection.text));
    if (normalized === repetition.token) {
      // Subscribing to an external system (the reader's own text selection)
      // and reacting once it matches is exactly what an effect is for; the
      // three updates below all fire together as one atomic "confirmed" state,
      // not a chain of derived renders.
      setFound({ book, chapter, translationId });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setConfirmedSelection(selection);
      setPopoverOpen(false);
    }
  }, [selection, repetition, isFound, translationId, book, chapter, setFound]);

  if (!repetition) return null;

  if (isFound) {
    const buttonLabel = inductiveToolsEnabled ? 'Mark it as a key word' : 'Highlight it everywhere';
    const handleMark = async () => {
      if (!confirmedSelection) return;
      await markRepetitionAsKeyword(confirmedSelection, activeStudyId);
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
      ? `One word appears ${repetition.count}× in this chapter (${primaryTranslationName})`
      : `One word appears ${repetition.count}× in this chapter`;

  const handleChipClick = () => {
    if (!popoverOpen) {
      setPopoverOpen(true);
      setRung(0);
    } else {
      setRung(r => Math.min(r + 1, rungs.length - 1));
    }
  };

  const currentRung = rungs[rung];
  const rungText =
    currentRung === 'count'
      ? `It appears ${repetition.count} times.`
      : currentRung === 'hint'
        ? categoryHint === 'people'
          ? "It's a name for someone."
          : "It's a name for a place."
        : `Look ${verseRangeLabel(repetition)}.`;

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
            <p className="text-sm text-scripture-text">{rungText}</p>
            <div className="flex justify-end gap-2">
              {rung < rungs.length - 1 && (
                <Button variant="ghost" size="sm" onClick={handleChipClick}>
                  Next hint
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
