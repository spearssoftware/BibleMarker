/**
 * GenreCard — Genre Compass
 *
 * The panel's first card: a one-line orientation to the book's *form* (never
 * its meaning) plus a genre-tuned, answer-free reflective question, so no
 * chapter opens the Discover panel empty. Purely presentational — no
 * checkbox, no interactivity, no store reads.
 */

import { getBookById } from '@/types';
import { DiscoveryCard } from './DiscoveryCard';
import { genreFor, orientationFor, questionFor, type Genre } from '@/lib/chapterAnalysis';

/** Short "book name — label" tag for the card title, e.g. "Hebrews — a letter". */
const GENRE_LABEL: Record<Genre, string> = {
  law: 'a book of law',
  narrative: 'a story',
  poetry: 'a poem',
  wisdom: 'wisdom literature',
  prophecy: 'a prophecy',
  gospel: 'a gospel',
  acts: 'a travel narrative',
  epistle: 'a letter',
  apocalyptic: 'an apocalypse',
};

interface GenreCardProps {
  book: string;
  chapter: number;
}

export function GenreCard({ book, chapter }: GenreCardProps) {
  const bookName = getBookById(book)?.name ?? book;
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
