import { useState, useMemo } from 'react';
import { useGnosisSearch } from '@/hooks/useGnosis';
import { Input } from '@/components/shared';
import { EntityBadge } from './EntityBadge';
import type { GnosisSearchResult } from '@/types';

interface SearchTabProps {
  navigateToDetail: (type: string, slug: string) => void;
  initialQuery?: string;
}

type EntityFilter = 'all' | 'person' | 'place' | 'event' | 'topic' | 'dictionary';

const FILTERS: { id: EntityFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'person', label: 'People' },
  { id: 'place', label: 'Places' },
  { id: 'event', label: 'Events' },
  { id: 'topic', label: 'Topics' },
  { id: 'dictionary', label: 'Dictionary' },
];

const ENTITY_TYPE_MAP: Record<string, string> = {
  person: 'person',
  place: 'place',
  event: 'event',
  topic: 'topic',
  group: 'group',
  dictionary: 'dictionary',
};

export function SearchTab({ navigateToDetail, initialQuery }: SearchTabProps) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [activeFilter, setActiveFilter] = useState<EntityFilter>('all');

  const { results, total, isLoading, error } = useGnosisSearch<GnosisSearchResult>(
    (p, q, opts) => p.search(q, opts),
    query
  );

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return results;
    return results.filter((r) => r.entityType === activeFilter);
  }, [results, activeFilter]);

  const handleSelect = (result: GnosisSearchResult) => {
    const type = ENTITY_TYPE_MAP[result.entityType] ?? result.entityType;
    navigateToDetail(type, result.slug);
  };

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search people, places, events, topics..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {/* Filter chips */}
      <div className="flex gap-1.5 flex-wrap">
        {FILTERS.map((filter) => {
          const count = filter.id === 'all'
            ? results.length
            : results.filter((r) => r.entityType === filter.id).length;
          const isActive = activeFilter === filter.id;

          return (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`px-2.5 py-1 rounded-full text-xs font-ui font-medium transition-all
                ${isActive
                  ? 'bg-scripture-accent text-scripture-bg'
                  : 'bg-scripture-elevated text-scripture-muted hover:bg-scripture-border/50 hover:text-scripture-text'
                }`}
            >
              {filter.label}
              {query.trim() && count > 0 && (
                <span className={`ml-1 ${isActive ? 'opacity-80' : 'opacity-60'}`}>{count}</span>
              )}
            </button>
          );
        })}
      </div>

      {!query.trim() && (
        <p className="text-sm text-scripture-muted px-1">Search the Bible reference library</p>
      )}

      {isLoading && <p className="text-sm text-scripture-muted px-1">Searching...</p>}

      {error && <p className="text-sm text-scripture-error px-1">{error}</p>}

      {query.trim() && !isLoading && filtered.length === 0 && !error && (
        <p className="text-sm text-scripture-muted px-1">
          {activeFilter !== 'all' && results.length > 0
            ? `No ${FILTERS.find((f) => f.id === activeFilter)?.label.toLowerCase()} results — ${results.length} in other categories`
            : 'No results found'}
        </p>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-scripture-muted px-1">
          {activeFilter === 'all' ? total : filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      <div className="space-y-1">
        {filtered.map((result) => (
          <button
            key={result.uuid}
            onClick={() => handleSelect(result)}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-scripture-elevated hover:bg-scripture-border/30 transition-colors text-left"
          >
            <EntityBadge type={result.entityType} />
            <span className="text-sm text-scripture-text">{result.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
