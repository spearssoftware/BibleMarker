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
  getBookChapterTitles,
  getBookSectionHeadings,
  getAllObservationLists,
} from '@/lib/database';
import { fetchChapter } from '@/lib/bible-api';
import { findKeywordMatches } from '@/lib/keywordMatching';
import { filterPresetsByStudy } from '@/lib/studyFilter';
import { useGnosisEntity } from '@/hooks/useGnosis';
import { Checkbox } from '@/components/shared';
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
  year?: number;
  yearDisplay?: string;
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
  const [chronological, setChronological] = useState(false);

  const bookInfo = useMemo(() => getBookById(currentBook), [currentBook]);

  // Fetch chapter years for the whole book in one query
  const { data: chapterYears } = useGnosisEntity(
    (provider) => provider.getBookChapterYears(currentBook),
    [currentBook]
  );
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
        // Fetch all book-level data in parallel
        const [titles, headings, allLists] = await Promise.all([
          getBookChapterTitles(currentBook, activeStudyId),
          getBookSectionHeadings(currentBook, activeStudyId),
          getAllObservationLists(),
        ]);

        // Build lookup maps keyed by chapter number
        const titleByChapter = new Map(titles.map(t => [t.chapter, t]));
        const headingCountByChapter = new Map<number, number>();
        for (const h of headings) {
          const ch = h.beforeRef.chapter;
          headingCountByChapter.set(ch, (headingCountByChapter.get(ch) ?? 0) + 1);
        }

        const filteredLists = allLists.filter(
          list => !list.studyId || list.studyId === activeStudyId
        );

        const chapterSummaries: ChapterSummaryData[] = [];

        for (let chapter = 1; chapter <= bookInfo.chapters; chapter++) {
          const title = titleByChapter.get(chapter) ?? null;
          const headingCount = headingCountByChapter.get(chapter) ?? 0;

          const keywordSet = new Set<string>();
          try {
            const chapterData = await fetchChapter(primaryTranslationId, currentBook, chapter);
            if (chapterData?.verses.length) {
              for (const verse of chapterData.verses) {
                if (!verse.text) continue;
                const plainText = extractPlainText(verse.text);
                const matches = findKeywordMatches(plainText, verse.ref, relevantPresets, primaryTranslationId);
                for (const ann of matches) {
                  if (ann.presetId) keywordSet.add(ann.presetId);
                }
              }
            }
          } catch { /* skip chapters that fail to load */ }

          const observationCount = filteredLists.reduce((count, list) => {
            return count + list.items.filter(
              item => item.verseRef.book === currentBook && item.verseRef.chapter === chapter
            ).length;
          }, 0);

          chapterSummaries.push({
            chapter,
            title,
            headingCount,
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

  // Merge chapter year data into summaries
  const enrichedSummaries = useMemo(() => {
    if (!chapterYears || chapterYears.size === 0) return summaries;
    return summaries.map(s => {
      const y = chapterYears.get(s.chapter);
      return y ? { ...s, year: y.year, yearDisplay: y.yearDisplay } : s;
    });
  }, [summaries, chapterYears]);

  const hasYearData = enrichedSummaries.some(s => s.year !== undefined);

  const displaySummaries = useMemo(() => {
    if (!chronological || !hasYearData) return enrichedSummaries;
    return [...enrichedSummaries].sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
  }, [enrichedSummaries, chronological, hasYearData]);

  if (isLoading) {
    return (
      <div className="p-4 bg-scripture-surface rounded-xl border border-scripture-border/50 shadow-sm">
        <div className="flex items-center justify-center gap-3 py-8">
          <div className="w-6 h-6 border-2 border-scripture-border border-t-scripture-accent rounded-full animate-spin"></div>
          <div className="text-scripture-muted text-sm">Loading book overview...</div>
        </div>
      </div>
    );
  }

  if (!bookInfo) {
    return (
      <div className="p-4 bg-scripture-surface rounded-xl border border-scripture-border/50 shadow-sm">
        <div className="text-scripture-muted">Book not found</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 px-4 pt-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-scripture-text">{bookInfo.name} Overview</h2>
        <div className="flex items-center gap-3">
          {hasYearData && (
            <Checkbox
              label="Chronological"
              checked={chronological}
              onChange={(e) => setChronological(e.target.checked)}
            />
          )}
          <div className="text-sm text-scripture-muted">{chapterCount} ch.</div>
        </div>
      </div>

      <div className="px-4 pb-4">
        <div className="divide-y divide-scripture-border/30 rounded-xl overflow-hidden border border-scripture-border/50">
          {displaySummaries.map(summary => {
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
                  {summary.yearDisplay && (
                    <span className="text-scripture-accent font-medium">{summary.yearDisplay}</span>
                  )}
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
