/**
 * Key Word Finder Component
 * 
 * Shows all occurrences of a key word in the current book/chapter.
 */

import { useState, useEffect } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import type { MarkingPreset } from '@/types/keyWord';
import { db } from '@/lib/db';
import { getBookById } from '@/types/bible';

interface KeyWordFinderProps {
  preset: MarkingPreset;
  onClose?: () => void;
}

export function KeyWordFinder({ preset, onClose }: KeyWordFinderProps) {
  const { currentBook, currentChapter, currentModuleId } = useBibleStore();
  const [occurrences, setOccurrences] = useState<Array<{
    book: string;
    chapter: number;
    verse: number;
    text: string;
    context: string;
  }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchScope, setSearchScope] = useState<'chapter' | 'book' | 'all'>('chapter');

  useEffect(() => {
    searchOccurrences();
  }, [preset, currentBook, currentChapter, currentModuleId, searchScope]);

  async function searchOccurrences() {
    if (!currentModuleId) return;
    
    setIsLoading(true);
    try {
      // Get all cached chapters
      const allChapters = await db.chapterCache
        .where('moduleId')
        .equals(currentModuleId)
        .toArray();

      const results: typeof occurrences = [];

      for (const chapterCache of allChapters) {
        // Filter by scope
        if (searchScope === 'chapter') {
          if (chapterCache.book !== currentBook || chapterCache.chapter !== currentChapter) {
            continue;
          }
        } else if (searchScope === 'book') {
          if (chapterCache.book !== currentBook) {
            continue;
          }
        }
        // 'all' searches everything

        // Search through verses
        for (const [verseNum, verseText] of Object.entries(chapterCache.verses)) {
          const text = verseText as string;
          const lowerText = text.toLowerCase();
          const lowerWord = (preset.word || '').toLowerCase();

          // Check if key word appears in this verse
          if (lowerWord && lowerText.includes(lowerWord)) {
            let index = 0;
            while ((index = lowerText.indexOf(lowerWord, index)) !== -1) {
              const start = Math.max(0, index - 50);
              const end = Math.min(text.length, index + lowerWord.length + 50);
              const context = text.substring(start, end);
              const wordStart = index - start;
              const wordEnd = wordStart + lowerWord.length;
              const highlightedContext =
                context.substring(0, wordStart) +
                `**${context.substring(wordStart, wordEnd)}**` +
                context.substring(wordEnd);

              results.push({
                book: chapterCache.book,
                chapter: chapterCache.chapter,
                verse: parseInt(verseNum, 10),
                text: text,
                context: highlightedContext,
              });
              index += lowerWord.length;
            }
          }

          for (const variant of preset.variants || []) {
            const variantText = typeof variant === 'string' ? variant : variant.text;
            const lowerVariant = variantText.toLowerCase();
            if (lowerText.includes(lowerVariant)) {
              let index = 0;
              while ((index = lowerText.indexOf(lowerVariant, index)) !== -1) {
                const start = Math.max(0, index - 50);
                const end = Math.min(text.length, index + lowerVariant.length + 50);
                const context = text.substring(start, end);
                const wordStart = index - start;
                const wordEnd = wordStart + lowerVariant.length;
                const highlightedContext = 
                  context.substring(0, wordStart) +
                  `**${context.substring(wordStart, wordEnd)}**` +
                  context.substring(wordEnd);

                results.push({
                  book: chapterCache.book,
                  chapter: chapterCache.chapter,
                  verse: parseInt(verseNum, 10),
                  text: text,
                  context: highlightedContext,
                });

                index += lowerVariant.length;
              }
            }
          }
        }
      }

      // Remove duplicates (same verse)
      const unique = results.filter((r, i, self) => 
        i === self.findIndex(t => 
          t.book === r.book && t.chapter === r.chapter && t.verse === r.verse
        )
      );

      setOccurrences(unique);
    } catch (error) {
      console.error('Failed to search for key word occurrences:', error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-scripture-border/50">
        <div>
          <h2 className="text-lg font-ui font-semibold text-scripture-text">
            Find: {preset.word}
          </h2>
          <p className="text-xs text-scripture-muted mt-1">
            {occurrences.length} occurrence{occurrences.length !== 1 ? 's' : ''} found
          </p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
          >
            ✕
          </button>
        )}
      </div>

      {/* Scope selector */}
      <div className="p-4 border-b border-scripture-border/50">
        <div className="flex items-center gap-2">
          <span className="text-sm text-scripture-text">Search in:</span>
          {(['chapter', 'book', 'all'] as const).map((scope) => (
            <button
              key={scope}
              onClick={() => setSearchScope(scope)}
              className={`px-3 py-1 text-xs font-ui rounded-lg transition-colors
                        ${searchScope === scope
                          ? 'bg-scripture-accent text-scripture-bg'
                          : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'}`}
            >
              {scope === 'chapter' ? 'This Chapter' : scope === 'book' ? 'This Book' : 'All Books'}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {isLoading ? (
          <div className="text-center py-8 text-scripture-muted text-sm">
            Searching...
          </div>
        ) : occurrences.length === 0 ? (
          <div className="text-center py-8 text-scripture-muted text-sm">
            No occurrences found
          </div>
        ) : (
          <div className="space-y-3">
            {occurrences.map((occ, index) => {
              const bookInfo = getBookById(occ.book);
              return (
                <div
                  key={`${occ.book}-${occ.chapter}-${occ.verse}-${index}`}
                  className="p-3 rounded-lg border bg-scripture-elevated border-scripture-border/30"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-scripture-text text-sm">
                      {bookInfo?.name || occ.book} {occ.chapter}:{occ.verse}
                    </span>
                  </div>
                  <p className="text-sm text-scripture-text leading-relaxed">
                    {occ.context.split('**').map((part, i) => 
                      i % 2 === 1 ? (
                        <span key={i} className="bg-yellow-500/30 font-semibold">
                          {part}
                        </span>
                      ) : (
                        part
                      )
                    )}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
