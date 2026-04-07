import { useState, useMemo } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useGnosisEntity } from '@/hooks/useGnosis';
import { Input } from '@/components/shared';
import { VerseRefList } from './VerseRefList';
import type { GnosisCrossReference } from '@/types';

export function CrossRefsTab() {
  const { currentBook, currentChapter, navSelectedVerse } = useBibleStore();
  const [verseInput, setVerseInput] = useState('');

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

  const crossRefs = useMemo(() => data?.data ?? [], [data]);

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

      {osisRef && !isLoading && crossRefs.length === 0 && !error && (
        <p className="text-sm text-scripture-muted">No cross-references found for {osisRef}.</p>
      )}

      {crossRefs.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs text-scripture-muted">{crossRefs.length} cross-reference{crossRefs.length !== 1 ? 's' : ''} for {osisRef}</p>
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
