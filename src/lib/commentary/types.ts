/** A span of commentary text; `osisRef` marks a reference the reader can expand. */
export interface CommentaryRun {
  text: string;
  osisRef?: string;
}

export type CommentaryBlockKind = 'book-intro' | 'chapter-intro' | 'whole-chapter' | 'section';

/** One block of commentary for a chapter, keyed by commentary so other sources can supply the same shape. */
export interface CommentaryBlock {
  /** Stable within a chapter; use as a React key. */
  id: string;
  commentaryId: 'mhcc';
  kind: CommentaryBlockKind;
  book: string;
  chapter: number;
  /** Linked verse range for a `'section'`; null otherwise. */
  startVerse: number | null;
  endVerse: number | null;
  /** Outline title for a `'section'`, or null. */
  title: string | null;
  paragraphs: CommentaryRun[][];
}
