/**
 * CrossRefsCard — read a verse together with the older or later passage it connects to.
 *
 * Mirrors ConnectorsCard: a toggle lights the connecting verses in the text
 * (the cross-reference lens), and a list of rows, one per verse. Tapping a
 * row jumps the reader there and expands both passages with the words they
 * share already lit; tapping a lit verse in the text sets the same
 * `activeCrossRefKey` and opens this panel, so the effect below scrolls the
 * matching row into view. The scroll is delayed to survive
 * MultiTranslationView's layout re-key after the panel opens.
 *
 * Rows are grouped under "Earlier in Scripture" and "Later in Scripture"
 * (the latter votes-ordered, at most 3).
 *
 * The rows themselves come from `useDiscoveryHost` via the store (so the
 * lens works while the panel is closed). On a network translation nothing is
 * fetched until a row is expanded — that tap is the reader's consent.
 */

import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Button, ToggleSwitch } from '@/components/shared';
import { DiscoveryCard } from './DiscoveryCard';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { useBibleStore } from '@/stores/bibleStore';
import { LAYOUT_REKEY_MS } from '@/components/BibleReader/layoutConstants';
import type { CrossRefPassageRow } from '@/hooks/useCrossRefPassages';
import { track } from '@/lib/telemetry';
import { pluralize } from '@/lib/textUtils';
import { tokenizeVerse, wordStem } from '@/lib/chapterAnalysis';

interface CrossRefsCardProps {
  rows: CrossRefPassageRow[];
  expand: (key: string) => void;
  laterRows: CrossRefPassageRow[];
  laterExpand: (key: string) => void;
  book: string;
  chapter: number;
}

const LIT_WORD_CLASSES = 'bg-scripture-accent/20 text-scripture-accent rounded';

/**
 * Split a token's surface text into the word itself and the punctuation
 * around it, so a highlight covers "glory" rather than "glory,".
 */
function splitPunctuation(surface: string): { before: string; word: string; after: string } {
  const match = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su.exec(surface);
  if (!match) return { before: '', word: surface, after: '' };
  return { before: match[1], word: match[2], after: match[3] };
}

/** Render a passage's words with every token whose stem is in `litStems` marked. */
function renderPassageWords(text: string, litStems: ReadonlySet<string>): ReactNode {
  const tokens = tokenizeVerse(text);
  const nodes: ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((token, i) => {
    if (token.startIndex > cursor) nodes.push(text.slice(cursor, token.startIndex));
    const surface = text.slice(token.startIndex, token.endIndex);
    const stem = wordStem(token.normalized);
    if (stem === null || !litStems.has(stem)) {
      nodes.push(surface);
    } else {
      const { before, word, after } = splitPunctuation(surface);
      nodes.push(before);
      nodes.push(
        <mark key={i} className={LIT_WORD_CLASSES}>
          {word}
        </mark>
      );
      nodes.push(after);
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
  const navigateToVerse = useBibleStore(s => s.navigateToVerse);

  // A network row fetches only once it is expanded — whether from the row
  // tap here or from a lens tap in the text, which only sets the active key.
  // `expand` is a no-op for loading/ready rows and retries failed ones, so
  // re-opening a failed row retries without looping while it stays open.
  useEffect(() => {
    if (active) expand(row.key);
  }, [active, row.key, expand]);

  const litStems = new Set(row.shared);
  const passagesId = `crossref-passages-${row.key}`;

  const { book: jumpBook, chapter: jumpChapter, verse: jumpVerse } = row.jumpTarget;
  const jumpButton = (
    <Button variant="secondary" size="sm" onClick={() => navigateToVerse(jumpBook, jumpChapter, jumpVerse, true)}>
      {`Go to ${row.label}`}
    </Button>
  );

  return (
    <div data-crossref-row={row.key}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={active}
        aria-controls={passagesId}
        className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded hover:bg-scripture-elevated text-sm"
      >
        <span className="text-scripture-text font-medium">{row.sourceRefLabel}</span>{' '}
        <span className="text-scripture-muted" aria-hidden="true">→</span>{' '}
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
              <div>
                <p className="text-xs font-ui font-semibold text-scripture-muted">{row.sourceRefLabel}</p>
                <p className="text-sm text-scripture-text">
                  {row.sourceText === null ? null : renderPassageWords(row.sourceText, litStems)}
                </p>
              </div>
              <div>
                <p className="text-xs font-ui font-semibold text-scripture-muted">{row.label}</p>
                {row.targetVerses.map(tv => (
                  <p key={tv.verse} className="text-sm text-scripture-text">
                    {row.targetVerses.length > 1 && <span className="text-xs text-scripture-muted mr-1">{tv.verse}</span>}
                    {renderPassageWords(tv.text, litStems)}
                  </p>
                ))}
              </div>

              {row.shared.length === 0 && <p className="text-sm text-scripture-text">What idea connects these?</p>}

              {jumpButton}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function CrossRefsCard({ rows, expand, laterRows, laterExpand, book, chapter }: CrossRefsCardProps) {
  const lensActive = useDiscoveryStore(s => s.lens === 'crossRefs');
  const toggleLens = useDiscoveryStore(s => s.toggleLens);
  const activeCrossRefKey = useDiscoveryStore(s => s.activeCrossRefKey);
  const setActiveCrossRefKey = useDiscoveryStore(s => s.setActiveCrossRefKey);
  const activateCrossRef = useDiscoveryStore(s => s.activateCrossRef);
  const navigateToVerse = useBibleStore(s => s.navigateToVerse);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeCrossRefKey) return;
    // +50ms past MultiTranslationView's layout re-key so the row has settled into its final position before we scroll to it.
    const timer = setTimeout(() => {
      const el = containerRef.current?.querySelector(`[data-crossref-row="${activeCrossRefKey}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, LAYOUT_REKEY_MS + 50);
    return () => clearTimeout(timer);
  }, [activeCrossRefKey]);

  if (rows.length === 0 && laterRows.length === 0) return null;

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
    activateCrossRef(row.key);
  };

  const title =
    rows.length > 0
      ? `${pluralize(rows.length, 'verse')} to read alongside older Scripture`
      : `${pluralize(laterRows.length, 'verse')} to read alongside later Scripture`;

  const renderGroup = (heading: string, groupRows: CrossRefPassageRow[], groupExpand: (key: string) => void) =>
    groupRows.length > 0 && (
      <div className="space-y-1">
        <h4 className="text-xs font-ui font-semibold text-scripture-muted px-2">{heading}</h4>
        {groupRows.map(row => (
          <CrossRefRow
            key={row.key}
            row={row}
            active={activeCrossRefKey === row.key}
            onToggle={() => handleRowToggle(row)}
            expand={groupExpand}
          />
        ))}
      </div>
    );

  return (
    <DiscoveryCard title={title}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-scripture-text">Show them in the text</span>
        <ToggleSwitch checked={lensActive} onChange={handleToggleLens} label="Show connecting verses in the text" />
      </div>
      <p className="text-sm text-scripture-text">Read them together, with the words they share lit.</p>
      <div ref={containerRef} className="space-y-3">
        {renderGroup('Earlier in Scripture', rows, expand)}
        {renderGroup('Later in Scripture', laterRows, laterExpand)}
      </div>
    </DiscoveryCard>
  );
}
