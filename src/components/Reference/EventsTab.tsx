import { useState } from 'react';
import { useGnosisSearch } from '@/hooks/useGnosis';
import { Input } from '@/components/shared';
import type { GnosisEvent } from '@/types';

interface EventsTabProps {
  navigateToDetail: (type: string, slug: string) => void;
}

export function EventsTab({ navigateToDetail }: EventsTabProps) {
  const [query, setQuery] = useState('');
  const { results, isLoading, error } = useGnosisSearch<GnosisEvent>(
    (p, q, opts) => p.searchEvents(q, opts),
    query
  );

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search for events in the Bible..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {!query.trim() && (
        <p className="text-sm text-scripture-muted px-1">Search for events in the Bible</p>
      )}

      {isLoading && <p className="text-sm text-scripture-muted px-1">Searching...</p>}

      {error && <p className="text-sm text-scripture-error px-1">{error}</p>}

      {query.trim() && !isLoading && results.length === 0 && !error && (
        <p className="text-sm text-scripture-muted px-1">No results found</p>
      )}

      <div className="space-y-1">
        {results.map((event) => (
          <button
            key={event.slug}
            onClick={() => navigateToDetail('event', event.slug)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-scripture-elevated hover:bg-scripture-border/30 transition-colors text-left"
          >
            <span className="text-sm text-scripture-text">{event.title}</span>
            <div className="flex items-center gap-2 shrink-0">
              {event.startYearDisplay && (
                <span className="text-xs text-scripture-muted">{event.startYearDisplay}</span>
              )}
              {event.participants.length > 0 && (
                <span className="text-xs text-scripture-muted">{event.participants.length} people</span>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
