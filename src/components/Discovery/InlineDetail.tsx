/**
 * Small building blocks shared by the inline person and event detail rows.
 */

import { Button } from '@/components/shared';
import { useBibleStore } from '@/stores/bibleStore';
import { usePanelStore, type ReferenceEntityType } from '@/stores/panelStore';

interface VerseLinksProps {
  book: string;
  chapter: number;
  verses: number[];
}

/** "Verses 6, 8" with each number tapping through to that verse. */
export function VerseLinks({ book, chapter, verses }: VerseLinksProps) {
  const navigateToVerse = useBibleStore(s => s.navigateToVerse);
  if (verses.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-1 text-sm text-scripture-muted">
      <span>{verses.length === 1 ? 'Verse' : 'Verses'}</span>
      {verses.map((verse, i) => (
        <span key={verse}>
          <button
            type="button"
            onClick={() => navigateToVerse(book, chapter, verse, true)}
            className="text-scripture-accent hover:text-scripture-accent/70"
          >
            {verse}
          </button>
          {i < verses.length - 1 && ','}
        </span>
      ))}
    </div>
  );
}

interface MoreInReferenceProps {
  slug: string;
  type: Extract<ReferenceEntityType, 'person' | 'event'>;
}

export function MoreInReference({ slug, type }: MoreInReferenceProps) {
  const openPanel = usePanelStore(s => s.openPanel);
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => openPanel('reference', { referenceEntitySlug: slug, referenceEntityType: type })}
    >
      More in Reference
    </Button>
  );
}
