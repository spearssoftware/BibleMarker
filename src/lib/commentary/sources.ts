import type { CommentaryBlock } from './types';

/** Display metadata per commentary, so cards carry no commentary-specific strings. */
export const COMMENTARY_SOURCES: Record<CommentaryBlock['commentaryId'], { sourceLine: string }> = {
  mhcc: { sourceLine: "Matthew Henry's Concise Commentary · public domain" },
};
