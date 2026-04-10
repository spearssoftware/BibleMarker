/**
 * Search Utility
 *
 * Functions for searching Bible text, notes, keywords, headings, and observations.
 */

import {
  getAllCachedChapters,
  getAllNotes,
  getAllSectionHeadings,
  getAllChapterTitles,
  getAllMarkingPresets,
  getAllConclusions,
  getAllInterpretations,
  getAllApplications,
} from './database';
import { searchModuleText, fetchChapter } from './bible-api';
import { parseVerseRef } from '@/types';
import type { VerseRef } from '@/types';

export interface SearchResult {
  type: 'verse' | 'note' | 'keyword' | 'heading' | 'chapter-title' | 'observation';
  book: string;
  chapter: number;
  verse: number;
  text: string;
  context?: string;
  moduleId?: string;
  noteId?: string;
  /** Sub-label for observation results (e.g. "Conclusion", "Interpretation") */
  subType?: string;
  /** For keyword results: the keyword word for filtering */
  keywordWord?: string;
}

export type SearchScope = 'all' | 'bible' | 'notes' | 'keywords' | 'headings' | 'observations' | 'chapter';

/**
 * Search Bible text — uses SWORD module direct search for sword-* modules,
 * falls back to chapter cache for other providers (e.g. ESV).
 */
export async function searchBibleText(
  query: string,
  moduleId?: string,
  limit = 100
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  if (moduleId?.startsWith('sword-')) {
    const swordResults = await searchModuleText(moduleId, query, limit);
    return swordResults.map(r => ({
      type: 'verse' as const,
      book: r.book,
      chapter: r.chapter,
      verse: r.verse,
      text: r.text,
      context: r.context,
      moduleId: r.moduleId,
    }));
  }

  return searchCachedChapters(query, moduleId, limit);
}

async function searchCachedChapters(
  query: string,
  moduleId?: string,
  limit = 100
): Promise<SearchResult[]> {
  const normalizedQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  let allChapters = await getAllCachedChapters();
  if (moduleId) {
    allChapters = allChapters.filter(c => c.moduleId === moduleId);
  }

  for (const chapterCache of allChapters) {
    for (const [verseNum, verseText] of Object.entries(chapterCache.verses)) {
      const text = verseText as string;
      const lowerText = text.toLowerCase();

      if (lowerText.includes(normalizedQuery)) {
        const index = lowerText.indexOf(normalizedQuery);
        const start = Math.max(0, index - 50);
        const end = Math.min(text.length, index + normalizedQuery.length + 50);

        results.push({
          type: 'verse',
          book: chapterCache.book,
          chapter: chapterCache.chapter,
          verse: parseInt(verseNum, 10),
          text,
          context: text.substring(start, end),
          moduleId: chapterCache.moduleId,
        });

        if (results.length >= limit) return results;
      }
    }
  }

  return results;
}

/**
 * Search notes by content
 */
export async function searchNotes(
  query: string,
  moduleId?: string,
  limit = 100
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const normalizedQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  let allNotes = await getAllNotes();
  if (moduleId) {
    allNotes = allNotes.filter(n => n.moduleId === moduleId);
  }

  for (const note of allNotes) {
    const content = note.content.toLowerCase();
    if (content.includes(normalizedQuery)) {
      results.push({
        type: 'note',
        book: note.ref.book,
        chapter: note.ref.chapter,
        verse: note.ref.verse,
        text: note.content,
        moduleId: note.moduleId,
        noteId: note.id,
      });

      if (results.length >= limit) break;
    }
  }

  return results;
}

/**
 * Search keywords/marking presets by word, variants, and description
 */
export async function searchKeywords(
  query: string,
  limit = 100
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const normalizedQuery = query.toLowerCase();
  const results: SearchResult[] = [];
  const allPresets = await getAllMarkingPresets();

  for (const preset of allPresets) {
    if (!preset.word) continue;

    const wordMatch = preset.word.toLowerCase().includes(normalizedQuery);
    const variantMatch = preset.variants.some(v => v.text.toLowerCase().includes(normalizedQuery));
    const descMatch = preset.description?.toLowerCase().includes(normalizedQuery);

    if (wordMatch || variantMatch || descMatch) {
      const parts = [preset.word];
      if (preset.variants.length > 0) {
        parts.push(`(${preset.variants.map(v => v.text).join(', ')})`);
      }
      if (preset.description) parts.push(`— ${preset.description}`);

      results.push({
        type: 'keyword',
        book: preset.scopes?.[0]?.book || '',
        chapter: 0,
        verse: 0,
        text: parts.join(' '),
        context: preset.category || undefined,
        keywordWord: preset.word,
      });

      if (results.length >= limit) break;
    }
  }

  return results;
}

/**
 * Search section headings and chapter titles
 */
