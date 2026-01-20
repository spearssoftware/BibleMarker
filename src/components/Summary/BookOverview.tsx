/**
 * Book Overview
 * 
 * Grid view of all chapter summaries for a book
 */

import { useEffect, useState, useMemo } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { 
  getChapterTitle, 
  getChapterHeadings, 
  getChapterAnnotations,
  getMarkingPreset,
} from '@/lib/db';
import { db } from '@/lib/db';
import type { ChapterTitle, SectionHeading, Annotation } from '@/types/annotation';
import type { MarkingPreset } from '@/types/keyWord';
import type { ObservationList } from '@/types/list';
import { getBookById, BIBLE_BOOKS } from '@/types/bible';

interface ChapterSummaryData {
  chapter: number;
  title: ChapterTitle | null;
  headingCount: number;
  keywordCount: number;
  observationCount: number;
}

interface BookOverviewProps {
  onChapterClick?: (chapter: number) => void;
}

export function BookOverview({ onChapterClick }: BookOverviewProps = {}) {
  const { currentBook, currentModuleId, setLocation } = useBibleStore();
  const { activeView } = useMultiTranslationStore();
  
  // Get the primary translation ID
  const primaryTranslationId = activeView?.translationIds.find(
    id => id !== 'observation-lists'
  ) || currentModuleId || null;
  
  const [summaries, setSummaries] = useState<ChapterSummaryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const bookInfo = useMemo(() => getBookById(currentBook), [currentBook]);
  const chapterCount = bookInfo?.chapters || 0;
  
  useEffect(() => {
    async function loadBookSummary() {
      if (!primaryTranslationId || !currentBook || !bookInfo) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      
      try {
        const chapterSummaries: ChapterSummaryData[] = [];
        
        // Load summary for each chapter
        for (let chapter = 1; chapter <= bookInfo.chapters; chapter++) {
          // Load chapter title
          const title = await getChapterTitle(primaryTranslationId, currentBook, chapter);
          
          // Load section headings
          const headings = await getChapterHeadings(primaryTranslationId, currentBook, chapter);
          
          // Load annotations to count keywords
          const annotations = await getChapterAnnotations(primaryTranslationId, currentBook, chapter);
          const uniqueKeywords = new Set<string>();
          for (const ann of annotations) {
            if (ann.presetId) {
              uniqueKeywords.add(ann.presetId);
            }
          }
          
          // Count observations in this chapter
          const allLists = await db.observationLists.toArray();
          const observationCount = allLists.reduce((count, list) => {
            const itemsInChapter = list.items.filter(
              item => item.verseRef.book === currentBook && item.verseRef.chapter === chapter
            );
            return count + itemsInChapter.length;
          }, 0);
          
          chapterSummaries.push({
            chapter,
            title: title ?? null,
            headingCount: headings.length,
            keywordCount: uniqueKeywords.size,
            observationCount,
          });
        }
        
        setSummaries(chapterSummaries);
      } catch (error) {
        console.error('Error loading book summary:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadBookSummary();
  }, [primaryTranslationId, currentBook, bookInfo]);
  
  if (isLoading) {
    return (
      <div className="p-4 bg-scripture-surface rounded-lg">
        <div className="flex items-center justify-center gap-3 py-8">
          <div className="w-6 h-6 border-2 border-scripture-border border-t-scripture-accent rounded-full animate-spin"></div>
          <div className="text-scripture-muted text-sm">Loading book overview...</div>
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
    <div>
      <div className="flex items-center justify-between mb-4 px-4 pt-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-scripture-text">{bookInfo.name} Overview</h2>
        <div className="text-sm text-scripture-muted">{chapterCount} chapters</div>
      </div>
      
      <div className="px-4 pb-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {summaries.map(summary => {
          const hasData = summary.title || summary.headingCount > 0 || summary.keywordCount > 0 || summary.observationCount > 0;
          
          return (
            <button
              key={summary.chapter}
              onClick={() => {
                setLocation(currentBook, summary.chapter);
                onChapterClick?.(summary.chapter);
              }}
                className={`
                p-3 rounded-lg border-2 transition-all text-left
                ${hasData 
                  ? 'bg-scripture-surface border-scripture-border/50 hover:border-scripture-border hover:bg-scripture-elevated' 
                  : 'bg-scripture-elevated/50 border-scripture-border/30 hover:border-scripture-border/50'
                }
              `}
            >
              <div className="font-semibold text-scripture-text mb-2">
                Chapter {summary.chapter}
              </div>
              
              {summary.title && (
                <div className="text-xs text-scripture-text mb-2 line-clamp-2">
                  {summary.title.title}
                </div>
              )}
              
              <div className="flex flex-wrap gap-2 text-xs text-scripture-muted">
                {summary.headingCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span>📑</span>
                    <span>{summary.headingCount}</span>
                  </span>
                )}
                {summary.keywordCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span>🔑</span>
                    <span>{summary.keywordCount}</span>
                  </span>
                )}
                {summary.observationCount > 0 && (
                  <span className="flex items-center gap-1">
                    <span>📝</span>
                    <span>{summary.observationCount}</span>
                  </span>
                )}
              </div>
              
              {!hasData && (
                <div className="text-xs text-scripture-muted/50 mt-2">No data</div>
              )}
            </button>
          );
        })}
        </div>
      </div>
    </div>
  );
}
