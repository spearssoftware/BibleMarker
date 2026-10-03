/**
 * EraStrip — "you are here" timeline.
 *
 * Eight equal-width era bands with a marker at `index + fraction`. Genesis
 * 1–11 carries no year, so its marker sits at the center of Beginnings.
 * Hidden when the chapter has no year and isn't primeval.
 */

import { useEffect } from 'react';
import { ERA_BANDS, eraPosition, isPrimeval } from '@/lib/chapterAnalysis';
import { trackChip } from './discoveryTelemetry';

interface EraStripProps {
  book: string;
  chapter: number;
  translationId: string;
  /** Astronomical chapter year (-4003 = 4004 BC); null when undated. */
  year: number | null;
}

export function EraStrip({ book, chapter, translationId, year }: EraStripProps) {
  const position = isPrimeval(book, chapter)
    ? { index: 0, fraction: 0.5 }
    : year === null
      ? null
      : eraPosition(year);

  const visible = position !== null;
  useEffect(() => {
    if (visible) trackChip('discovery_chip_shown', 'setting_timeline', { book, chapter, translationId });
  }, [visible, book, chapter, translationId]);

  if (!position) return null;

  const left = `${((position.index + position.fraction) / ERA_BANDS.length) * 100}%`;

  return (
    <div className="space-y-1">
      <div className="relative flex gap-0.5 pt-2" data-testid="era-strip">
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