export async function searchHeadings(
  query: string,
  limit = 100
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const normalizedQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  // Section headings
  const headings = await getAllSectionHeadings();
  for (const h of headings) {
    if (h.title.toLowerCase().includes(normalizedQuery)) {
      results.push({
        type: 'heading',
        book: h.beforeRef.book,
        chapter: h.beforeRef.chapter,
        verse: h.beforeRef.verse,
        text: h.title,
      });
      if (results.length >= limit) return results;
    }
  }

  // Chapter titles
  const titles = await getAllChapterTitles();
  for (const t of titles) {
    const titleMatch = t.title.toLowerCase().includes(normalizedQuery);
    const themeMatch = t.theme?.toLowerCase().includes(normalizedQuery);

    if (titleMatch || themeMatch) {
      const text = t.theme ? `${t.title} — ${t.theme}` : t.title;
      results.push({
        type: 'chapter-title',
        book: t.book,
        chapter: t.chapter,
        verse: 1,
        text,
      });
      if (results.length >= limit) return results;
    }
  }

  return results;
}

/**
 * Search observations (5W+H, contrasts, conclusions, interpretations, applications)
 */
export async function searchObservations(
  query: string,
  limit = 100
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const normalizedQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  // Helper to search text fields of an observation entry
  const matchFields = (fields: (string | undefined)[]): string | undefined => {
    for (const f of fields) {
      if (f && f.toLowerCase().includes(normalizedQuery)) return f;
    }
    return undefined;
  };

  // Conclusions
  const conclusions = await getAllConclusions();
  for (const e of conclusions) {
    const match = matchFields([e.term, e.notes]);
    if (match) {
      results.push({
        type: 'observation',
        subType: 'Conclusion',
        book: e.verseRef.book,
        chapter: e.verseRef.chapter,
        verse: e.verseRef.verse,
        text: match,
      });
      if (results.length >= limit) return results;
    }
  }

  // Interpretations
  const interpretations = await getAllInterpretations();
  for (const e of interpretations) {
    const match = matchFields([e.meaning, e.authorIntent, e.keyThemes, e.context, e.implications, e.crossReferences, e.questions, e.insights]);
    if (match) {
      results.push({
        type: 'observation',
        subType: 'Interpretation',
        book: e.verseRef.book,
        chapter: e.verseRef.chapter,
        verse: e.verseRef.verse,
        text: match,
      });
      if (results.length >= limit) return results;
    }
  }

  // Applications
  const applications = await getAllApplications();
  for (const e of applications) {
    const match = matchFields([e.teaching, e.reproof, e.correction, e.training, e.notes]);
    if (match) {
      results.push({
        type: 'observation',
        subType: 'Application',
        book: e.verseRef.book,
        chapter: e.verseRef.chapter,
        verse: e.verseRef.verse,
        text: match,
      });
      if (results.length >= limit) return results;
    }
  }

  return results;
}

/**
 * Parse verse reference from query string
 */
export function parseVerseReference(query: string): VerseRef | null {
  return parseVerseRef(query.trim());
}

/**
 * Comprehensive search with priority ordering:
 * 1. Verse reference match
 * 2. Keywords
 * 3. Bible text
 * 4. Section headings & chapter titles
 * 5. Notes
 * 6. Observations
 */
export async function searchAll(
  query: string,
  scope: SearchScope = 'all',
  moduleId?: string,
  limit = 100,
  currentBook?: string,
  currentChapter?: number
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  // First, check if query is a verse reference (but not for chapter scope)
  const verseRef = scope !== 'chapter' ? parseVerseReference(query) : null;
  if (verseRef) {
    return searchVerseReference(verseRef, scope, moduleId, limit);
  }

  // For chapter scope, search only the current chapter
  if (scope === 'chapter' && currentBook && currentChapter !== undefined) {
    return searchInChapter(query, currentBook, currentChapter, moduleId, limit);
  }

  // Regular text search with priority ordering
  const results: SearchResult[] = [];

  if (scope === 'all' || scope === 'keywords') {
    const keywordResults = await searchKeywords(query, limit);
    results.push(...keywordResults);
  }

  if (scope === 'all' || scope === 'bible') {
    const bibleResults = await searchBibleText(query, moduleId, limit - results.length);
    results.push(...bibleResults);
  }

  if (scope === 'all' || scope === 'headings') {
    const headingResults = await searchHeadings(query, limit - results.length);
    results.push(...headingResults);
  }

  if (scope === 'all' || scope === 'notes') {
    const noteResults = await searchNotes(query, moduleId, limit - results.length);
    results.push(...noteResults);
  }

  if (scope === 'all' || scope === 'observations') {
    const obsResults = await searchObservations(query, limit - results.length);
    results.push(...obsResults);
  }

  // When filtering to a specific scope, sort by canonical order
  if (scope !== 'all') {
    results.sort((a, b) => {
      if (a.book !== b.book) return a.book.localeCompare(b.book);
      if (a.chapter !== b.chapter) return a.chapter - b.chapter;
      return a.verse - b.verse;
    });
  }

  return results.slice(0, limit);
}

