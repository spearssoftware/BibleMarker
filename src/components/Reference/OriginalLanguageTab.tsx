import { useState, useMemo } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useGnosisEntity } from '@/hooks/useGnosis';
import { VersePicker } from './VersePicker';
import type { GnosisLexiconEntry, GnosisGreekLexiconEntry, WordStrongs } from '@/types';

const NT_BOOKS = new Set([
  'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph',
  'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb',
  'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev',
]);

function isNTBook(book: string): boolean {
  return NT_BOOKS.has(book);
}

/** Shows Strong's definition and lexicon gloss for an expanded word */
function WordDetail({ strongsNumber, isGreek }: { strongsNumber: string; isGreek: boolean }) {
  const { data: strongs } = useGnosisEntity(
    (p) => p.getStrongsEntry(strongsNumber),
    [strongsNumber]
  );

  const { data: lexicon } = useGnosisEntity(
    (p): Promise<GnosisLexiconEntry | GnosisGreekLexiconEntry | null> =>
      isGreek ? p.getGreekLexiconEntry(strongsNumber) : p.getLexiconEntry(strongsNumber),
    [strongsNumber, isGreek]
  );

  if (!strongs) return null;

  const gloss = lexicon && 'shortGloss' in lexicon
    ? (lexicon as GnosisGreekLexiconEntry).shortGloss
    : lexicon && 'gloss' in lexicon
      ? (lexicon as GnosisLexiconEntry).gloss
      : null;

  return (
    <div className="mt-1 ml-3 p-2.5 rounded bg-scripture-bg border border-scripture-border/30 text-xs space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-scripture-accent">{strongs.number}</span>
        {strongs.lemma && (
          <span className="text-base" dir={isGreek ? 'ltr' : 'rtl'}>{strongs.lemma}</span>
        )}
        {strongs.transliteration && (
          <span className="text-scripture-muted italic">({strongs.transliteration})</span>
        )}
      </div>
      {gloss && (
        <p className="text-scripture-text font-medium">{gloss}</p>
      )}
      {strongs.definition && (
        <p className="text-scripture-text leading-relaxed">{strongs.definition}</p>
      )}
      {strongs.kjvUsage && (
        <div className="border-t border-scripture-border/30 pt-1.5">
          <span className="font-semibold text-scripture-muted">Translated as: </span>
          <span className="text-scripture-text">{strongs.kjvUsage}</span>
        </div>
      )}
    </div>
  );
}

interface OriginalLanguageTabProps {
  initialVerse?: number;
}

export function OriginalLanguageTab({ initialVerse }: OriginalLanguageTabProps) {
  const { currentBook, currentChapter, navSelectedVerse, chapter } = useBibleStore();
  const [pickedVerse, setPickedVerse] = useState<number | null>(initialVerse ?? null);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const targetVerse = pickedVerse ?? navSelectedVerse;
  const isGreek = currentBook ? isNTBook(currentBook) : false;

  // Get NASB word-level Strong's data from the loaded chapter
  const verseWords: WordStrongs[] | undefined = useMemo(() => {
    if (!chapter || !targetVerse) return undefined;
    const verse = chapter.verses.find((v) => v.ref.verse === targetVerse);
    return verse?.words;
  }, [chapter, targetVerse]);

  const hasStrongsData = verseWords && verseWords.length > 0;

  const toggleWord = (idx: number) => {
    setExpandedIdx((prev) => (prev === idx ? null : idx));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-scripture-muted">
          {currentBook} {currentChapter} — {isGreek ? 'Greek' : 'Hebrew'}
        </p>
        <VersePicker selectedVerse={targetVerse} onSelect={(v) => { setPickedVerse(v); setExpandedIdx(null); }} />
      </div>

      {!targetVerse && (
        <p className="text-sm text-scripture-muted">Tap a verse number to see the interlinear.</p>
      )}

      {targetVerse && !hasStrongsData && (
        <p className="text-sm text-scripture-muted">
          No Strong's data available for this verse. Use a translation with Strong's tagging (e.g. NASB).
        </p>
      )}

      {hasStrongsData && (
        <div className="space-y-0.5">
          {verseWords.map((ws, idx) => {
            const isExpanded = expandedIdx === idx;
            const strongsNum = ws.strongs[0];

            return (
              <div key={idx}>
                <button
                  onClick={() => strongsNum ? toggleWord(idx) : undefined}
                  className={`w-full text-left px-3 py-1.5 rounded transition-colors ${
                    isExpanded
                      ? 'bg-scripture-accent/10 border border-scripture-accent/30'
                      : strongsNum ? 'hover:bg-scripture-elevated' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-scripture-text">{ws.word}</span>
                    {strongsNum && (
                      <span className="text-[10px] text-scripture-muted/60 font-mono">
                        {strongsNum}
                      </span>
                    )}
                  </div>
                </button>
                {isExpanded && strongsNum && (
                  <WordDetail strongsNumber={strongsNum} isGreek={isGreek} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
