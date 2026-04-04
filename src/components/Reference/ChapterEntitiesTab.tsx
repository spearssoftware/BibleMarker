import { useState } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useChapterEntities } from '@/hooks/useGnosis';

interface ChapterEntitiesTabProps {
  navigateToDetail: (type: string, slug: string) => void;
}

interface SectionProps {
  title: string;
  items: string[];
  type: string;
  onSelect: (type: string, slug: string) => void;
}

function Section({ title, items, type, onSelect }: SectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border border-scripture-border/30 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-scripture-elevated hover:bg-scripture-border/30 transition-colors text-left"
      >
        <span className="text-sm font-medium text-scripture-text">{title}</span>
        <span className="flex items-center gap-2">
          <span className="text-xs px-1.5 py-0.5 rounded bg-scripture-border/50 text-scripture-muted">
            {items.length}
          </span>
          <span className="text-scripture-muted text-xs">{open ? '▲' : '▼'}</span>
        </span>
      </button>
      {open && (
        <div className="p-2 space-y-1">
          {items.length === 0 ? (
            <p className="text-xs text-scripture-muted px-1 py-1">None found</p>
          ) : (
            items.map((slug) => (
              <button
                key={slug}
                onClick={() => onSelect(type, slug)}
                className="w-full text-left px-2 py-1 rounded text-sm text-scripture-text hover:bg-scripture-elevated transition-colors"
              >
                {slug}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function ChapterEntitiesTab({ navigateToDetail }: ChapterEntitiesTabProps) {
  const { currentBook, currentChapter } = useBibleStore();
  const { entities, isLoading, error } = useChapterEntities(currentBook, currentChapter);

  if (isLoading) {
    return <div className="p-4 text-scripture-muted text-sm">Loading...</div>;
  }

  if (error) {
    return <div className="p-4 text-scripture-error text-sm">{error}</div>;
  }

  if (!entities) {
    return <div className="p-4 text-scripture-muted text-sm">No entities found</div>;
  }

  const total = entities.people.length + entities.places.length + entities.events.length + entities.topics.length;

  if (total === 0) {
    return <div className="p-4 text-scripture-muted text-sm">No entities found for this chapter</div>;
  }

  return (
    <div className="space-y-2">
      <Section title="People" items={entities.people} type="person" onSelect={navigateToDetail} />
      <Section title="Places" items={entities.places} type="place" onSelect={navigateToDetail} />
      <Section title="Events" items={entities.events} type="event" onSelect={navigateToDetail} />
      <Section title="Topics" items={entities.topics} type="topic" onSelect={navigateToDetail} />
    </div>
  );
}
