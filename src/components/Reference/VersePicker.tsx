import { useEffect, useRef } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { getVerseCount } from '@/types';

interface VersePickerProps {
  selectedVerse: number | null;
  onSelect: (verse: number) => void;
}

export function VersePicker({ selectedVerse, onSelect }: VersePickerProps) {
  const { currentBook, currentChapter, highlightVerse } = useBibleStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef<HTMLButtonElement>(null);

  const count = currentBook && currentChapter
    ? getVerseCount(currentBook, currentChapter)
    : 0;

  // Scroll selected verse into view
  useEffect(() => {
    if (selectedRef.current && scrollRef.current) {
      selectedRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [selectedVerse]);

  if (!count) return null;

  return (
    <div
      ref={scrollRef}
      className="flex gap-1 overflow-x-auto pb-1 custom-scrollbar"
    >
      {Array.from({ length: count }, (_, i) => {
        const v = i + 1;
        const isSelected = selectedVerse === v;
        return (
          <button
            key={v}
            ref={isSelected ? selectedRef : undefined}
            onClick={() => {
              onSelect(v);
              highlightVerse(v);
            }}
            className={`flex-shrink-0 w-8 h-8 rounded-full text-xs font-ui font-medium transition-all
              ${isSelected
                ? 'bg-scripture-accent text-scripture-bg shadow-sm'
                : 'bg-scripture-elevated text-scripture-muted hover:bg-scripture-border/50 hover:text-scripture-text'
              }`}
          >
            {v}
          </button>
        );
      })}
    </div>
  );
}
