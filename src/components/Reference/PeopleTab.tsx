import { useState } from 'react';
import { useGnosisSearch } from '@/hooks/useGnosis';
import { Input } from '@/components/shared';
import type { GnosisPerson } from '@/types';

interface PeopleTabProps {
  navigateToDetail: (type: string, slug: string) => void;
}

export function PeopleTab({ navigateToDetail }: PeopleTabProps) {
  const [query, setQuery] = useState('');
  const { results, isLoading, error } = useGnosisSearch<GnosisPerson>(
    (p, q, opts) => p.searchPeople(q, opts),
    query
  );

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search for people in the Bible..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {!query.trim() && (
        <p className="text-sm text-scripture-muted px-1">Search for people in the Bible</p>
      )}

      {isLoading && <p className="text-sm text-scripture-muted px-1">Searching...</p>}

      {error && <p className="text-sm text-scripture-error px-1">{error}</p>}

      {query.trim() && !isLoading && results.length === 0 && !error && (
        <p className="text-sm text-scripture-muted px-1">No results found</p>
      )}

      <div className="space-y-1">
        {results.map((person) => (
          <button
            key={person.slug}
            onClick={() => navigateToDetail('person', person.slug)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-scripture-elevated hover:bg-scripture-border/30 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-scripture-text">{person.name}</span>
              {person.gender && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-scripture-border/50 text-scripture-muted capitalize">
                  {person.gender}
                </span>
              )}
            </div>
            <span className="text-xs text-scripture-muted">{person.verseCount} verses</span>
          </button>
        ))}
      </div>
    </div>
  );
}
