/**
 * CrossRefsCard — read two passages together and tap the words they share.
 *
 * Replaces the old "guess the reference" ladder: guessing an address was
 * trivia, and the payoff was a citation rather than the two passages side by
 * side. This shows the source verse and its cross-referenced older passage
 * together and asks what words connect them. Progress (`opened` / found
 * stems / `shownAll`) lives in `discoveryStore.crossRefProgress`, keyed
 * `${book}.${chapter}:${verse}:${targetRef}`, so it survives the panel
 * closing and reopening but resets on chapter change.
 *
 * The shared-word answer must never appear in the DOM as a prompt/answer
 * line before the reader finds it or presses "Show me" — the words are of
 * course visible inside the passage text itself, which is the whole point.
 *
 * The "Read them together" button unmounts once a row opens (unlike
 * RepetitionCard's single stable button), so focus is moved explicitly to
 * the expanded region instead of being dumped to `<body>`.
 */

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/shared';
import { DiscoveryCard } from './DiscoveryCard';
import { useDiscoveryStore, type CrossRefProgress } from '@/stores/discoveryStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useCrossRefPassages, type CrossRefPassageRow } from '@/hooks/useCrossRefPassages';
import { track } from '@/lib/telemetry';
import { pluralize, agree } from '@/lib/textUtils';
import { tokenizeVerse, wordStem } from '@/lib/chapterAnalysis';
import type { ChapterCrossRef } from '@/types';

interface CrossRefsCardProps {
  crossRefs: ChapterCrossRef[];
  book: string;
  chapter: number;
  translationId: string;
}

const EMPTY_PROGRESS: CrossRefProgress = { opened: false, found: [], shownAll: false };

/** Surface form (original casing/punctuation) of the first token in `text` whose stem matches — e.g. "God" not "god". */
function surfaceForm(text: string, stem: string): string {
  for (const token of tokenizeVerse(text)) {
    if (wordStem(token.normalized) === stem) return text.slice(token.startIndex, token.endIndex);
  }
  return stem;
}

/** Joins nodes the way people talk: "a", "a and b", "a, b and c" — no Oxford comma. */
function joinWords(words: ReactNode[]): ReactNode {
  return words.map((word, i) => (
    <span key={i}>
      {i > 0 && (i === words.length - 1 ? ' and ' : ', ')}
      {word}
    </span>
  ));
}

/**
 * Render a passage's words as plain text, with every non-stopword token as
 * an inline tap target. A token whose stem is in `foundStems` renders as
 * already-found; tapping any token reports its stem via `onTap`, whether or
 * not it turns out to be one of the shared ones.
 */
