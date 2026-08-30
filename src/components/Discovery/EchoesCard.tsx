/**
 * EchoesCard — Echo Hints
 *
 * "{n} verses here echo something older" — a verse in this chapter quotes or
 * alludes to an earlier passage in the canon, and this card asks the reader
 * to guess before it tells. Each row is up to a two-rung ladder: a category
 * hint ("It's in the Psalms.") first, then the reference itself as a jump —
 * never the echoed verse's text inline (that stays `CrossRefsTab`'s job). A
 * row with no section label (unreachable via the local provider today, but
 * the prop type permits it) skips straight to the reference rung, and a
 * target with no verse number renders as plain text instead of a jump.
 * Rung state is per-echo (`discoveryStore.revealedEchoes`), keyed
 * `${book}.${chapter}:${verse}:${targetRef}`, so it survives the panel
 * closing and reopening but resets on chapter change.
 *
 * One stable `Button` carries the row through unrevealed → category — its
 * label and handler branch on the current rung, so revealing the category
 * hint updates the same DOM node instead of unmounting the button the
 * reader just activated (which would otherwise dump focus to `<body>`; see
 * `RepetitionCard`'s single "Need a hint?" button for the same pattern).
 * That button disappears only at the final `reference` rung, where it's
 * replaced by the jump control (or plain text). The `aria-live` region is
 * scoped to just the earned category line + reference, not the buttons —
 * otherwise the ladder button's own churn gets announced.
 *
 * Shows only the 3 highest-voted echoes, sliced here (not in the query) so a
 * future glyph or checklist phase can reuse the full index. Rendered
 * verse-ordered once sliced, so the ladder reads top-to-bottom the way the
 * chapter does.
 */

import { useEffect, useMemo } from 'react';
import { Button } from '@/components/shared';
import { DiscoveryCard } from './DiscoveryCard';
import { useDiscoveryStore, type EchoRung } from '@/stores/discoveryStore';
import { useBibleStore } from '@/stores/bibleStore';
import { track } from '@/lib/telemetry';
import { pluralize, agree } from '@/lib/textUtils';
import { echoSectionFor, formatEchoTarget } from '@/lib/chapterAnalysis';
import { parseOsisRef } from '@/types';
import type { ChapterEcho } from '@/types';

const MAX_ROWS = 3;

interface EchoesCardProps {
  echoes: ChapterEcho[];
  book: string;
  chapter: number;
  translationId: string;
}

function echoKey(book: string, chapter: number, echo: ChapterEcho): string {
  return `${book}.${chapter}:${echo.verse}:${echo.targetRef}`;
}

export function EchoesCard({ echoes, book, chapter, translationId }: EchoesCardProps) {
  const revealedEchoes = useDiscoveryStore(s => s.revealedEchoes);
  const revealEchoRung = useDiscoveryStore(s => s.revealEchoRung);
  const navigateToVerse = useBibleStore(s => s.navigateToVerse);

  const topEchoes = useMemo(
    () =>
      [...echoes]
        .sort((a, b) => b.votes - a.votes)
        .slice(0, MAX_ROWS)
        .sort((a, b) => a.verse - b.verse),
    [echoes]
  );

  const shownCount = topEchoes.length;

  useEffect(() => {
    if (shownCount === 0) return;
    track('discovery_chip_shown', { feature: 'echo', dedupeKey: `echo:${book}:${chapter}:${translationId}` });
  }, [shownCount, book, chapter, translationId]);

  if (shownCount === 0) return null;

  const title = `${pluralize(shownCount, 'verse')} here ${agree(shownCount, 'echoes', 'echo')} something older`;

  const handleReveal = (key: string, rung: EchoRung) => {
    if (!revealedEchoes[key]) track('discovery_chip_tapped', { feature: 'echo' });
    revealEchoRung(key, rung);
  };

  return (
    <DiscoveryCard title={title}>
      <p className="text-sm text-scripture-text">Before you look — where do you think it comes from?</p>
      <div className="space-y-2">
        {topEchoes.map(echo => {
          const key = echoKey(book, chapter, echo);
          const rung = revealedEchoes[key];
          const target = parseOsisRef(echo.targetRef);
          const section = target ? echoSectionFor(target.book) : undefined;
          const targetVerse = target?.verse;
          // No section label means there's nothing to ask the reader to guess
          // — skip the category rung and go straight to the reference.
          const nextRung: EchoRung = section ? 'category' : 'reference';

          return (
            <div key={key} className="space-y-1">
              <div aria-live="polite">
                {rung && section && (
                  <p className="text-sm text-scripture-muted">{`It's in ${section}.`}</p>
                )}
                {rung === 'reference' &&
                  (target && targetVerse !== undefined ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigateToVerse(target.book, target.chapter, targetVerse, true)}
                    >
                      {formatEchoTarget(echo.targetRef, echo.targetEndRef)}
                    </Button>
                  ) : (
                    <p className="text-sm text-scripture-text">
                      {formatEchoTarget(echo.targetRef, echo.targetEndRef)}
                    </p>
                  ))}
              </div>
              {rung !== 'reference' && (
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={rung === 'category' ? `Show me where v.${echo.verse} comes from` : undefined}
                  onClick={() => handleReveal(key, rung === 'category' ? 'reference' : nextRung)}
                >
                  {rung === 'category' ? 'Show me' : `Where does v.${echo.verse} come from?`}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </DiscoveryCard>
  );
}
