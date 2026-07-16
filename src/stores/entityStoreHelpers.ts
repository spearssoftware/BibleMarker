/**
 * Shared helpers for the observation "entity" stores (people, places, time
 * expressions, applications, interpretations, conclusions).
 *
 * These stores each re-implement the same validated-save block and the same
 * verse/chapter/book/study query filters. Centralizing them keeps the
 * validation error handling in one place (a fix lands once, not per store) and
 * removes the copy-paste. Each store keeps its own action names, state shape,
 * and bespoke logic (Gnosis resolution, auto-import, dedup) — these are just
 * the pieces that were identical everywhere.
 */

import type { VerseRef } from '@/types';
import { sanitizeData, ValidationError } from '@/lib/validation';

interface HasVerseRef {
  verseRef: VerseRef;
}

/**
 * Validate an entity, persist it, and return the validated value. Maps a
 * `ValidationError` to a friendly `Invalid <dataLabel> data: ...` message
 * (logging the field/value first), and rethrows anything else untouched —
 * exactly the block each store's create/update method used to inline.
 *
 * State updates stay with the caller (they differ: append vs. replace, and
 * some read a freshly-fetched list), so this only owns validate + save.
 */
export async function saveValidated<T>(
  entity: T,
  validator: (data: unknown) => T,
  dbSave: (validated: T) => Promise<unknown>,
  opts: { logPrefix: string; dataLabel: string }
): Promise<T> {
  try {
    const validated = sanitizeData(entity, validator);
    await dbSave(validated);
    return validated;
  } catch (error) {
    if (error instanceof ValidationError) {
      console.error(`[${opts.logPrefix}] Validation error:`, error.message, error.field, error.value);
      throw new Error(`Invalid ${opts.dataLabel} data: ${error.message}`);
    }
    throw error;
  }
}

/** Entries whose `verseRef` matches the given reference exactly (book+chapter+verse). */
export function filterByExactVerse<T extends HasVerseRef>(entries: T[], verseRef: VerseRef): T[] {
  return entries.filter(
    e =>
      e.verseRef.book === verseRef.book &&
      e.verseRef.chapter === verseRef.chapter &&
      e.verseRef.verse === verseRef.verse
  );
}

/** Entries whose `verseRef` falls in the given book+chapter. */
export function filterByChapter<T extends HasVerseRef>(entries: T[], book: string, chapter: number): T[] {
  return entries.filter(e => e.verseRef.book === book && e.verseRef.chapter === chapter);
}

/** Entries whose `verseRef` falls in the given book. */
export function filterByBook<T extends HasVerseRef>(entries: T[], book: string): T[] {
  return entries.filter(e => e.verseRef.book === book);
}

/** Entries scoped to the given study. */
export function filterByStudy<T extends { studyId?: string }>(entries: T[], studyId: string): T[] {
  return entries.filter(e => e.studyId === studyId);
}
