/**
 * CommentaryCard — Matthew Henry's Concise Commentary on the current chapter.
 *
 * The one Discover card that interprets rather than observes, so it is always
 * attributed and sits last in Look closer. Each block is clamped to three
 * lines with a Read more link. A section's verse range jumps the reader to
 * that section; a marked-up reference opens its passage inline below the
 * paragraph that holds it. The card renders nothing while loading, on a load
 * failure (logged by the hook) or when the chapter has no commentary.
 *
 * The outer component keys its body on book + chapter + translation, so
 * navigating resets every clamp and drops any pending passage.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '@/components/shared';
import { DiscoveryCard } from './DiscoveryCard';
import { useChapterCommentary } from '@/hooks/useChapterCommentary';
import { useCommentaryPassage } from '@/hooks/useCommentaryPassage';
import { trackChip } from '@/lib/discoveryTelemetry';
import type { ChapterTelemetryScope } from '@/lib/discoveryTelemetry';
import type { CommentaryBlock } from '@/lib/commentary';
import type { TelemetryFeature } from '@/lib/telemetry';
import { useBibleStore } from '@/stores/bibleStore';

interface CommentaryCardProps {
  book: string;
  chapter: number;
  translationId: string;
  translationAbbrev: string | null;
}

const LINK_CLASS = 'text-scripture-accent hover:text-scripture-accent/70';

export function CommentaryCard(props: CommentaryCardProps) {
  return <CommentaryBody key={`${props.book}:${props.chapter}:${props.translationId}`} {...props} />;
}

function CommentaryBody({ book, chapter, translationId, translationAbbrev }: CommentaryCardProps) {
  const { blocks, isLoading, error } = useChapterCommentary(book, chapter);
  const hasBlocks = blocks.length > 0;

  useEffect(() => {
    if (hasBlocks) trackChip('discovery_chip_shown', 'commentary', { book, chapter, translationId });
  }, [hasBlocks, book, chapter, translationId]);

  if (isLoading || error || !hasBlocks) return null;

  const scope = { book, chapter, translationId };
  return (
    <DiscoveryCard title="Matthew Henry's Concise Commentary">
      <p className="text-xs text-scripture-muted">{"Public domain · abridged from Matthew Henry's Exposition"}</p>
      <div className="space-y-4">
        {blocks.map(block => (
          <CommentaryBlockView
            key={block.id}
            block={block}
            scope={scope}
            translationAbbrev={translationAbbrev}
          />
        ))}
      </div>
    </DiscoveryCard>
  );
}

interface OpenRef {
  paragraph: number;
  run: number;
  osisRef: string;
}

export interface CommentaryBlockViewProps {
  block: CommentaryBlock;
  scope: ChapterTelemetryScope;
  translationAbbrev: string | null;
  /** Controlled when defined; otherwise the view keeps its own expanded state. */
  expanded?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  /** Telemetry features for the Read more and reference taps. */
  features?: { more: TelemetryFeature; reference: TelemetryFeature };
  /** Set false to hide the section's outline title and range header. */
  showHeader?: boolean;
}

const DEFAULT_FEATURES = { more: 'commentary', reference: 'commentary_reference' } as const;

