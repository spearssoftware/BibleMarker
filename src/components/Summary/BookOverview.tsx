/**
 * Book Overview
 *
 * Horizontal list of all chapter summaries for a book
 */

import { useEffect, useState, useMemo } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { useStudyStore } from '@/stores/studyStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import {
  getChapterTitle,
  getChapterHeadings,
  getAllObservationLists,
} from '@/lib/database';
import { fetchChapter } from '@/lib/bible-api';
import { findKeywordMatches } from '@/lib/keywordMatching';
import { filterPresetsByStudy } from '@/lib/studyFilter';
import type { ChapterTitle } from '@/types';
import { getBookById } from '@/types';

function extractPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || doc.body.innerText || '';
}

interface ChapterSummaryData {
  chapter: number;
  title: ChapterTitle | null;
  headingCount: number;
  keywordCount: number;
  observationCount: number;
  theme: string | null;
}

interface BookOverviewProps {
  onChapterClick?: (chapter: number) => void;
}

export function BookOverview({ onChapterClick }: BookOverviewProps = {}) {
  const { currentBook, currentModuleId, setLocation } = useBibleStore();
  const { activeView } = useMultiTranslationStore();
  const { activeStudyId } = useStudyStore();
  const { presets } = useMarkingPresetStore();

  const primaryTranslationId = activeView?.translationIds[0] || currentModuleId || null;

  const [summaries, setSummaries] = useState<ChapterSummaryData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const bookInfo = useMemo(() => getBookById(currentBook), [currentBook]);
  const chapterCount = bookInfo?.chapters || 0;

  const relevantPresets = useMemo(() => {
    return filterPresetsByStudy(presets, activeStudyId).filter(p => {
      if (!p.word) return false;
      if (p.bookScope && p.bookScope !== currentBook) return false;
      return true;
    });
  }, [presets, activeStudyId, currentBook]);

  useEffect(() => {
    async function loadBookSummary() {
      if (!primaryTranslationId || !currentBook || !bookInfo) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      try {
        const chapterSummaries: ChapterSummaryData[] = [];
        const allLists = await getAllObservationLists();
        const filteredLists = allLists.filter(
          list => !list.studyId || list.studyId === activeStudyId
        );

        for (let chapter = 1; chapter <= bookInfo.chapters; chapter++) {
          const title = await getChapterTitle(null, currentBook, chapter, activeStudyId);
          const headings = await getChapterHeadings(null, currentBook, chapter, activeStudyId);

          const keywordSet = new Set<string>();
          try {
            const chapterData = await fetchChapter(primaryTranslationId, currentBook, chapter);
            for (const verse of chapterData.verses) {
              const plainText = extractPlainText(verse.text);
              const matches = findKeywordMatches(plainText, verse.ref, relevantPresets, primaryTranslationId);
              for (const ann of matches) {
                if (ann.presetId) keywordSet.add(ann.presetId);
              }
            }
          } catch {
            // fetch failed — keyword count stays 0 for this chapter
          }

          const observationCount = filteredLists.reduce((count, list) => {
            const itemsInChapter = list.items.filter(
              item => item.verseRef.book === currentBook && item.verseRef.chapter === chapter
            );
            return count + itemsInChapter.length;
          }, 0);

          chapterSummaries.push({
            chapter,
            title: title ?? null,
            headingCount: headings.length,
            keywordCount: keywordSet.size,
            observationCount,
            theme: title?.theme || null,
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
  }, [primaryTranslationId, currentBook, bookInfo, activeStudyId, relevantPresets]);

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
        <div className="divide-y divide-scripture-border/30 rounded-lg overflow-hidden border border-scripture-border/30">
          {summaries.map(summary => {
            const hasData = summary.title || summary.headingCount > 0 || summary.keywordCount > 0 || summary.observationCount > 0;

            return (
              <button
                key={summary.chapter}
                onClick={() => {
                  setLocation(currentBook, summary.chapter);
                  onChapterClick?.(summary.chapter);
                }}
                className="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-scripture-elevated/60 transition-colors"
              >
                <span className={`w-10 shrink-0 text-sm font-semibold ${hasData ? 'text-scripture-accent' : 'text-scripture-muted/50'}`}>
                  {summary.chapter}
                </span>
                <div className="flex-1 min-w-0">
                  {summary.title && (
                    <div className="text-sm text-scripture-text truncate">{summary.title.title}</div>
                  )}
                  {summary.theme && (
                    <div className="text-xs text-scripture-muted italic truncate">{summary.theme}</div>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-scripture-muted shrink-0">
                  {summary.headingCount > 0 && <span>📑 {summary.headingCount}</span>}
                  {summary.keywordCount > 0 && <span>🔑 {summary.keywordCount}</span>}
                  {summary.observationCount > 0 && <span>📝 {summary.observationCount}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
