import { useState } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useGnosisEntity } from '@/hooks/useGnosis';
import { Input } from '@/components/shared';
import type { GnosisHebrewWord, GnosisGreekWord, GnosisLexiconEntry, GnosisGreekLexiconEntry, GnosisStrongsEntry } from '@/types';

// OT books use Hebrew, NT books use Greek
const NT_BOOKS = new Set([
  'Matt', 'Mark', 'Luke', 'John', 'Acts', 'Rom', '1Cor', '2Cor', 'Gal', 'Eph',
  'Phil', 'Col', '1Thess', '2Thess', '1Tim', '2Tim', 'Titus', 'Phlm', 'Heb',
  'Jas', '1Pet', '2Pet', '1John', '2John', '3John', 'Jude', 'Rev',
]);

function isNTBook(book: string): boolean {
  return NT_BOOKS.has(book);
}

interface WordDetailProps {
  strongsNumber: string | null;
  isGreek: boolean;
}

function WordDetail({ strongsNumber, isGreek }: WordDetailProps) {
  const { data: strongs } = useGnosisEntity(
    (p) => strongsNumber ? p.getStrongsEntry(strongsNumber) : Promise.resolve(null as GnosisStrongsEntry | null),
    [strongsNumber]
  );

  const { data: lexicon } = useGnosisEntity(
    (p) => {
      if (!strongsNumber) return Promise.resolve(null as GnosisLexiconEntry | GnosisGreekLexiconEntry | null);
      return isGreek ? p.getGreekLexiconEntry(strongsNumber) : p.getLexiconEntry(strongsNumber);
    },
    [strongsNumber, isGreek]
  );

  if (!strongsNumber) return null;

  return (
    <div className="mt-2 p-2 rounded bg-scripture-bg border border-scripture-border/30 text-xs space-y-1">
      {strongs && (
        <>
          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-scripture-accent">{strongs.number}</span>
            {strongs.lemma && <span className="text-base text-scripture-text">{strongs.lemma}</span>}
          </div>
          {strongs.transliteration && (
            <p className="text-scripture-muted italic">{strongs.transliteration}</p>
          )}
          {strongs.definition && (
            <p className="text-scripture-text leading-relaxed">{strongs.definition}</p>
          )}
        </>
      )}
      {lexicon && 'gloss' in lexicon && (lexicon as GnosisLexiconEntry).gloss && (
        <p className="text-scripture-muted">
          <span className="font-medium">Gloss:</span> {(lexicon as GnosisLexiconEntry).gloss}
        </p>
      )}
      {lexicon && 'shortGloss' in lexicon && (lexicon as GnosisGreekLexiconEntry).shortGloss && (
        <p className="text-scripture-muted">
          <span className="font-medium">Gloss:</span> {(lexicon as GnosisGreekLexiconEntry).shortGloss}
        </p>
      )}
    </div>
  );
}

export function OriginalLanguageTab() {
  const { currentBook, currentChapter, navSelectedVerse } = useBibleStore();
  const [verseInput, setVerseInput] = useState('');
  const [expandedWord, setExpandedWord] = useState<string | null>(null);

  const targetVerse = verseInput.trim()
    ? parseInt(verseInput, 10)
    : navSelectedVerse;

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
          {currentBook} {currentChapter} ({isGreek ? 'Greek' : 'Hebrew'}) — enter a verse number or select one in the reader
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
        <p className="text-sm text-scripture-muted">Select or enter a verse to see original language words.</p>
      )}

      {isLoading && <p className="text-sm text-scripture-muted">Loading...</p>}

      {osisRef && !isLoading && (!words || words.length === 0) && (
        <p className="text-sm text-scripture-muted">No {isGreek ? 'Greek' : 'Hebrew'} words found for {osisRef}.</p>
      )}

      {words && words.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-scripture-muted mb-2">
            {words.length} word{words.length !== 1 ? 's' : ''} — tap a word for details
          </p>
          {words.map((word) => {
            const wordId = word.wordId;
            const isExpanded = expandedWord === wordId;
            const text = 'lemmaRaw' in word ? (word as GnosisHebrewWord).text : (word as GnosisGreekWord).text;
            const lemma = 'lemmaRaw' in word ? (word as GnosisHebrewWord).lemmaRaw : (word as GnosisGreekWord).lemma;

            return (
              <div key={wordId}>
                <button
                  onClick={() => toggleWord(wordId)}
                  className={`w-full text-left px-3 py-2 rounded transition-colors ${
                    isExpanded
                      ? 'bg-scripture-accent/10 border border-scripture-accent/30'
                      : 'hover:bg-scripture-elevated'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-lg ${isGreek ? '' : 'font-hebrew'}`} dir={isGreek ? 'ltr' : 'rtl'}>
                      {text}
                    </span>
                    <span className="text-xs text-scripture-muted font-mono">
                      {word.strongsNumber || '—'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-scripture-muted italic">{lemma}</span>
                    {word.morph && (
                      <span className="text-xs text-scripture-muted font-mono">{word.morph}</span>
                    )}
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
