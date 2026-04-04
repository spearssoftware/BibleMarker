import { useState } from 'react';
import { useGnosisSearch } from '@/hooks/useGnosis';
import { Input } from '@/components/shared';
import type { GnosisPlace } from '@/types';

interface PlacesTabProps {
  navigateToDetail: (type: string, slug: string) => void;
}

export function PlacesTab({ navigateToDetail }: PlacesTabProps) {
  const [query, setQuery] = useState('');
  const { results, isLoading, error } = useGnosisSearch<GnosisPlace>(
    (p, q, opts) => p.searchPlaces(q, opts),
    query
  );

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search for places in the Bible..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {!query.trim() && (
        <p className="text-sm text-scripture-muted px-1">Search for places in the Bible</p>
      )}

      {isLoading && <p className="text-sm text-scripture-muted px-1">Searching...</p>}

      {error && <p className="text-sm text-scripture-error px-1">{error}</p>}

      {query.trim() && !isLoading && results.length === 0 && !error && (
        <p className="text-sm text-scripture-muted px-1">No results found</p>
      )}

      <div className="space-y-1">
        {results.map((place) => (
          <button
            key={place.slug}
            onClick={() => navigateToDetail('place', place.slug)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-scripture-elevated hover:bg-scripture-border/30 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              {place.latitude !== null && place.longitude !== null && (
                <span className="text-xs" aria-hidden="true">📍</span>
              )}
              <span className="text-sm text-scripture-text">{place.name}</span>
            </div>
            {place.featureType && (
              <span className="text-xs text-scripture-muted capitalize">{place.featureType}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
