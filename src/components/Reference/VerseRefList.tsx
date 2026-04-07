import { useState } from 'react';
import { useBibleStore } from '@/stores/bibleStore';

interface VerseRefListProps {
  refs: string[];
  maxVisible?: number;
}

function parseOsis(ref: string): { book: string; chapter: number; verse: number } | null {
  const parts = ref.split('.');
  if (parts.length < 3) return null;
  const chapter = parseInt(parts[1], 10);
  const verse = parseInt(parts[2], 10);
  if (isNaN(chapter) || isNaN(verse)) return null;
  return { book: parts[0], chapter, verse };
}

export function VerseRefList({ refs, maxVisible = 10 }: VerseRefListProps) {
  const [showAll, setShowAll] = useState(false);
  const { setLocation, setNavSelectedVerse } = useBibleStore();

  const visible = showAll ? refs : refs.slice(0, maxVisible);
  const hasMore = refs.length > maxVisible;

  const handleClick = (ref: string) => {
    const parsed = parseOsis(ref);
    if (!parsed) return;
    setLocation(parsed.book, parsed.chapter, true);
    setTimeout(() => {
      setNavSelectedVerse(parsed.verse);
      const el = document.querySelector(`[data-verse="${parsed.verse}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setTimeout(() => setNavSelectedVerse(null), 3000);
    }, 100);
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
