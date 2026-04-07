import { useState } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useGnosisEntity } from '@/hooks/useGnosis';
import { VersePicker } from './VersePicker';
import type { GnosisHebrewWord, GnosisGreekWord, GnosisLexiconEntry, GnosisGreekLexiconEntry } from '@/types';

const NT_BOOKS = new Set([
  'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph',
  'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb',
  'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev',
]);

function isNTBook(book: string): boolean {
  return NT_BOOKS.has(book);
}

/** Fetches and displays the English gloss for a single word inline */
function WordGloss({ strongsNumber, isGreek }: { strongsNumber: string; isGreek: boolean }) {
  const { data: strongs } = useGnosisEntity(
    (p) => p.getStrongsEntry(strongsNumber),
    [strongsNumber]
  );

  const { data: lexicon } = useGnosisEntity(
    (p): Promise<GnosisLexiconEntry | GnosisGreekLexiconEntry | null> =>
      isGreek ? p.getGreekLexiconEntry(strongsNumber) : p.getLexiconEntry(strongsNumber),
    [strongsNumber, isGreek]
  );

  // Prefer short gloss from lexicon, fall back to Strong's definition
  const gloss = lexicon && 'shortGloss' in lexicon
    ? (lexicon as GnosisGreekLexiconEntry).shortGloss
    : lexicon && 'gloss' in lexicon
      ? (lexicon as GnosisLexiconEntry).gloss
      : null;

  const transliteration = strongs?.transliteration;

  return (
    <span className="text-sm font-medium text-scripture-text">
      {gloss || strongs?.definition?.split(';')[0]?.split(',')[0]?.trim() || '…'}
      {transliteration && (
        <span className="text-scripture-muted font-normal italic ml-1.5">({transliteration})</span>
      )}
    </span>
  );
}

/** Expanded detail for a word — full definition, usage */
function WordDetail({ strongsNumber, isGreek }: { strongsNumber: string; isGreek: boolean }) {
  const { data: strongs } = useGnosisEntity(
    (p) => p.getStrongsEntry(strongsNumber),
    [strongsNumber]
  );

  if (!strongs) return null;

  return (
    <div className="mt-1 ml-3 p-2.5 rounded bg-scripture-bg border border-scripture-border/30 text-xs space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-scripture-accent">{strongs.number}</span>
        {strongs.lemma && (
          <span className="text-base" dir={isGreek ? 'ltr' : 'rtl'}>{strongs.lemma}</span>
        )}
      </div>
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

export function OriginalLanguageTab() {
  const { currentBook, currentChapter, navSelectedVerse } = useBibleStore();
  const [pickedVerse, setPickedVerse] = useState<number | null>(null);
  const [expandedWord, setExpandedWord] = useState<string | null>(null);

  const targetVerse = pickedVerse ?? navSelectedVerse;

  const osisRef = targetVerse && currentBook && currentChapter
    ? `${currentBook}.${currentChapter}.${targetVerse}`
    : null;

  const isGreek = currentBook ? isNTBook(currentBook) : false;

  const { data: hebrewWords, isLoading: loadingHeb } = useGnosisEntity(
    (p) => osisRef && !isGreek ? p.getHebrewWords(osisRef) : Promise.resolve([] as GnosisHebrewWord[]),
    [osisRef, isGreek]
  );

  const { data: greekWords, isLoading: loadingGrk } = useGnosisEntity(
    (p) => osisRef && isGreek ? p.getGreekWords(osisRef) : Promise.resolve([] as GnosisGreekWord[]),
    [osisRef, isGreek]
  );

  const words = isGreek ? greekWords : hebrewWords;
  const isLoading = isGreek ? loadingGrk : loadingHeb;

  const toggleWord = (wordId: string) => {
    setExpandedWord((prev) => (prev === wordId ? null : wordId));
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <p className="text-xs text-scripture-muted">
          {currentBook} {currentChapter} — {isGreek ? 'Greek' : 'Hebrew'}
        </p>
        <VersePicker selectedVerse={targetVerse} onSelect={setPickedVerse} />
      </div>

      {!osisRef && (
        <p className="text-sm text-scripture-muted">Tap a verse number to see the interlinear.</p>
      )}

      {isLoading && <p className="text-sm text-scripture-muted">Loading...</p>}

      {osisRef && !isLoading && (!words || words.length === 0) && (
        <p className="text-sm text-scripture-muted">No {isGreek ? 'Greek' : 'Hebrew'} words found.</p>
      )}

      {words && words.length > 0 && (
        <div className="space-y-0.5">
          {words.map((word) => {
            const wordId = word.wordId;
            const isExpanded = expandedWord === wordId;
            const originalText = 'lemmaRaw' in word ? (word as GnosisHebrewWord).text : (word as GnosisGreekWord).text;

            return (
              <div key={wordId}>
                <button
                  onClick={() => word.strongsNumber ? toggleWord(wordId) : undefined}
                  className={`w-full text-left px-3 py-1.5 rounded transition-colors ${
                    isExpanded
                      ? 'bg-scripture-accent/10 border border-scripture-accent/30'
                      : 'hover:bg-scripture-elevated'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {word.strongsNumber ? (
                        <WordGloss strongsNumber={word.strongsNumber} isGreek={isGreek} />
                      ) : (
                        <span className="text-sm text-scripture-muted">{originalText}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-scripture-muted" dir={isGreek ? 'ltr' : 'rtl'}>
                        {originalText}
                      </span>
                      {word.strongsNumber && (
                        <span className="text-[10px] text-scripture-muted/60 font-mono w-12 text-right">
                          {word.strongsNumber}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                {isExpanded && word.strongsNumber && (
                  <WordDetail strongsNumber={word.strongsNumber} isGreek={isGreek} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
