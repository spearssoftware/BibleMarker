import { useState } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { parseOsisRef } from '@/types';

interface VerseRefListProps {
  refs: string[];
  maxVisible?: number;
}

export function VerseRefList({ refs, maxVisible = 10 }: VerseRefListProps) {
  const [showAll, setShowAll] = useState(false);
  const { navigateToVerse } = useBibleStore();

  const visible = showAll ? refs : refs.slice(0, maxVisible);
  const hasMore = refs.length > maxVisible;

  const handleClick = (ref: string) => {
    const parsed = parseOsisRef(ref);
    if (!parsed || !parsed.verse) return;
    navigateToVerse(parsed.book, parsed.chapter, parsed.verse, true);
  };

  if (refs.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {visible.map((ref) => (
        <button
          key={ref}
          onClick={() => handleClick(ref)}
          className="px-2 py-0.5 text-xs rounded bg-scripture-elevated text-scripture-accent hover:bg-scripture-border/50 transition-colors font-mono"
        >
          {ref}
        </button>
      ))}
      {hasMore && !showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="px-2 py-0.5 text-xs rounded bg-scripture-elevated text-scripture-muted hover:bg-scripture-border/50 transition-colors"
        >
          Show all {refs.length}
        </button>
      )}
    </div>
  );
}
