/**
 * EventList — the chapter's Gnosis events, in order.
 *
 * Up to 5 rows, then `+N more`. A row expands inline to its year,
 * participants and the verses here; Gnosis has no event-location data, so
 * participants are the only "who/where" shown. Years are omitted in
 * Genesis 1–11, which has none.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/shared';
import { formatAboutYear, isPrimeval } from '@/lib/chapterAnalysis';
import type { ChapterEvent } from '@/types';
import { trackChip } from './discoveryTelemetry';
import { MoreInReference, VerseLinks } from './InlineDetail';

const VISIBLE_LIMIT = 5;

interface EventListProps {
  events: ChapterEvent[];
  book: string;
  chapter: number;
  translationId: string;
}

export function EventList({ events, book, chapter, translationId }: EventListProps) {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const primeval = isPrimeval(book, chapter);

  const hasEvents = events.length > 0;
  useEffect(() => {
    if (hasEvents) trackChip('discovery_chip_shown', 'setting_timeline', { book, chapter, translationId });
  }, [hasEvents, book, chapter, translationId]);

  if (!hasEvents) return null;

  const visible = showAll ? events : events.slice(0, VISIBLE_LIMIT);
  const hidden = events.length - visible.length;

  const handleToggle = (slug: string) => {
    if (expandedSlug === slug) {
      setExpandedSlug(null);
      return;
    }
    setExpandedSlug(slug);
    trackChip('discovery_chip_tapped', 'setting_timeline', { book, chapter, translationId });
  };

  return (
    <ul className="space-y-1">
      {visible.map(event => {
        const expanded = expandedSlug === event.slug;
        const year = !primeval && event.startYearDisplay ? formatAboutYear(event.startYearDisplay, { capitalized: false }) : null;
        const detailId = `event-detail-${event.slug}`;
        return (
          <li key={event.slug}>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={detailId}
              onClick={() => handleToggle(event.slug)}
              className="w-full flex items-baseline justify-between gap-2 text-left px-2 py-1.5 rounded hover:bg-scripture-elevated text-sm"
            >
              <span className="text-scripture-text">{event.title}</span>
              {year && <span className="text-xs text-scripture-muted shrink-0">{year}</span>}
            </button>
            {expanded && (
              <div id={detailId} className="px-2 pb-2 space-y-1">
                {year && <p className="text-sm text-scripture-muted">{year}</p>}
                {event.participants.length > 0 && (
                  <p className="text-sm text-scripture-text">
                    {`With ${event.participants.map(p => p.name).join(', ')}`}
                  </p>
                )}
                <VerseLinks book={book} chapter={chapter} verses={event.verses} />
                <MoreInReference slug={event.slug} type="event" />
              </div>
            )}
          </li>
        );
      })}
      {hidden > 0 && (
        <li>
          <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>{`+${hidden} more`}</Button>
        </li>
      )}
    </ul>
  );
}
