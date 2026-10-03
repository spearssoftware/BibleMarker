/**
 * WhosHereCard — the people named in this chapter.
 *
 * Excludes the deity slugs, orders by verses naming the person (then name,
 * then slug), shows 5 with `+N more`. "First appears in" is computed from
 * `usePeopleSpread` (canonical order), not Gnosis's `first_mention`. Rows
 * expand inline. Hidden while loading, on error, or with nobody to show; a
 * missing or failed spread only drops the first-appears and books lines.
 */

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/shared';
import { useChapterPeople, usePeopleSpread } from '@/hooks/useGnosis';
import { DEITY_SLUGS, isInChapter } from '@/lib/chapterAnalysis';
import { pluralize } from '@/lib/textUtils';
import { formatVerseRef, getBookById, parseOsisRef } from '@/types';
import type { ChapterPerson, EntitySpread } from '@/types';
import { DiscoveryCard } from './DiscoveryCard';
import { trackChip } from './discoveryTelemetry';
import { MoreInReference, VerseLinks } from './InlineDetail';

const VISIBLE_LIMIT = 5;
const LISTED_BOOKS = 2;

function compareRows(a: ChapterPerson, b: ChapterPerson): number {
  return b.verses.length - a.verses.length || a.name.localeCompare(b.name) || a.slug.localeCompare(b.slug);
}

function firstAppearsText(spread: EntitySpread, book: string, chapter: number): string | null {
  if (isInChapter(spread.firstRef, book, chapter)) return 'First time in Scripture';
  const ref = parseOsisRef(spread.firstRef);
  if (!ref) return null;
  return `First appears in ${formatVerseRef(ref.book, ref.chapter, ref.verse)}`;
}

/** "Named in Genesis", "Named in Genesis and Exodus", "Named in Genesis, Exodus, and Leviticus", "Named in Genesis, Exodus, and 13 other books". */
function namedInBooksText(bookIds: string[]): string | null {
  const names = bookIds.map(id => getBookById(id)?.name ?? id);
  if (names.length === 0) return null;
  if (names.length === 1) return `Named in ${names[0]}`;
  if (names.length === 2) return `Named in ${names[0]} and ${names[1]}`;
  if (names.length === 3) return `Named in ${names[0]}, ${names[1]}, and ${names[2]}`;
  const rest = names.length - LISTED_BOOKS;
  return `Named in ${names.slice(0, LISTED_BOOKS).join(', ')}, and ${rest} other books`;
}

interface WhosHereCardProps {
  book: string;
  chapter: number;
  translationId: string;
}

export function WhosHereCard({ book, chapter, translationId }: WhosHereCardProps) {
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const { people, isLoading, error } = useChapterPeople(book, chapter);

  const rows = useMemo(
    () => (people ?? []).filter(p => !DEITY_SLUGS.has(p.slug)).sort(compareRows),
    [people]
  );
  const slugs = useMemo(() => rows.map(p => p.slug), [rows]);
  const { spread } = usePeopleSpread(book, chapter, slugs, rows.length > 0);

  const visible = !isLoading && !error && rows.length > 0;
  useEffect(() => {
    if (visible) trackChip('discovery_chip_shown', 'entity', { book, chapter, translationId });
  }, [visible, book, chapter, translationId]);

  if (!visible) return null;

  const shown = showAll ? rows : rows.slice(0, VISIBLE_LIMIT);
  const hidden = rows.length - shown.length;

  const handleToggle = (slug: string) => {
    if (expandedSlug === slug) {
      setExpandedSlug(null);
      return;
    }
    setExpandedSlug(slug);
    trackChip('discovery_chip_tapped', 'entity', { book, chapter, translationId });
  };

  return (
    <DiscoveryCard title="Who's here">
      <ul className="space-y-1">
        {shown.map(person => {
          const personSpread = spread?.find(s => s.slug === person.slug);
          const firstAppears = personSpread ? firstAppearsText(personSpread, book, chapter) : null;
          const books = personSpread ? namedInBooksText(personSpread.books) : null;
          const expanded = expandedSlug === person.slug;
          const detailId = `person-detail-${person.slug}`;
          return (
            <li key={person.slug}>
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={detailId}
                onClick={() => handleToggle(person.slug)}
                className="w-full text-left px-2 py-1.5 rounded hover:bg-scripture-elevated"
              >
                <span className="block text-sm text-scripture-text font-medium">{person.name}</span>
                {firstAppears && <span className="block text-xs text-scripture-muted">{firstAppears}</span>}
                <span className="block text-xs text-scripture-muted">
                  {`Named in ${pluralize(person.verses.length, 'verse')} here`}
                </span>
              </button>
              {expanded && (
                <div id={detailId} className="px-2 pb-2 space-y-1">
                  {books && <p className="text-sm text-scripture-text">{books}</p>}
                  <VerseLinks book={book} chapter={chapter} verses={person.verses} />
                  <MoreInReference slug={person.slug} type="person" />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {hidden > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setShowAll(true)}>{`+${hidden} more`}</Button>
      )}
    </DiscoveryCard>
  );
}
