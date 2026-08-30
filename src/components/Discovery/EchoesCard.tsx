/**
 * EchoesCard — Echo Hints
 *
 * "{n} verses here echo something older" — a verse in this chapter quotes or
 * alludes to an earlier passage in the canon, and this card asks the reader
 * to guess before it tells. Each row is a two-rung ladder: a category hint
 * ("It's in the Psalms.") first, then the reference itself as a jump — never
 * the echoed verse's text inline (that stays `CrossRefsTab`'s job). Rung
 * state is per-echo (`discoveryStore.revealedEchoes`), keyed
 * `${book}.${chapter}:${verse}:${targetRef}`, so it survives the panel
 * closing and reopening but resets on chapter change.
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
      <div aria-live="polite" className="space-y-2">
        {topEchoes.map(echo => {
          const key = echoKey(book, chapter, echo);
          const rung = revealedEchoes[key];
          const target = parseOsisRef(echo.targetRef);
          const section = target ? echoSectionFor(target.book) : undefined;

          return (
            <div key={key} className="space-y-1">
              {!rung && (
                <Button variant="ghost" size="sm" onClick={() => handleReveal(key, 'category')}>
                  {`Where does v.${echo.verse} come from?`}
                </Button>
              )}
              {rung && section && (
                <p className="text-sm text-scripture-muted">{`It's in ${section}.`}</p>
              )}
              {rung === 'category' && (
                <Button variant="ghost" size="sm" onClick={() => handleReveal(key, 'reference')}>
                  Show me
                </Button>
              )}
              {rung === 'reference' && target && target.verse !== undefined && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigateToVerse(target.book, target.chapter, target.verse as number, true)}
                >
                  {formatEchoTarget(echo.targetRef, echo.targetEndRef)}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </DiscoveryCard>
  );
}
