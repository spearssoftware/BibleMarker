/**
 * EchoesCard — Echo Hints. Up to a two-rung reveal ladder per row (category
 * hint, then the reference as a jump), stored in
 * `discoveryStore.revealedEchoes` keyed `${book}.${chapter}:${verse}:${targetRef}`
 * so it survives the panel closing and reopening but resets on chapter change.
 */

import { useMemo } from 'react';
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

/** Where a row currently sits on the reveal ladder; `revealedEchoes[key]` maps 1:1 except for the unrevealed start. */
type EchoPhase = 'hidden' | EchoRung;

interface EchoesCardProps {
  echoes: ChapterEcho[];
  book: string;
  chapter: number;
}

interface EchoRow {
  echo: ChapterEcho;
  key: string;
  // No section label means there's nothing to ask the reader to guess —
  // skip the category rung and go straight to the reference.
  section: string | undefined;
  label: string;
  // Present only when the target has a verse to jump to; otherwise the
  // reference rung renders as plain text instead of a jump button.
  jumpTarget: { book: string; chapter: number; verse: number } | undefined;
}

function echoKey(book: string, chapter: number, echo: ChapterEcho): string {
  return `${book}.${chapter}:${echo.verse}:${echo.targetRef}`;
}

export function EchoesCard({ echoes, book, chapter }: EchoesCardProps) {
  const revealedEchoes = useDiscoveryStore(s => s.revealedEchoes);
  const revealEchoRung = useDiscoveryStore(s => s.revealEchoRung);
  const navigateToVerse = useBibleStore(s => s.navigateToVerse);

  // Shows only the 3 highest-voted echoes (a future glyph/checklist phase can
  // reuse the full index), then re-sorts verse-ordered so the ladder reads
  // top-to-bottom the way the chapter does. Parsing/labeling happens once
  // here rather than per row per render.
  const topEchoes = useMemo<EchoRow[]>(
    () =>
      [...echoes]
        .sort((a, b) => b.votes - a.votes)
        .slice(0, MAX_ROWS)
        .sort((a, b) => a.verse - b.verse)
        .map(echo => {
          const target = parseOsisRef(echo.targetRef);
          return {
            echo,
            key: echoKey(book, chapter, echo),
            section: target ? echoSectionFor(target.book) : undefined,
            label: formatEchoTarget(echo.targetRef, echo.targetEndRef),
            jumpTarget:
              target && target.verse !== undefined
                ? { book: target.book, chapter: target.chapter, verse: target.verse }
                : undefined,
          };
        }),
    [echoes, book, chapter]
  );

  const shownCount = topEchoes.length;
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
        {topEchoes.map(row => {
          // `revealedEchoes` is typed as always-present per key, but an
          // unrevealed row's key is genuinely absent at runtime.
          const phase: EchoPhase = (revealedEchoes[row.key] as EchoRung | undefined) ?? 'hidden';

          return (
            <div key={row.key} className="space-y-1">
              {/* Scoped to the earned category line + reference, not the
                  buttons below, so the ladder button's own churn isn't announced. */}
              <div aria-live="polite">
                {phase !== 'hidden' && row.section && (
                  <p className="text-sm text-scripture-muted">{`It's in ${row.section}.`}</p>
                )}
                {phase === 'reference' &&
                  (row.jumpTarget ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => navigateToVerse(row.jumpTarget!.book, row.jumpTarget!.chapter, row.jumpTarget!.verse, true)}
                    >
                      {row.label}
                    </Button>
                  ) : (
                    <p className="text-sm text-scripture-text">{row.label}</p>
                  ))}
              </div>
              {phase !== 'reference' && (
                // One stable Button carries the row through hidden → category
                // — its label/handler branch on `phase` so revealing the
                // category hint updates this node in place instead of
                // unmounting the button the reader just activated (which
                // would dump focus to `<body>`; see RepetitionCard's single
                // "Need a hint?" button for the same pattern).
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={phase === 'category' ? `Show me where v.${row.echo.verse} comes from` : undefined}
                  onClick={() => handleReveal(row.key, phase === 'category' ? 'reference' : row.section ? 'category' : 'reference')}
                >
                  {phase === 'category' ? 'Show me' : `Where does v.${row.echo.verse} come from?`}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </DiscoveryCard>
  );
}
