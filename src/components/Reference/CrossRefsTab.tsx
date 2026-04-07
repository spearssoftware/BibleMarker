import { useState, useMemo } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useGnosisEntity } from '@/hooks/useGnosis';
import { Input } from '@/components/shared';
import { VerseRefList } from './VerseRefList';
import type { GnosisCrossReference } from '@/types';

const TOP_REFS_LIMIT = 12;

export function CrossRefsTab() {
  const { currentBook, currentChapter, navSelectedVerse } = useBibleStore();
  const [verseInput, setVerseInput] = useState('');
  const [showAll, setShowAll] = useState(false);

  const targetVerse = verseInput.trim()
    ? parseInt(verseInput, 10)
    : navSelectedVerse;

  const osisRef = targetVerse && currentBook && currentChapter
    ? `${currentBook}.${currentChapter}.${targetVerse}`
    : null;

  const { data, isLoading, error } = useGnosisEntity(
    (p) => osisRef ? p.getCrossReferences(osisRef) : Promise.resolve({ data: [], meta: { total: 0, limit: 0, offset: 0 } }),
    [osisRef]
  );

  const allRefs = useMemo(() => data?.data ?? [], [data]);

  // "Top" mode: only show refs with votes > 0, capped at TOP_REFS_LIMIT
  const crossRefs = useMemo(() => {
    if (showAll) return allRefs;
    const highQuality = allRefs.filter((r) => r.votes > 0);
    return highQuality.length > 0
      ? highQuality.slice(0, TOP_REFS_LIMIT)
      : allRefs.slice(0, TOP_REFS_LIMIT);
  }, [allRefs, showAll]);

  const grouped = useMemo(() => {
    const groups = new Map<string, GnosisCrossReference[]>();
    for (const ref of crossRefs) {
      const book = ref.toVerseStart.split('.')[0];
      if (!groups.has(book)) groups.set(book, []);
      groups.get(book)!.push(ref);
    }
    return groups;
  }, [crossRefs]);

  const formatRef = (ref: GnosisCrossReference) => {
    if (ref.toVerseEnd && ref.toVerseEnd !== ref.toVerseStart) {
      return `${ref.toVerseStart}–${ref.toVerseEnd.split('.').slice(1).join('.')}`;
    }
    return ref.toVerseStart;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-scripture-muted">
          {currentBook} {currentChapter} — enter a verse number or select one in the reader
        </p>
        <Input
          placeholder="Verse number..."
          value={verseInput}
          onChange={(e) => setVerseInput(e.target.value)}
          type="number"
          min={1}
        />
      </div>

      {!osisRef && (
        <p className="text-sm text-scripture-muted">Select or enter a verse to see cross-references.</p>
      )}

      {isLoading && <p className="text-sm text-scripture-muted">Loading...</p>}

      {error && <p className="text-sm text-scripture-error">{error}</p>}

      {osisRef && !isLoading && allRefs.length === 0 && !error && (
        <p className="text-sm text-scripture-muted">No cross-references found for {osisRef}.</p>
      )}

      {allRefs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-scripture-muted">
              {showAll ? allRefs.length : crossRefs.length} cross-ref{crossRefs.length !== 1 ? 's' : ''}
              {!showAll && allRefs.length > crossRefs.length && (
                <span className="text-scripture-muted/60"> of {allRefs.length}</span>
              )}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setShowAll(false)}
                className={`px-2 py-0.5 rounded text-xs font-ui font-medium transition-all ${
                  !showAll
                    ? 'bg-scripture-accent text-scripture-bg'
                    : 'bg-scripture-elevated text-scripture-muted hover:text-scripture-text'
                }`}
              >
                Top
              </button>
              <button
                onClick={() => setShowAll(true)}
                className={`px-2 py-0.5 rounded text-xs font-ui font-medium transition-all ${
                  showAll
                    ? 'bg-scripture-accent text-scripture-bg'
                    : 'bg-scripture-elevated text-scripture-muted hover:text-scripture-text'
                }`}
              >
                All
              </button>
            </div>
          </div>
          {Array.from(grouped.entries()).map(([book, refs]) => (
            <div key={book}>
              <h4 className="text-xs font-medium text-scripture-muted uppercase tracking-wide mb-1">{book}</h4>
              <VerseRefList refs={refs.map(formatRef)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
