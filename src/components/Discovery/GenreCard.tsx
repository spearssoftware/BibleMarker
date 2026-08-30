/**
 * GenreCard — Genre Compass
 *
 * The panel's first card: a one-line orientation to the book's *form* (never
 * its meaning) plus a genre-tuned, answer-free reflective question, so no
 * chapter opens the Discover panel empty. Purely presentational — no
 * checkbox, no interactivity, no store reads.
 */

import { useMemo } from 'react';
import { getBookById } from '@/types';
import { DiscoveryCard } from './DiscoveryCard';
import { genreFor, orientationFor, questionFor, GENRE_LABEL } from '@/lib/chapterAnalysis';

interface GenreCardProps {
  book: string;
  chapter: number;
}

export function GenreCard({ book, chapter }: GenreCardProps) {
  const bookName = useMemo(() => getBookById(book)?.name ?? book, [book]);
  const genre = genreFor(book);

  if (!genre) {
    return (
      <DiscoveryCard title={bookName}>
        <p className="text-sm text-scripture-text">Take a slow look at what&rsquo;s here — every chapter rewards a close read.</p>
      </DiscoveryCard>
    );
  }

  const orientation = orientationFor(book);
  const question = questionFor(book, chapter);

  return (
    <DiscoveryCard title={`${bookName} — ${GENRE_LABEL[genre]}`}>
      {orientation && <p className="text-sm text-scripture-text">{orientation}</p>}
      {question && <p className="text-sm text-scripture-muted italic">{question}</p>}
    </DiscoveryCard>
  );
}
