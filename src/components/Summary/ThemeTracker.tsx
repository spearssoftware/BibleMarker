/**
 * Theme Tracker
 * 
 * Shows where key words appear across chapters in a book
 */

import { useEffect, useState, useMemo } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import { fetchChapter } from '@/lib/bible-api';
import { getBookById } from '@/types';
import { findKeywordMatches } from '@/lib/keywordMatching';
import { filterPresetsByStudy } from '@/lib/studyFilter';
import { SYMBOLS, getHighlightColorHex } from '@/types';
// Helper to extract plain text from HTML (removes tags but keeps text)
function extractPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || doc.body.innerText || '';
}
import type { MarkingPreset } from '@/types';

interface KeywordChapterData {
  keywordId: string;
  keyword: MarkingPreset;
  chapters: Set<number>; // Chapters where this keyword appears
  totalCount: number; // Total occurrences across all chapters
}

interface ThemeTrackerProps {
  initialSearchTerm?: string;
}

export function ThemeTracker({ initialSearchTerm }: ThemeTrackerProps = {}) {
  const { currentBook, currentModuleId, setLocation } = useBibleStore();
  const { activeView } = useMultiTranslationStore();
  const { presets, loadPresets } = useMarkingPresetStore();
  const { activeStudyId } = useStudyStore();

  // Get the primary translation ID
  const primaryTranslationId = activeView?.translationIds[0] || currentModuleId || null;

  const [keywordData, setKeywordData] = useState<KeywordChapterData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState(initialSearchTerm || '');
  
  const bookInfo = useMemo(() => getBookById(currentBook), [currentBook]);
  const chapterCount = bookInfo?.chapters || 0;
  
  // Filter presets by active study (null = global only; study = global + study) and book scope
  const relevantPresets = useMemo(() => {
    return filterPresetsByStudy(presets, activeStudyId).filter((preset) => {
      if (!preset.word) return false;
      if (preset.bookScope && preset.bookScope !== currentBook) return false;
      return true;
    });
  }, [presets, currentBook, activeStudyId]);
  
  useEffect(() => {
    loadPresets();
  }, [loadPresets]);
  
  useEffect(() => {
    async function loadThemeData() {
      if (!primaryTranslationId || !currentBook || !bookInfo) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      
      try {
        const keywordMap = new Map<string, { keyword: MarkingPreset; chapters: Set<number>; count: number }>();
        
        // Initialize map with relevant presets
        for (const preset of relevantPresets) {
          keywordMap.set(preset.id, {
            keyword: preset,
            chapters: new Set(),
            count: 0,
          });
        }
        
        // Load cached text for each chapter and find keyword matches
        // This uses the same logic as the UI to find keywords (both manually marked and auto-detected)
        for (let chapter = 1; chapter <= bookInfo.chapters; chapter++) {
          try {
            const chapterData = await fetchChapter(primaryTranslationId, currentBook, chapter);

            if (chapterData && chapterData.verses.length > 0) {
              for (const verse of chapterData.verses) {
                if (!verse.text) continue;

                const plainText = extractPlainText(verse.text);
                const virtualAnnotations = findKeywordMatches(
                  plainText,
                  verse.ref,
                  relevantPresets,
                  primaryTranslationId
                );

                for (const ann of virtualAnnotations) {
                  if (ann.presetId) {
                    const data = keywordMap.get(ann.presetId);
                    if (data) {
                      data.chapters.add(chapter);
                      data.count++;
                    }
                  }
                }
              }
            }
          } catch {
            // Skip chapters that fail to load
          }
        }
        
        // Convert to array and filter out keywords with no occurrences
        const keywordArray = Array.from(keywordMap.values())
          .filter(data => data.chapters.size > 0)
          .map(data => ({
            keywordId: data.keyword.id,
            keyword: data.keyword,
            chapters: data.chapters,
            totalCount: data.count,
          }))
          .sort((a, b) => {
            // Sort by number of chapters (most widespread first), then by total count
            if (b.chapters.size !== a.chapters.size) {
              return b.chapters.size - a.chapters.size;
            }
            return b.totalCount - a.totalCount;
          });
        
        setKeywordData(keywordArray);
      } catch (error) {
        console.error('Error loading theme data:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadThemeData();
  }, [primaryTranslationId, currentBook, bookInfo, relevantPresets]);
  
  if (isLoading) {
    return (
      <div className="p-4 bg-scripture-surface rounded-lg">
        <div className="flex items-center justify-center gap-3 py-8">
          <div className="w-6 h-6 border-2 border-scripture-border border-t-scripture-accent rounded-full animate-spin"></div>
          <div className="text-scripture-muted text-sm">Loading theme tracker...</div>
        </div>
      </div>
    );
  }
  
  if (!bookInfo) {
    return (
      <div className="p-4 bg-scripture-surface rounded-lg">
        <div className="text-scripture-muted">Book not found</div>
      </div>
    );
  }
  
  const chapterNumbers = Array.from({ length: chapterCount }, (_, i) => i + 1);

  const filteredKeywords = keywordData.filter(
    ({ keyword }) => !searchTerm || keyword.word?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="bg-scripture-surface rounded-lg space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-scripture-text">{bookInfo.name} Themes</h2>
        <div className="text-xs text-scripture-muted">{keywordData.length} keywords</div>
      </div>

      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Search keywords..."
        className="w-full px-3 py-1.5 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg text-scripture-text placeholder:text-scripture-muted focus:outline-none focus:ring-1 focus:ring-scripture-accent"
      />

      {keywordData.length === 0 ? (
        <div className="text-center py-8 text-scripture-muted text-sm">
          No keywords found in this book.
          <br />
          <span className="text-xs">Mark keywords in the text to see them tracked here.</span>
        </div>
      ) : (
        <div className="flex -mx-4 px-4">
          {/* Fixed keyword labels column */}
          <div className="shrink-0 w-[120px] pr-2 z-10 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.15)]">
            {filteredKeywords.map(({ keywordId, keyword }) => {
              const highlightColor = keyword.highlight ? getHighlightColorHex(keyword.highlight.color) : null;
              return (
                <div key={keywordId} className="h-7 flex items-center gap-1.5 min-w-0">
                  {keyword.symbol && (
                    <span className="text-sm shrink-0">{SYMBOLS[keyword.symbol]}</span>
                  )}
                  {keyword.highlight && !keyword.symbol && (
                    <span
                      className="w-3 h-3 rounded-sm shrink-0"
                      style={{ backgroundColor: highlightColor || undefined }}
                    />
                  )}
                  <span className="text-xs font-medium text-scripture-text truncate">
                    {keyword.word}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Scrollable chapter grid */}
          <div className="flex-1 overflow-x-auto min-w-0">
            {filteredKeywords.map(({ keywordId, keyword, chapters, totalCount }) => {
              const isSelected = selectedKeyword === keywordId;
              const highlightColor = keyword.highlight ? getHighlightColorHex(keyword.highlight.color) : null;

              return (
                <div
                  key={keywordId}
                  className={`h-7 flex items-center gap-px ${isSelected ? 'bg-scripture-accent/10' : ''}`}
                >
                  {chapterNumbers.map(ch => {
                    const present = chapters.has(ch);
                    return (
                      <button
                        key={ch}
                        onClick={() => {
                          setLocation(currentBook, ch);
                          setSelectedKeyword(keywordId);
                        }}
                        className={`w-6 h-6 shrink-0 rounded-sm text-[9px] font-medium leading-none flex items-center justify-center transition-all ${
                          present
                            ? 'text-white/90 hover:scale-110'
                            : 'text-scripture-muted/30 hover:bg-scripture-elevated hover:text-scripture-muted/60'
                        }`}
                        style={present ? {
                          backgroundColor: highlightColor || 'var(--scripture-accent)',
                          opacity: 0.85,
                        } : undefined}
                        title={`${keyword.word} — ${bookInfo.name} ${ch}${present ? ` (found)` : ''}`}
                        aria-label={`${keyword.word} in chapter ${ch}${present ? ' — present' : ''}`}
                      >
                        {ch}
                      </button>
                    );
                  })}
                  <span className="shrink-0 pl-2 text-[10px] text-scripture-muted tabular-nums">{totalCount}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
