import type { CommentaryBlock } from './types';

/**
 * Pick the block to show for the reader's current verse. A chapter with sections follows the verse
 * through them; otherwise it falls back to the whole-chapter block, then the chapter intro.
 */
export function selectBlockForVerse(blocks: CommentaryBlock[], verse: number | null): CommentaryBlock | null {
  const sections = blocks.filter(b => b.kind === 'section' && b.startVerse !== null && b.endVerse !== null);
  if (sections.length === 0) {
    return (
      blocks.find(b => b.kind === 'whole-chapter') ?? blocks.find(b => b.kind === 'chapter-intro') ?? null
    );
  }
  if (verse === null) return sections[0];
  const containing = sections.find(b => verse >= b.startVerse! && verse <= b.endVerse!);
  if (containing) return containing;
  return sections.filter(b => b.startVerse! < verse).at(-1) ?? sections[0];
}
