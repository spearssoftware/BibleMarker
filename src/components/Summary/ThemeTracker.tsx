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
import { getCachedChapter } from '@/lib/database';
import { getBookById } from '@/types/bible';
import { findKeywordMatches } from '@/lib/keywordMatching';
import { SYMBOLS, HIGHLIGHT_COLORS } from '@/types/annotation';
// Helper to extract plain text from HTML (removes tags but keeps text)
function extractPlainText(html: string): string {
  // Create a temporary element to parse HTML and extract text
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent || temp.innerText || '';
}
import type { MarkingPreset } from '@/types/keyWord';

interface KeywordChapterData {
  keywordId: string;
  keyword: MarkingPreset;
  chapters: Set<number>; // Chapters where this keyword appears
  totalCount: number; // Total occurrences across all chapters
}

export function ThemeTracker() {
  const { currentBook, currentModuleId, setLocation } = useBibleStore();
  const { activeView } = useMultiTranslationStore();
  const { presets, loadPresets } = useMarkingPresetStore();
  const { activeStudyId } = useStudyStore();
  
  // Get the primary translation ID
  const primaryTranslationId = activeView?.translationIds[0] || currentModuleId || null;
  
  const [keywordData, setKeywordData] = useState<KeywordChapterData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedKeyword, setSelectedKeyword] = useState<string | null>(null);
  
  const bookInfo = useMemo(() => getBookById(currentBook), [currentBook]);
  const chapterCount = bookInfo?.chapters || 0;
  
  // Filter presets by active study and book scope
  const relevantPresets = useMemo(() => {
    return presets.filter(preset => {
      // Must have a word (is a keyword)
      if (!preset.word) return false;
      
      // If bookScope is set, must match current book
      if (preset.bookScope && preset.bookScope !== currentBook) return false;
      
      // If studyId is set, must match active study (or be global)
      if (preset.studyId && preset.studyId !== activeStudyId) return false;
      if (activeStudyId && preset.studyId && preset.studyId !== activeStudyId) return false;
      
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
          const cached = await getCachedChapter(primaryTranslationId, currentBook, chapter);
          
          if (cached && cached.verses) {
            // Track which keywords we've found in this chapter (to avoid double-counting)
            const chapterKeywordSet = new Set<string>();
            
            // Process each verse in the chapter
            for (const [verseNumStr, verseText] of Object.entries(cached.verses)) {
              const verseNum = parseInt(verseNumStr, 10);
              if (isNaN(verseNum) || !verseText) continue;
              
              // Extract plain text (remove HTML/OSIS tags)
              const plainText = extractPlainText(String(verseText));
              
              // Find keyword matches in this verse using the same logic as the UI
              const verseRef = { book: currentBook, chapter, verse: verseNum };
              const virtualAnnotations = findKeywordMatches(
                plainText,
                verseRef,
                relevantPresets,
                primaryTranslationId
              );
              
              // Count keyword occurrences
              for (const ann of virtualAnnotations) {
                if (ann.presetId) {
                  const data = keywordMap.get(ann.presetId);
                  if (data) {
                    // Mark that this keyword appears in this chapter
                    chapterKeywordSet.add(ann.presetId);
                    data.chapters.add(chapter);
                    data.count++;
                  }
                }
              }
            }
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
  
  return (
    <div className="p-4 bg-scripture-surface rounded-lg space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-scripture-text">Theme Tracker: {bookInfo.name}</h2>
        <div className="text-sm text-scripture-muted">{keywordData.length} keywords</div>
      </div>
      
      {keywordData.length === 0 ? (
        <div className="text-center py-8 text-scripture-muted text-sm">
          No keywords found in this book.
          <br />
          <span className="text-xs">Mark keywords in the text to see them tracked here.</span>
        </div>
      ) : (
        <div className="space-y-3">
          {keywordData.map(({ keywordId, keyword, chapters, totalCount }) => {
            const chapterArray = Array.from(chapters).sort((a, b) => a - b);
            const isSelected = selectedKeyword === keywordId;
            
            return (
              <div
                key={keywordId}
                className={`
                  p-3 rounded-lg border transition-all
                  ${isSelected 
                    ? 'bg-scripture-surface border-scripture-border' 
                    : 'bg-scripture-elevated/50 border-scripture-border/30 hover:border-scripture-border/50'
                  }
                `}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {keyword.symbol && (
                      <span className="text-2xl font-medium">{SYMBOLS[keyword.symbol]}</span>
                    )}
                    {keyword.highlight && (
                      <span
                        className="w-5 h-5 rounded"
                        style={{
                          backgroundColor: HIGHLIGHT_COLORS[keyword.highlight.color],
                        }}
                      />
                    )}
                    {keyword.word && (
                      <span className="font-medium text-scripture-text">{keyword.word}</span>
                    )}
                  </div>
                  <div className="text-xs text-scripture-muted">
                    {chapters.size} chapter{chapters.size !== 1 ? 's' : ''} • {totalCount} total
                  </div>
                </div>
                
                <div className="flex flex-wrap gap-1">
                  {Array.from({ length: chapterCount }, (_, i) => i + 1).map(chapter => {
                    const hasKeyword = chapters.has(chapter);
                    
                    return (
                      <button
                        key={chapter}
                        onClick={() => {
                          setLocation(currentBook, chapter);
                          setSelectedKeyword(keywordId);
                        }}
                        className={`
                          w-8 h-8 rounded text-xs font-medium transition-all
                          ${hasKeyword
                            ? 'bg-scripture-accent text-scripture-bg hover:bg-scripture-accent/90'
                            : 'bg-scripture-elevated text-scripture-muted hover:bg-scripture-surface'
                          }
                        `}
                        title={`${bookInfo.name} ${chapter}${hasKeyword ? ' - has keyword' : ''}`}
                      >
                        {chapter}
                      </button>
                    );
                  })}
                </div>
                
                {chapterArray.length > 0 && (
                  <div className="mt-2 text-xs text-scripture-muted">
                    Appears in: {chapterArray.join(', ')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