/**
 * Search for a specific verse reference
 */
async function searchVerseReference(
  verseRef: VerseRef,
  scope: SearchScope,
  moduleId?: string,
  limit = 100
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // Fetch the verse
  if (moduleId?.startsWith('sword-')) {
    try {
      const chapter = await fetchChapter(moduleId, verseRef.book, verseRef.chapter);
      const match = chapter.verses.find(v => v.ref.verse === verseRef.verse);
      if (match) {
        results.push({
          type: 'verse',
          book: verseRef.book,
          chapter: verseRef.chapter,
          verse: verseRef.verse,
          text: match.text,
          moduleId,
        });
      }
    } catch {
      // Module not available
    }
  } else {
    let allChapters = await getAllCachedChapters();
    allChapters = allChapters.filter(c => c.book === verseRef.book && c.chapter === verseRef.chapter);
    if (moduleId) {
      allChapters = allChapters.filter(c => c.moduleId === moduleId);
    }
    for (const cached of allChapters) {
      const verseText = cached.verses[verseRef.verse];
      if (verseText) {
        results.push({
          type: 'verse',
          book: verseRef.book,
          chapter: verseRef.chapter,
          verse: verseRef.verse,
          text: verseText as string,
          moduleId: cached.moduleId,
        });
        break;
      }
    }
  }

  // Also search for notes on this verse
  if (scope === 'all' || scope === 'notes') {
    let notes = await getAllNotes();
    if (moduleId) {
      notes = notes.filter(n => n.moduleId === moduleId);
    }
    notes = notes.filter(n =>
      n.ref.book === verseRef.book &&
      n.ref.chapter === verseRef.chapter &&
      n.ref.verse === verseRef.verse
    );
    for (const note of notes) {
      results.push({
        type: 'note',
        book: note.ref.book,
        chapter: note.ref.chapter,
        verse: note.ref.verse,
        text: note.content,
        moduleId: note.moduleId,
        noteId: note.id,
      });
    }
  }

  return results.slice(0, limit);
}

/**
 * Search within a specific chapter (bible text + notes)
 */
async function searchInChapter(
  query: string,
  book: string,
  chapter: number,
  moduleId?: string,
  limit = 100
): Promise<SearchResult[]> {
  const results: SearchResult[] = [];

  // Bible text
  if (moduleId?.startsWith('sword-')) {
    const swordResults = await searchModuleText(moduleId, query, limit, book, chapter);
    results.push(...swordResults.map(r => ({
      type: 'verse' as const,
      book: r.book,
      chapter: r.chapter,
      verse: r.verse,
      text: r.text,
      context: r.context,
      moduleId: r.moduleId,
    })));
  } else {
    const normalizedQuery = query.toLowerCase();
    let chapters = await getAllCachedChapters();
    chapters = chapters.filter(c => c.book === book && c.chapter === chapter);
    if (moduleId) {
      chapters = chapters.filter(c => c.moduleId === moduleId);
    }
    for (const chapterCache of chapters) {
      for (const [verseNum, verseText] of Object.entries(chapterCache.verses)) {
        const text = verseText as string;
        const lowerText = text.toLowerCase();
        if (lowerText.includes(normalizedQuery)) {
          const index = lowerText.indexOf(normalizedQuery);
          const start = Math.max(0, index - 50);
          const end = Math.min(text.length, index + normalizedQuery.length + 50);
          results.push({
            type: 'verse',
            book: chapterCache.book,
            chapter: chapterCache.chapter,
            verse: parseInt(verseNum, 10),
            text,
            context: text.substring(start, end),
            moduleId: chapterCache.moduleId,
          });
          if (results.length >= limit) return results;
        }
      }
    }
  }

  // Notes in this chapter
  const normalizedQuery = query.toLowerCase();
  let allNotes = await getAllNotes();
  allNotes = allNotes.filter(n => n.ref.book === book && n.ref.chapter === chapter);
  if (moduleId) {
    allNotes = allNotes.filter(n => n.moduleId === moduleId);
  }
  for (const note of allNotes) {
    if (note.content.toLowerCase().includes(normalizedQuery)) {
      results.push({
        type: 'note',
        book: note.ref.book,
        chapter: note.ref.chapter,
        verse: note.ref.verse,
        text: note.content,
        moduleId: note.moduleId,
        noteId: note.id,
      });
      if (results.length >= limit) break;
    }
  }

  return results;
}
