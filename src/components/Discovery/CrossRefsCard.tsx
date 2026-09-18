/**
 * CrossRefsCard — read a verse together with the older passage it draws on.
 *
 * Mirrors ConnectorsCard: a toggle lights the connecting verses in the text
 * (the cross-reference lens), and a list of rows, one per verse. Tapping a
 * row jumps the reader there and expands both passages with the words they
 * share already lit; tapping a lit verse in the text sets the same
 * `activeCrossRefKey` and opens this panel, so the effect below scrolls the
 * matching row into view. The scroll is delayed to survive
 * MultiTranslationView's layout re-key after the panel opens.
 *
 * The rows themselves come from `useDiscoveryHost` via the store (so the
 * lens works while the panel is closed). On a network translation nothing is
 * fetched until a row is expanded — that tap is the reader's consent.
 *
 * The shared-word hunt is opt-in: "Find them yourself" hides the highlights
 * and turns every word into a tap target until the reader finds them all or
 * presses "Show me". Progress lives in `discoveryStore.crossRefProgress`.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button, ToggleSwitch } from '@/components/shared';
import { DiscoveryCard } from './DiscoveryCard';
import { useDiscoveryStore, type CrossRefProgress } from '@/stores/discoveryStore';
import { useBibleStore } from '@/stores/bibleStore';
import { LAYOUT_REKEY_MS } from '@/components/BibleReader/layoutConstants';
import type { CrossRefPassageRow } from '@/hooks/useCrossRefPassages';
import { track } from '@/lib/telemetry';
import { pluralize, agree } from '@/lib/textUtils';
import { tokenizeVerse, wordStem } from '@/lib/chapterAnalysis';

interface CrossRefsCardProps {
  rows: CrossRefPassageRow[];
  expand: (key: string) => void;
  book: string;
  chapter: number;
}

const EMPTY_PROGRESS: CrossRefProgress = { hunting: false, found: [] };
const LIT_WORD_CLASSES = 'bg-scripture-accent/20 text-scripture-accent rounded';

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
 * Render a passage's words with every token whose stem is in `litStems`
 * highlighted. With `onTap`, every non-stopword token becomes a tap target
 * that reports its stem (the hunt); without it, lit words are plain marks.
 */
