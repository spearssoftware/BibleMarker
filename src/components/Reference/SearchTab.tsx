import { useState, useMemo } from 'react';
import { useGnosisSearch, useGnosisEntity } from '@/hooks/useGnosis';
import { Input } from '@/components/shared';
import { EntityBadge } from './EntityBadge';
import { VerseRefList } from './VerseRefList';
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
};

/** Inline dictionary definition expand */
function DictionaryDetail({ slug }: { slug: string }) {
  const { data, isLoading, error } = useGnosisEntity((p) => p.getDictionaryEntry(slug), [slug]);

  if (isLoading) return <p className="text-sm text-scripture-muted py-2 px-3">Loading...</p>;
  if (error) return <p className="text-sm text-scripture-error py-2 px-3">{error}</p>;
  if (!data) return null;

  return (
    <div className="mx-1 mb-1 p-3 rounded-lg bg-scripture-surface border border-scripture-border/30 space-y-2">
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

export function SearchTab({ navigateToDetail, initialQuery }: SearchTabProps) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const [activeFilter, setActiveFilter] = useState<EntityFilter>('all');
  const [expandedDictSlug, setExpandedDictSlug] = useState<string | null>(null);

  const { results, total, isLoading, error } = useGnosisSearch<GnosisSearchResult>(
    (p, q, opts) => p.search(q, opts),
    query
  );

  const filtered = useMemo(() => {
    if (activeFilter === 'all') return results;
    return results.filter((r) => r.entityType === activeFilter);
  }, [results, activeFilter]);

  const handleSelect = (result: GnosisSearchResult) => {
    if (result.entityType === 'dictionary') {
      setExpandedDictSlug((prev) => (prev === result.slug ? null : result.slug));
      return;
    }
    const type = ENTITY_TYPE_MAP[result.entityType] ?? result.entityType;
    navigateToDetail(type, result.slug);
  };

  return (
    <div className="space-y-3">
      <Input
        placeholder="Search people, places, events, topics..."
        value={query}
        onChange={(e) => { setQuery(e.target.value); setExpandedDictSlug(null); }}
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
        <div className="text-sm text-scripture-muted px-1 space-y-2">
          <p>
            {activeFilter !== 'all' && results.length > 0
              ? `No ${FILTERS.find((f) => f.id === activeFilter)?.label.toLowerCase()} results — ${results.length} in other categories`
              : 'No matching people, places, events, topics, or dictionary entries.'}
          </p>
          <p className="text-xs">Try the Hebrew/Greek tab for word-level analysis, or try a root word (e.g. "confession" instead of "confessed").</p>
        </div>
      )}

      {filtered.length > 0 && (
        <p className="text-xs text-scripture-muted px-1">
          {activeFilter === 'all' ? total : filtered.length} result{filtered.length !== 1 ? 's' : ''}
        </p>
      )}

      <div className="space-y-1">
        {filtered.map((result) => (
          <div key={result.uuid}>
            <button
              onClick={() => handleSelect(result)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-left ${
                expandedDictSlug === result.slug
                  ? 'bg-scripture-border/50'
                  : 'bg-scripture-elevated hover:bg-scripture-border/30'
              }`}
            >
              <EntityBadge type={result.entityType} />
              <span className="text-sm text-scripture-text">{result.name}</span>
            </button>
            {expandedDictSlug === result.slug && (
              <DictionaryDetail slug={result.slug} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
