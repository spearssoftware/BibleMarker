import { useState } from 'react';
import { useGnosisSearch, useGnosisEntity } from '@/hooks/useGnosis';
import { Input } from '@/components/shared';
import { VerseRefList } from './VerseRefList';
import type { GnosisDictionaryEntry } from '@/types';

interface DictionaryTabProps {
  navigateToDetail?: (type: string, slug: string) => void;
}

interface EntryDetailProps {
  slug: string;
  onClose: () => void;
}

function EntryDetail({ slug, onClose }: EntryDetailProps) {
  const { data, isLoading, error } = useGnosisEntity((p) => p.getDictionaryEntry(slug), [slug]);

  if (isLoading) return <p className="text-sm text-scripture-muted py-2">Loading...</p>;
  if (error) return <p className="text-sm text-scripture-error py-2">{error}</p>;
  if (!data) return null;

  return (
    <div className="mt-2 p-3 rounded-lg bg-scripture-surface border border-scripture-border/30 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-scripture-text">{data.name}</h3>
        <button onClick={onClose} className="text-scripture-muted hover:text-scripture-text text-xs">✕</button>
      </div>

      {data.definitions.map((def, i) => (
        <div key={i} className="space-y-1">
          {def.source && (
            <p className="text-xs text-scripture-muted uppercase tracking-wide">{def.source}</p>
          )}
          <p className="text-sm text-scripture-text leading-relaxed">{def.text}</p>
        </div>
      ))}

      {data.scriptureRefs.length > 0 && (
        <div>
          <p className="text-xs text-scripture-muted uppercase tracking-wide mb-1.5">Scripture Refs</p>
          <VerseRefList refs={data.scriptureRefs} />
        </div>
      )}
    </div>
  );
}

export function DictionaryTab(_props: DictionaryTabProps) {
  const [query, setQuery] = useState('');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);

  const { results, isLoading, error } = useGnosisSearch<GnosisDictionaryEntry>(
    (p, q, opts) => p.searchDictionary(q, opts),
    query
  );

  const handleSelect = (slug: string) => {
    setSelectedSlug((prev) => (prev === slug ? null : slug));
  };

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search dictionary..."
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedSlug(null);
        }}
      />

      {!query.trim() && (
        <p className="text-sm text-scripture-muted px-1">Search the Bible dictionary</p>
      )}

      {isLoading && <p className="text-sm text-scripture-muted px-1">Searching...</p>}

      {error && <p className="text-sm text-scripture-error px-1">{error}</p>}

      {query.trim() && !isLoading && results.length === 0 && !error && (
        <p className="text-sm text-scripture-muted px-1">No results found</p>
      )}

      <div className="space-y-1">
        {results.map((entry) => (
          <div key={entry.slug}>
            <button
              onClick={() => handleSelect(entry.slug)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm text-scripture-text ${
                selectedSlug === entry.slug
                  ? 'bg-scripture-border/50'
                  : 'bg-scripture-elevated hover:bg-scripture-border/30'
              }`}
            >
              {entry.name}
            </button>
            {selectedSlug === entry.slug && (
              <EntryDetail slug={entry.slug} onClose={() => setSelectedSlug(null)} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
