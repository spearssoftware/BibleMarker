import { useState } from 'react';
import { useGnosisSearch } from '@/hooks/useGnosis';
import { Input } from '@/components/shared';
import { EntityBadge } from './EntityBadge';
import type { GnosisSearchResult } from '@/types';

interface SearchTabProps {
  navigateToDetail: (type: string, slug: string) => void;
}

const ENTITY_TYPE_MAP: Record<string, string> = {
  person: 'person',
  place: 'place',
  event: 'event',
  topic: 'topic',
  group: 'group',
  dictionary: 'dictionary',
};

export function SearchTab({ navigateToDetail }: SearchTabProps) {
  const [query, setQuery] = useState('');

  const { results, total, isLoading, error } = useGnosisSearch<GnosisSearchResult>(
    (p, q, opts) => p.search(q, opts),
    query
  );

  const handleSelect = (result: GnosisSearchResult) => {
    const type = ENTITY_TYPE_MAP[result.entityType] ?? result.entityType;
    navigateToDetail(type, result.slug);
  };

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search all entities..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />

      {!query.trim() && (
        <p className="text-sm text-scripture-muted px-1">Search people, places, events, topics, and more</p>
      )}

      {isLoading && <p className="text-sm text-scripture-muted px-1">Searching...</p>}

      {error && <p className="text-sm text-scripture-error px-1">{error}</p>}

      {query.trim() && !isLoading && results.length === 0 && !error && (
        <p className="text-sm text-scripture-muted px-1">No results found</p>
      )}

      {results.length > 0 && (
        <p className="text-xs text-scripture-muted px-1">{total} results</p>
      )}

      <div className="space-y-1">
        {results.map((result) => (
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
