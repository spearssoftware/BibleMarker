/**
 * Search Utility
 * 
 * Functions for searching Bible text, notes, and annotations.
 */

import { getAllCachedChapters, getAllNotes } from './database';
import { parseVerseRef } from '@/types/bible';
import type { VerseRef } from '@/types/bible';
import type { Note } from '@/types/annotation';

export interface SearchResult {
  type: 'verse' | 'note';
  book: string;
  chapter: number;
  verse: number;
  text: string;
  context?: string;
  moduleId?: string;
  noteId?: string;
}

export type SearchScope = 'all' | 'bible' | 'notes' | 'chapter';

/**
 * Search Bible text across all cached chapters
 */
export async function searchBibleText(
  query: string,
  moduleId?: string,
  limit = 100
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const normalizedQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  // Get all cached chapters (optionally filtered by moduleId)
  let allChapters = await getAllCachedChapters();
  if (moduleId) {
    allChapters = allChapters.filter(c => c.moduleId === moduleId);
  }

  for (const chapterCache of allChapters) {
    for (const [verseNum, verseText] of Object.entries(chapterCache.verses)) {
      const text = verseText as string;
      const lowerText = text.toLowerCase();

      if (lowerText.includes(normalizedQuery)) {
        // Find all occurrences and create results with context
        let index = 0;
        while ((index = lowerText.indexOf(normalizedQuery, index)) !== -1 && results.length < limit) {
          const start = Math.max(0, index - 50);
          const end = Math.min(text.length, index + normalizedQuery.length + 50);
          const context = text.substring(start, end);

          results.push({
            type: 'verse',
            book: chapterCache.book,
            chapter: chapterCache.chapter,
            verse: parseInt(verseNum, 10),
            text,
            context,
            moduleId: chapterCache.moduleId,
          });

          index += normalizedQuery.length;
        }
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

  // Get all notes (optionally filtered by moduleId)
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
 * Parse verse reference from query string
 * Returns null if not a valid verse reference
 */
export function parseVerseReference(query: string): VerseRef | null {
  return parseVerseRef(query.trim());
}

/**
 * Comprehensive search across Bible text, notes, and annotations
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
    // If it's a verse reference, search for that specific verse
    const results: SearchResult[] = [];
    
    // Try to find the verse in cached chapters (search all modules if no moduleId specified)
    let allChapters = await getAllCachedChapters();
    allChapters = allChapters.filter(c => c.book === verseRef.book);
    
    // Filter by chapter
    allChapters = allChapters.filter(c => c.chapter === verseRef.chapter);
    
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
        // Only add one result per module to avoid duplicates
        break;
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

  // Regular text search
  const results: SearchResult[] = [];

  // For chapter scope, search only the current chapter
  if (scope === 'chapter' && currentBook && currentChapter !== undefined) {
    const bibleResults = await searchBibleTextInChapter(query, currentBook, currentChapter, moduleId, limit);
    results.push(...bibleResults);
    
    // Also search notes in the current chapter
    const noteResults = await searchNotesInChapter(query, currentBook, currentChapter, moduleId, limit);
    results.push(...noteResults);
  } else {
    if (scope === 'all' || scope === 'bible') {
      const bibleResults = await searchBibleText(query, moduleId, limit);
      results.push(...bibleResults);
    }

    if (scope === 'all' || scope === 'notes') {
      const noteResults = await searchNotes(query, moduleId, limit);
      results.push(...noteResults);
    }
  }

  // Sort by book, chapter, verse (canonical order)
  results.sort((a, b) => {
    if (a.book !== b.book) {
      return a.book.localeCompare(b.book);
    }
    if (a.chapter !== b.chapter) {
      return a.chapter - b.chapter;
    }
    return a.verse - b.verse;
  });

  return results.slice(0, limit);
}

/**
 * Search Bible text within a specific chapter
 */
async function searchBibleTextInChapter(
  query: string,
  book: string,
  chapter: number,
  moduleId?: string,
  limit = 100
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const normalizedQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  // Get only the specific chapter(s) from cache
  let chapters = await getAllCachedChapters();
  chapters = chapters.filter(c => c.book === book);
  chapters = chapters.filter(c => c.chapter === chapter);
  
  if (moduleId) {
    chapters = chapters.filter(c => c.moduleId === moduleId);
  }

  for (const chapterCache of chapters) {
    for (const [verseNum, verseText] of Object.entries(chapterCache.verses)) {
      const text = verseText as string;
      const lowerText = text.toLowerCase();

      if (lowerText.includes(normalizedQuery)) {
        // Find all occurrences and create results with context
        let index = 0;
        while ((index = lowerText.indexOf(normalizedQuery, index)) !== -1 && results.length < limit) {
          const start = Math.max(0, index - 50);
          const end = Math.min(text.length, index + normalizedQuery.length + 50);
          const context = text.substring(start, end);

          results.push({
            type: 'verse',
            book: chapterCache.book,
            chapter: chapterCache.chapter,
            verse: parseInt(verseNum, 10),
            text,
            context,
            moduleId: chapterCache.moduleId,
          });

          index += normalizedQuery.length;
        }
      }
    }
  }

  return results;
}

/**
 * Search notes within a specific chapter
 */
async function searchNotesInChapter(
  query: string,
  book: string,
  chapter: number,
  moduleId?: string,
  limit = 100
): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const normalizedQuery = query.toLowerCase();
  const results: SearchResult[] = [];

  // Get all notes filtered by book and chapter
  let allNotes = await getAllNotes();
  allNotes = allNotes.filter(n => n.ref.book === book && n.ref.chapter === chapter);
  
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
