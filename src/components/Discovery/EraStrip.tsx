/**
 * EraStrip — "you are here" timeline.
 *
 * Eight equal-width era bands with a marker at `index + fraction`. Genesis
 * 1–11 carries no year, so its marker sits at the center of Beginnings.
 * Hidden when the chapter has no year and isn't primeval, and while the year
 * is still loading or failed (`yearPending`). The marker is inset within its
 * band so a band's first year doesn't sit on the seam.
 */

import { ERA_BANDS, chapterEraPosition } from '@/lib/chapterAnalysis';

interface EraStripProps {
  book: string;
  chapter: number;
  /** Astronomical chapter year (-4003 = 4004 BC); null when undated. */
  year: number | null;
  /** True while the chapter-year query is loading or errored. */
  yearPending: boolean;
}

export function EraStrip({ book, chapter, year, yearPending }: EraStripProps) {
  const position = chapterEraPosition(book, chapter, year, yearPending);
  if (!position) return null;

  const left = `${((position.index + 0.1 + position.fraction * 0.8) / ERA_BANDS.length) * 100}%`;

  return (
    <div className="space-y-1">
      <div
        role="img"
        aria-label={`Era: ${ERA_BANDS[position.index].label}`}
        className="relative flex gap-0.5 pt-2"
        data-testid="era-strip"
      >
        {ERA_BANDS.map((band, i) => (
          <div
            key={band.label}
            className={`h-2 flex-1 rounded-sm ${i === position.index ? 'bg-scripture-accent/40' : 'bg-scripture-elevated'}`}
          />
        ))}
        <div
          data-testid="era-marker"
          style={{ left }}
          className="absolute top-0 h-4 w-1 -translate-x-1/2 rounded-sm bg-scripture-accent"
        />
      </div>
      <p className="text-xs text-scripture-muted">
        You are here: <span className="text-scripture-text">{ERA_BANDS[position.index].label}</span>
      </p>
    </div>
  );
}