function renderPassageWords(text: string, litStems: ReadonlySet<string>, onTap?: (stem: string) => void): ReactNode {
  const tokens = tokenizeVerse(text);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((token, i) => {
    if (token.startIndex > cursor) nodes.push(text.slice(cursor, token.startIndex));
    const surface = text.slice(token.startIndex, token.endIndex);
    const stem = wordStem(token.normalized);
    const isLit = stem !== null && litStems.has(stem);
    if (stem === null || (!onTap && !isLit)) {
      nodes.push(surface);
    } else if (!onTap) {
      nodes.push(
        <mark key={i} className={LIT_WORD_CLASSES}>
          {surface}
        </mark>
      );
    } else {
      nodes.push(
        <button
          key={i}
          type="button"
          className={`inline bg-transparent border-0 p-0 m-0 hover:text-scripture-accent ${isLit ? LIT_WORD_CLASSES : ''}`}
          aria-pressed={isLit ? 'true' : undefined}
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
  active: boolean;
  onToggle: () => void;
  expand: (key: string) => void;
}

function CrossRefRow({ row, active, onToggle, expand }: CrossRefRowProps) {
  const progress = useDiscoveryStore(s => s.crossRefProgress[row.key]) ?? EMPTY_PROGRESS;
  const setCrossRefHunting = useDiscoveryStore(s => s.setCrossRefHunting);
  const findCrossRefWord = useDiscoveryStore(s => s.findCrossRefWord);
  const navigateToVerse = useBibleStore(s => s.navigateToVerse);
  const [missMessage, setMissMessage] = useState<string | null>(null);

  // A network row fetches only once it is expanded — whether from the row
  // tap here or from a lens tap in the text, which only sets the active key.
  useEffect(() => {
    if (active && row.status === 'idle') expand(row.key);
  }, [active, row.status, row.key, expand]);

  const shared = row.shared;
  const hasShared = shared.length > 0;
  const foundAll = hasShared && shared.every(s => progress.found.includes(s));
  const hunting = progress.hunting && !foundAll;

  useEffect(() => {
    if (progress.hunting && foundAll) {
      track('discovery_find_confirmed', { feature: 'crossref', dedupeKey: `crossref-found:${row.key}` });
    }
  }, [progress.hunting, foundAll, row.key]);

  const handleTap = (stem: string) => {
    if (shared.includes(stem)) {
      setMissMessage(null);
      findCrossRefWord(row.key, stem);
    } else {
      setMissMessage('Not that one — it has to appear in both.');
    }
  };

  const litStems = new Set(hunting ? progress.found : shared);
  const canTap = row.sourceText !== null;
  const onWordTap = hunting && canTap ? handleTap : undefined;
  const passagesId = `crossref-passages-${row.key}`;

  const jumpButton = row.jumpTarget ? (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => navigateToVerse(row.jumpTarget!.book, row.jumpTarget!.chapter, row.jumpTarget!.verse, true)}
    >
      {`Go to ${row.label}`}
    </Button>
  ) : null;

  return (
    <div data-crossref-row={row.key}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={active}
        aria-controls={passagesId}
        className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded hover:bg-scripture-elevated text-sm"
      >
        <span className="text-scripture-muted">{`v.${row.crossRef.verse}`}</span>{' '}
        <span className="text-scripture-text font-medium">{row.label}</span>
      </button>

      {active && (
        <div id={passagesId} className="px-2 pb-2 space-y-2">
          {row.status === 'loading' && <p className="text-sm text-scripture-muted">Loading…</p>}

          {row.status === 'error' && (
            <>
              <p className="text-sm text-scripture-muted">{"Couldn't load that passage."}</p>
              {jumpButton}
            </>
          )}

          {row.status === 'ready' && (
            <>
              {hunting && (
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

              <div>
                <p className="text-xs font-ui font-semibold text-scripture-muted">{row.sourceRefLabel}</p>
                <p className="text-sm text-scripture-text">
                  {row.sourceText === null ? null : renderPassageWords(row.sourceText, litStems, onWordTap)}
                </p>
              </div>
              <div>
                <p className="text-xs font-ui font-semibold text-scripture-muted">{row.label}</p>
                {row.targetVerses.map(tv => (
                  <p key={tv.verse} className="text-sm text-scripture-text">
                    {row.targetVerses.length > 1 && <span className="text-xs text-scripture-muted mr-1">{tv.verse}</span>}
                    {renderPassageWords(tv.text, litStems, onWordTap)}
                  </p>
                ))}
              </div>

              <div aria-live="polite">{hunting && missMessage && <p className="text-xs text-scripture-error">{missMessage}</p>}</div>

              {!hasShared && <p className="text-sm text-scripture-text">What idea connects these?</p>}

              {progress.hunting && foundAll && (
                <p className="text-sm text-scripture-text">
                  Both say {joinWords(shared.map(s => <strong key={s}>{surfaceForm(row.sourceText ?? '', s)}</strong>))}.
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                {jumpButton}
                {hunting && (
                  <Button variant="ghost" size="sm" onClick={() => setCrossRefHunting(row.key, false)}>
                    Show me
                  </Button>
                )}
                {hasShared && canTap && !progress.hunting && (
                  <Button variant="ghost" size="sm" onClick={() => setCrossRefHunting(row.key, true)}>
                    Find them yourself
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function CrossRefsCard({ rows, expand, book, chapter }: CrossRefsCardProps) {
  const lensActive = useDiscoveryStore(s => s.lens === 'crossRefs');
  const toggleLens = useDiscoveryStore(s => s.toggleLens);
  const activeCrossRefKey = useDiscoveryStore(s => s.activeCrossRefKey);
  const setActiveCrossRefKey = useDiscoveryStore(s => s.setActiveCrossRefKey);
  const navigateToVerse = useBibleStore(s => s.navigateToVerse);
  const containerRef = useRef<HTMLDivElement>(null);

  const rowKeys = useMemo(() => new Set(rows.map(r => r.key)), [rows]);

  useEffect(() => {
    if (!activeCrossRefKey || !rowKeys.has(activeCrossRefKey)) return;
    // +50ms past MultiTranslationView's layout re-key so the row has settled into its final position before we scroll to it.
    const timer = setTimeout(() => {
      const el = containerRef.current?.querySelector(`[data-crossref-row="${activeCrossRefKey}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, LAYOUT_REKEY_MS + 50);
    return () => clearTimeout(timer);
  }, [activeCrossRefKey, rowKeys]);

  if (rows.length === 0) return null;

  const handleToggleLens = () => {
    track('lens_toggled', { feature: 'crossref' });
    toggleLens('crossRefs');
  };

  const handleRowToggle = (row: CrossRefPassageRow) => {
    if (activeCrossRefKey === row.key) {
      setActiveCrossRefKey(null);
      return;
    }
    navigateToVerse(book, chapter, row.crossRef.verse);
    setActiveCrossRefKey(row.key);
    track('discovery_chip_tapped', { feature: 'crossref', dedupeKey: `crossref-tap:${row.key}` });
  };

  const title = `${pluralize(rows.length, 'verse')} here ${agree(rows.length, 'connects', 'connect')} to older Scripture`;

  return (
    <DiscoveryCard title={title}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-scripture-text">Show them in the text</span>
        <ToggleSwitch checked={lensActive} onChange={handleToggleLens} label="Show connecting verses in the text" />
      </div>
      <p className="text-sm text-scripture-text">Read them together — what do they share?</p>
      <div ref={containerRef} className="space-y-1">
        {rows.map(row => (
          <CrossRefRow
            key={row.key}
            row={row}
            active={activeCrossRefKey === row.key}
            onToggle={() => handleRowToggle(row)}
            expand={expand}
          />
        ))}
      </div>
    </DiscoveryCard>
  );
}