function renderPassageWords(text: string, foundStems: ReadonlySet<string>, onTap: (stem: string) => void): ReactNode {
  const tokens = tokenizeVerse(text);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((token, i) => {
    if (token.startIndex > cursor) nodes.push(text.slice(cursor, token.startIndex));
    const surface = text.slice(token.startIndex, token.endIndex);
    const stem = wordStem(token.normalized);
    if (stem === null) {
      nodes.push(surface);
    } else {
      const isFound = foundStems.has(stem);
      nodes.push(
        <button
          key={i}
          type="button"
          className={`inline bg-transparent border-0 p-0 m-0 hover:text-scripture-accent ${
            isFound ? 'bg-scripture-accent/20 text-scripture-accent rounded' : ''
          }`}
          aria-pressed={isFound ? 'true' : undefined}
          onClick={() => onTap(stem)}
        >
          {surface}
        </button>
      );
    }
    cursor = token.endIndex;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

interface CrossRefRowProps {
  row: CrossRefPassageRow;
  expand: (key: string) => void;
}

function CrossRefRow({ row, expand }: CrossRefRowProps) {
  const progress = useDiscoveryStore(s => s.crossRefProgress[row.key]) ?? EMPTY_PROGRESS;
  const openCrossRef = useDiscoveryStore(s => s.openCrossRef);
  const findCrossRefWord = useDiscoveryStore(s => s.findCrossRefWord);
  const showAllCrossRefWords = useDiscoveryStore(s => s.showAllCrossRefWords);
  const navigateToVerse = useBibleStore(s => s.navigateToVerse);
  const [missMessage, setMissMessage] = useState<string | null>(null);
  const expandedRef = useRef<HTMLDivElement>(null);
  const confirmedRef = useRef(false);

  // Focus the expanded region the moment it appears — the "Read them
  // together" button that triggered it unmounts, so nothing else claims focus.
  // Only on an open that happens during this mount: a row that was already
  // open when the panel reopened must not steal focus.
  const wasOpenOnMount = useRef(progress.opened);
  useEffect(() => {
    if (progress.opened && !wasOpenOnMount.current) expandedRef.current?.focus();
  }, [progress.opened]);

  // `opened` lives in the store and outlives the panel; the fetched passage
  // lives in the hook and doesn't. A row the reader opened earlier comes back
  // `idle` after the panel reopens — reload it (their earlier tap is the
  // consent, and the chapter cache usually makes this free).
  useEffect(() => {
    if (progress.opened && row.status === 'idle') expand(row.key);
  }, [progress.opened, row.status, row.key, expand]);

  const shared = row.shared;
  const foundAllByTapping = shared.length > 0 && shared.every(s => progress.found.includes(s));

  // Fires once per row, only when every shared stem was found by tapping —
  // completing via "Show me" never populates `found`, so this can't fire for that path.
  useEffect(() => {
    if (foundAllByTapping && !confirmedRef.current) {
      confirmedRef.current = true;
      track('discovery_find_confirmed', { feature: 'crossref' });
    }
  }, [foundAllByTapping]);

  const handleOpen = () => {
    const firstOpen = !progress.opened;
    openCrossRef(row.key);
    expand(row.key);
    if (firstOpen) track('discovery_chip_tapped', { feature: 'crossref' });
  };

  const handleTap = (stem: string) => {
    if (progress.shownAll || foundAllByTapping) return;
    if (shared.includes(stem)) {
      setMissMessage(null);
      findCrossRefWord(row.key, stem);
    } else {
      setMissMessage('Not that one — it has to appear in both.');
    }
  };

  const jumpButton = row.jumpTarget ? (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => navigateToVerse(row.jumpTarget!.book, row.jumpTarget!.chapter, row.jumpTarget!.verse, true)}
    >
      {`Go to ${row.label}`}
    </Button>
  ) : null;

  if (!progress.opened) {
    return (
      <div className="space-y-1">
        <p className="text-sm text-scripture-muted">
          {`v.${row.crossRef.verse} — ${row.section ? `something in ${row.section}` : 'an older passage'}`}
        </p>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Read v.${row.crossRef.verse} together with its older passage`}
          onClick={handleOpen}
        >
          Read them together
        </Button>
      </div>
    );
  }

  const hasChallenge = shared.length > 0;
  const canTap = hasChallenge && row.sourceText !== null;
  const isComplete = hasChallenge && (foundAllByTapping || progress.shownAll);
  const foundStems = new Set(progress.shownAll ? shared : progress.found);

  return (
    <div className="space-y-1">
      <div ref={expandedRef} tabIndex={-1} className="space-y-2 outline-none">
        {row.status === 'loading' && <p className="text-sm text-scripture-muted">Loading…</p>}

        {row.status === 'error' && (
          <div className="space-y-2">
            <p className="text-sm text-scripture-muted">{"Couldn't load that passage."}</p>
            {jumpButton}
          </div>
        )}

        {row.status === 'ready' && (
          <div className="space-y-2">
            {!hasChallenge && <p className="text-sm text-scripture-text">What idea connects these?</p>}

            {canTap && !isComplete && (
              <div aria-live="polite" className="space-y-1">
                <p className="text-sm text-scripture-text">
                  {`These share ${pluralize(shared.length, 'word')} — tap ${shared.length === 1 ? 'it' : 'them'}.`}
                </p>
                <p className="text-xs text-scripture-muted">{'Little words like "the" and "in" don\'t count.'}</p>
                {progress.found.length > 0 && (
                  <p className="text-xs text-scripture-muted">{`${progress.found.length} of ${shared.length} found`}</p>
                )}
              </div>
            )}

            <div className="space-y-2">
              <div>
                <p className="text-xs font-ui font-semibold text-scripture-muted">{row.sourceRefLabel}</p>
                <p className="text-sm text-scripture-text">
                  {row.sourceText === null ? null : canTap ? renderPassageWords(row.sourceText, foundStems, handleTap) : row.sourceText}
                </p>
              </div>
              <div>
                <p className="text-xs font-ui font-semibold text-scripture-muted">{row.label}</p>
                {row.targetVerses.map(tv => (
                  <p key={tv.verse} className="text-sm text-scripture-text">
                    {row.targetVerses.length > 1 && <span className="text-xs text-scripture-muted mr-1">{tv.verse}</span>}
                    {canTap ? renderPassageWords(tv.text, foundStems, handleTap) : tv.text}
                  </p>
                ))}
              </div>
            </div>

            <div aria-live="polite">{missMessage && <p className="text-xs text-scripture-error">{missMessage}</p>}</div>

            {canTap && !isComplete && (
              <Button variant="ghost" size="sm" onClick={() => showAllCrossRefWords(row.key)}>
                Show me
              </Button>
            )}

            {(isComplete || !hasChallenge) && (
              <div className="space-y-2">
                {isComplete && (
                  <p className="text-sm text-scripture-text">
                    Both say {joinWords(shared.map(s => <strong key={s}>{surfaceForm(row.sourceText ?? '', s)}</strong>))}.
                  </p>
                )}
                {jumpButton}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function CrossRefsCard({ crossRefs, book, chapter, translationId }: CrossRefsCardProps) {
  const { rows, expand } = useCrossRefPassages(crossRefs, book, chapter, translationId);
  if (rows.length === 0) return null;

  const title = `${pluralize(rows.length, 'verse')} here ${agree(rows.length, 'connects', 'connect')} to older Scripture`;

  return (
    <DiscoveryCard title={title}>
      <p className="text-sm text-scripture-text">Read them together — what do they share?</p>
      <div className="space-y-2">
        {rows.map(row => (
          <CrossRefRow key={row.key} row={row} expand={expand} />
        ))}
      </div>
    </DiscoveryCard>
  );
}
