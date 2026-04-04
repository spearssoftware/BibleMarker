import { useState } from 'react';
import { useGnosisSearch } from '@/hooks/useGnosis';
import { Input } from '@/components/shared';
import type { GnosisTopic } from '@/types';

interface TopicsTabProps {
  navigateToDetail: (type: string, slug: string) => void;
}

export function TopicsTab({ navigateToDetail }: TopicsTabProps) {
  const [query, setQuery] = useState('');
  const { results, isLoading, error } = useGnosisSearch<GnosisTopic>(
    (p, q, opts) => p.searchTopics(q, opts),
    query
  );

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search for topics in the Bible..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {!query.trim() && (
        <p className="text-sm text-scripture-muted px-1">Search for topics in the Bible</p>
      )}

      {isLoading && <p className="text-sm text-scripture-muted px-1">Searching...</p>}

      {error && <p className="text-sm text-scripture-error px-1">{error}</p>}

      {query.trim() && !isLoading && results.length === 0 && !error && (
        <p className="text-sm text-scripture-muted px-1">No results found</p>
      )}

      <div className="space-y-1">
        {results.map((topic) => (
          <button
            key={topic.slug}
            onClick={() => navigateToDetail('topic', topic.slug)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-scripture-elevated hover:bg-scripture-border/30 transition-colors text-left"
          >
            <span className="text-sm text-scripture-text">{topic.name}</span>
            {topic.aspects.length > 0 && (
              <span className="text-xs text-scripture-muted">{topic.aspects.length} aspects</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
