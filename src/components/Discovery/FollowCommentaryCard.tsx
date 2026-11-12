/**
 * FollowCommentaryCard — commentary that follows the reader through the chapter.
 *
 * Shows the commentary block covering the verse the reader is on (published
 * by the reading-position store), falling back to the chapter's opening
 * block before any position is known. Read more or a reference tap pins the
 * block so it stays put while the reader scrolls; Show less unpins and the
 * card resumes following. The card renders nothing while loading, on a load
 * failure (logged by the hook) or when the chapter has no commentary.
 *
 * The outer component keys its body on book + chapter + translation, so
 * navigating drops any pin.
 */

import { useEffect, useState } from 'react';
import { DiscoveryCard } from './DiscoveryCard';
import { CommentaryBlockView } from './CommentaryCard';
import { useChapterCommentary } from '@/hooks/useChapterCommentary';
import { trackChip } from '@/lib/discoveryTelemetry';
import { COMMENTARY_SOURCES, selectBlockForVerse } from '@/lib/commentary';
import type { CommentaryBlock } from '@/lib/commentary';
import { useReadingPositionStore } from '@/stores/readingPositionStore';

interface FollowCommentaryCardProps {
  book: string;
  chapter: number;
  translationId: string;
  translationAbbrev: string | null;
}

const FEATURES = { more: 'commentary_follow_more', reference: 'commentary_follow_reference' } as const;

export function FollowCommentaryCard(props: FollowCommentaryCardProps) {
  return <FollowCommentaryBody key={`${props.book}:${props.chapter}:${props.translationId}`} {...props} />;
}

function followTitle(block: CommentaryBlock, chapter: number): string {
  const { kind, startVerse, endVerse } = block;
  if (kind !== 'section' || startVerse === null || endVerse === null) return `Commentary on chapter ${chapter}`;
  return startVerse === endVerse
    ? `Commentary on ${chapter}:${startVerse}`
    : `Commentary on ${chapter}:${startVerse}–${endVerse}`;
}

function FollowCommentaryBody({ book, chapter, translationId, translationAbbrev }: FollowCommentaryCardProps) {
  const { blocks, isLoading, error } = useChapterCommentary(book, chapter);
  const currentVerse = useReadingPositionStore(s => s.currentVerse);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const pinned = pinnedId === null ? undefined : blocks.find(b => b.id === pinnedId);
  const block = pinned ?? selectBlockForVerse(blocks, currentVerse);
  const hasBlock = !isLoading && !error && block !== null;

  useEffect(() => {
    if (hasBlock) trackChip('discovery_chip_shown', 'commentary_follow', { book, chapter, translationId });
  }, [hasBlock, book, chapter, translationId]);

  if (isLoading || error || !block) return null;

  const scope = { book, chapter, translationId };
  return (
    <DiscoveryCard title={followTitle(block, chapter)}>
      <p className="text-xs text-scripture-muted">{COMMENTARY_SOURCES[block.commentaryId].sourceLine}</p>
      {block.title && <h4 className="text-xs font-ui font-semibold text-scripture-muted">{block.title}</h4>}
      <CommentaryBlockView
        key={block.id}
        block={block}
        scope={scope}
        translationAbbrev={translationAbbrev}
        showHeader={false}
        expanded={pinned !== undefined}
        onExpandedChange={open => setPinnedId(open ? block.id : null)}
        features={FEATURES}
      />
    </DiscoveryCard>
  );
}