export function CommentaryBlockView({
  block,
  scope,
  translationAbbrev,
  expanded: expandedProp,
  onExpandedChange,
  features = DEFAULT_FEATURES,
  showHeader = true,
}: CommentaryBlockViewProps) {
  const { book, chapter, translationId } = scope;
  const navigateToVerse = useBibleStore(s => s.navigateToVerse);
  const [internalExpanded, setInternalExpanded] = useState(false);
  const expanded = expandedProp ?? internalExpanded;
  const [openRef, setOpenRef] = useState<OpenRef | null>(null);
  const [overflows, setOverflows] = useState(false);
  const clampRef = useRef<HTMLParagraphElement>(null);

  // Re-measure whenever the clamped element resizes (panel width, font size);
  // an expanded block needs no measuring because Show less is always offered.
  useLayoutEffect(() => {
    const el = clampRef.current;
    if (expanded || !el) return;
    const measure = () => {
      const next = el.scrollHeight > el.clientHeight + 1;
      // Measures the DOM after render; the updater returns the same value when nothing changed, so React bails out.
      setOverflows(prev => (prev === next ? prev : next));
    };
    if (typeof ResizeObserver === 'undefined') {
      measure();
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [expanded, block]);

  const setExpanded = (next: boolean) => {
    if (expandedProp === undefined) setInternalExpanded(next);
    onExpandedChange?.(next);
  };

  const handleReadMore = () => {
    trackChip('discovery_chip_tapped', features.more, scope);
    setExpanded(true);
  };

  const handleShowLess = () => {
    setExpanded(false);
    setOpenRef(null);
  };

  const handleRange = () => {
    if (block.startVerse === null) return;
    trackChip('discovery_chip_tapped', 'commentary_range', scope);
    navigateToVerse(book, chapter, block.startVerse, true);
  };

  const handleReference = (paragraph: number, run: number, osisRef: string) => {
    if (openRef?.paragraph === paragraph && openRef.run === run) {
      setOpenRef(null);
      return;
    }
    trackChip('discovery_chip_tapped', features.reference, scope);
    setOpenRef({ paragraph, run, osisRef });
    setExpanded(true);
  };

  const renderRuns = (paragraph: number): ReactNode =>
    block.paragraphs[paragraph].map(({ text, osisRef }, i) =>
      osisRef ? (
        <button
          key={i}
          type="button"
          tabIndex={expanded || !overflows ? undefined : -1}
          onClick={() => handleReference(paragraph, i, osisRef)}
          className={`inline bg-transparent border-0 p-0 m-0 ${LINK_CLASS}`}
        >
          {text}
        </button>
      ) : (
        <span key={i}>{text}</span>
      )
    );

  const showToggle = expanded || overflows;

  return (
    <div className="space-y-1">
      {showHeader && block.kind === 'section' && block.startVerse !== null && block.endVerse !== null && (
        <h4 className="text-xs font-ui font-semibold text-scripture-muted">
          {block.title && `${block.title} · `}
          <button type="button" onClick={handleRange} className={LINK_CLASS}>
            {block.endVerse > block.startVerse
              ? `${chapter}:${block.startVerse}–${block.endVerse}`
              : `${chapter}:${block.startVerse}`}
          </button>
        </h4>
      )}

      {expanded ? (
        block.paragraphs.map((_, p) => (
          <div key={p} className="space-y-2">
            <p className="text-sm text-scripture-text">{renderRuns(p)}</p>
            {openRef?.paragraph === p && (
              <InlinePassage
                osisRef={openRef.osisRef}
                translationId={translationId}
                translationAbbrev={translationAbbrev}
              />
            )}
          </div>
        ))
      ) : (
        <p ref={clampRef} className="text-sm text-scripture-text line-clamp-3">
          {block.paragraphs.map((_, p) => (
            <span key={p}>
              {p > 0 && <br />}
              {renderRuns(p)}
            </span>
          ))}
        </p>
      )}

      {showToggle && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={expanded ? handleShowLess : handleReadMore}
          className={`text-sm ${LINK_CLASS}`}
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </div>
  );
}

interface InlinePassageProps {
  osisRef: string;
  translationId: string;
  translationAbbrev: string | null;
}

function InlinePassage({ osisRef, translationId, translationAbbrev }: InlinePassageProps) {
  const navigateToVerse = useBibleStore(s => s.navigateToVerse);
  const { status, verses, passage } = useCommentaryPassage(osisRef, translationId);

  return (
    <div className="px-2 pb-1 space-y-2">
      {status === 'loading' && <p className="text-sm text-scripture-muted">Loading…</p>}
      {status === 'error' && <p className="text-sm text-scripture-muted">{"Couldn't load that passage."}</p>}
      {status === 'missing' && (
        <p className="text-sm text-scripture-muted">
          {`This passage isn't in ${translationAbbrev ?? translationId.replace(/^sword-/, '')}.`}
        </p>
      )}
      {status === 'ready' && passage && (
        <>
          <div>
            {verses.map(v => (
              <p key={v.verse} className="text-sm text-scripture-text">
                {verses.length > 1 && <span className="text-xs text-scripture-muted mr-1">{v.verse}</span>}
                {v.text}
              </p>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigateToVerse(passage.book, passage.chapter, passage.startVerse, true)}
          >
            {`Go to ${passage.label}`}
          </Button>
        </>
      )}
    </div>
  );
}
