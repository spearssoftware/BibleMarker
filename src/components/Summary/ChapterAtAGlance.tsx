/**
 * Chapter at a Glance
 * 
 * Summary view showing chapter title, section headings, keywords, and observations
 */

import { useEffect, useState, useMemo } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import {
  getChapterTitle,
  getChapterHeadings,
  getAllObservationLists,
  saveChapterTitle,
} from '@/lib/database';
import { useActiveChapterStore } from '@/stores/activeChapterStore';
import type { ChapterTitle, SectionHeading } from '@/types';
import { SYMBOLS } from '@/types';
import type { MarkingPreset } from '@/types';
import type { ObservationList } from '@/types';
import { getBookById } from '@/types';
import { findKeywordMatches } from '@/lib/keywordMatching';
import { filterPresetsByStudy } from '@/lib/studyFilter';

interface ChapterSummary {
  title: ChapterTitle | null;
  headings: SectionHeading[];
  keywords: Array<{
    preset: MarkingPreset;
    count: number; // Number of times this keyword appears in the chapter
  }>;
  observations: Array<{
    list: ObservationList;
    items: number; // Number of items in this chapter
  }>;
  theme: string | null;
  supportingPresetIds: string[];
}

interface ChapterAtAGlanceProps {
  onObservationClick?: (listId: string) => void;
  onOpenObservationTools?: (listId?: string) => void; // For opening ObservationToolsPanel
}

function extractPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || doc.body.innerText || '';
}

export function ChapterAtAGlance({ onObservationClick, onOpenObservationTools }: ChapterAtAGlanceProps = {}) {
  const { currentBook, currentChapter, currentModuleId } = useBibleStore();
  const { activeView } = useMultiTranslationStore();
  const { presets, loadPresets } = useMarkingPresetStore();
  const { activeStudyId } = useStudyStore();
  const { verses: activeVerses, translationId: activeTranslationId, book: activeBook, chapter: activeChapterNum } = useActiveChapterStore();
  
  // Get the primary translation ID (first valid one) for section headings, chapter titles
  const primaryTranslationId = activeView?.translationIds[0] || currentModuleId || null;
  
  const [summary, setSummary] = useState<ChapterSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingTheme, setEditingTheme] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftTheme, setDraftTheme] = useState('');

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  // Reset editing state when chapter changes
  useEffect(() => {
    setEditingTitle(false);
    setEditingTheme(false);
  }, [currentBook, currentChapter]);

  const saveTitle = async (newTitle: string) => {
    const existing = summary?.title;
    const updated: ChapterTitle = existing
      ? { ...existing, title: newTitle, updatedAt: new Date() }
      : {
          id: crypto.randomUUID(),
          book: currentBook,
          chapter: currentChapter,
          title: newTitle,
          studyId: activeStudyId || undefined,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
    await saveChapterTitle(updated);
    setSummary(prev => prev ? { ...prev, title: updated } : prev);
    setEditingTitle(false);
  };

  const saveTheme = async (newTheme: string) => {
    const existing = summary?.title;
    if (!existing) return;
    const updated = { ...existing, theme: newTheme || undefined, updatedAt: new Date() };
    await saveChapterTitle(updated);
    setSummary(prev => prev ? { ...prev, title: updated, theme: newTheme || null } : prev);
    setEditingTheme(false);
  };
  
  const bookInfo = useMemo(() => getBookById(currentBook), [currentBook]);
  
  const relevantPresets = useMemo(() => {
    return filterPresetsByStudy(presets, activeStudyId).filter((preset) => {
      if (!preset.word) return false;
      if (preset.bookScope && preset.bookScope !== currentBook) return false;
      return true;
    });
  }, [presets, currentBook, activeStudyId]);
  
  useEffect(() => {
    async function loadSummary() {
      if (!primaryTranslationId || !currentBook || !currentChapter) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      
      try {
        const title = await getChapterTitle(null, currentBook, currentChapter, activeStudyId);
        const headings = await getChapterHeadings(null, currentBook, currentChapter, activeStudyId);
        
        // Find keywords via text matching using verse data already loaded by the reader.
        // Reading from activeChapterStore avoids any extra API calls (important for ESV TOS).
        const keywordMap = new Map<string, { preset: MarkingPreset; count: number }>();
        const versesToSearch =
          activeTranslationId === primaryTranslationId &&
          activeBook === currentBook &&
          activeChapterNum === currentChapter
            ? activeVerses
            : [];

        for (const verse of versesToSearch) {
          const plainText = extractPlainText(verse.text);
          const matches = findKeywordMatches(plainText, verse.ref, relevantPresets, primaryTranslationId);

          // Deduplicate by (presetId, startOffset) — presets with both highlight and symbol
          // produce two annotations per occurrence, so we only count each position once.
          const seenInVerse = new Set<string>();
          for (const ann of matches) {
            if (ann.presetId) {
              const key = `${ann.presetId}:${ann.startOffset}`;
              if (seenInVerse.has(key)) continue;
              seenInVerse.add(key);
              const existing = keywordMap.get(ann.presetId);
              if (existing) {
                existing.count++;
              } else {
                const preset = relevantPresets.find(p => p.id === ann.presetId);
                if (preset) {
                  keywordMap.set(ann.presetId, { preset, count: 1 });
                }
              }
            }
          }
        }
        
        const keywords = Array.from(keywordMap.values())
          .sort((a, b) => b.count - a.count);
        
        const allLists = await getAllObservationLists();
        const filteredLists = allLists.filter(
          list => !list.studyId || list.studyId === activeStudyId
        );
        const observations = filteredLists
          .map(list => {
            const itemsInChapter = list.items.filter(
              item => item.verseRef.book === currentBook && item.verseRef.chapter === currentChapter
            );
            return itemsInChapter.length > 0 
              ? { list, items: itemsInChapter.length }
              : null;
          })
          .filter((item): item is { list: ObservationList; items: number } => item !== null);
        
        setSummary({
          title: title ?? null,
          headings,
          keywords,
          observations,
          theme: title?.theme || null,
          supportingPresetIds: title?.supportingPresetIds || [],
        });
      } catch (error) {
        console.error('Error loading chapter summary:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadSummary();
  }, [primaryTranslationId, currentBook, currentChapter, activeStudyId, relevantPresets, activeVerses, activeTranslationId, activeBook, activeChapterNum]);
  
  if (isLoading) {
    return (
      <div className="p-4 bg-scripture-surface rounded-lg">
        <div className="flex items-center justify-center gap-3 py-8">
          <div className="w-6 h-6 border-2 border-scripture-border border-t-scripture-accent rounded-full animate-spin"></div>
          <div className="text-scripture-muted text-sm">Loading summary...</div>
        </div>
      </div>
    );
  }
  
  if (!summary) {
    return null;
  }
  
  const { title, headings, keywords, observations, theme, supportingPresetIds } = summary;
  
  return (
    <div className="p-4 bg-scripture-surface rounded-lg space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold text-scripture-text">
          {bookInfo?.name} {currentChapter}
        </h2>
      </div>
      
      {/* Chapter Title */}
      <div className="pb-3 border-b border-scripture-border/50">
        <div className="flex items-center justify-between mb-1">
          <div className="text-sm text-scripture-muted">Chapter Title</div>
          {!editingTitle && (
            <button
              onClick={() => { setDraftTitle(title?.title || ''); setEditingTitle(true); }}
              className="text-xs text-scripture-accent hover:text-scripture-accent/80 transition-colors"
            >
              {title ? 'Edit' : 'Add Title'}
            </button>
          )}
        </div>
        {editingTitle ? (
          <div className="flex gap-2">
            <input
              type="text"
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveTitle(draftTitle.trim());
                if (e.key === 'Escape') setEditingTitle(false);
              }}
              autoFocus
              placeholder="Enter chapter title..."
              className="flex-1 bg-scripture-bg border border-scripture-border rounded px-2 py-1 text-sm text-scripture-text focus:outline-none focus:border-scripture-accent"
            />
            <button
              onClick={() => saveTitle(draftTitle.trim())}
              disabled={!draftTitle.trim()}
              className="px-2 py-1 text-xs bg-scripture-accent text-scripture-bg rounded disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setEditingTitle(false)}
              className="px-2 py-1 text-xs bg-scripture-elevated text-scripture-text rounded"
            >
              Cancel
            </button>
          </div>
        ) : title ? (
          <div className="text-scripture-text font-medium">{title.title}</div>
        ) : (
          <div className="text-xs text-scripture-muted italic">No title yet</div>
        )}
      </div>
      
      {/* Chapter Theme */}
      {title && (
        <div className="pb-3 border-b border-scripture-border/50">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm text-scripture-muted">Chapter Theme</div>
            {!editingTheme && (
              <button
                onClick={() => { setDraftTheme(theme || ''); setEditingTheme(true); }}
                className="text-xs text-scripture-accent hover:text-scripture-accent/80 transition-colors"
              >
                {theme ? 'Edit' : 'Add Theme'}
              </button>
            )}
          </div>
          {editingTheme ? (
            <div className="space-y-2">
              <input
                type="text"
                value={draftTheme}
                onChange={(e) => setDraftTheme(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTheme(draftTheme.trim());
                  if (e.key === 'Escape') setEditingTheme(false);
                }}
                autoFocus
                placeholder="Enter chapter theme..."
                className="w-full bg-scripture-bg border border-scripture-border rounded px-2 py-1 text-sm text-scripture-text focus:outline-none focus:border-scripture-accent"
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveTheme(draftTheme.trim())}
                  className="px-2 py-1 text-xs bg-scripture-accent text-scripture-bg rounded"
                >
                  Save
                </button>
                <button
                  onClick={() => setEditingTheme(false)}
                  className="px-2 py-1 text-xs bg-scripture-elevated text-scripture-text rounded"
                >
                  Cancel
                </button>
                {theme && (
                  <button
                    onClick={() => saveTheme('')}
                    className="px-2 py-1 text-xs text-scripture-error hover:text-scripture-error/80 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          ) : theme ? (
            <>
              <div className="text-scripture-text italic">{theme}</div>
              {supportingPresetIds.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {supportingPresetIds.map(presetId => {
                    const preset = presets.find(p => p.id === presetId);
                    if (!preset) return null;
                    return (
                      <div
                        key={presetId}
                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-scripture-elevated rounded text-xs"
                      >
                        {preset.symbol && (
                          <span className="text-sm">{SYMBOLS[preset.symbol]}</span>
                        )}
                        {preset.highlight && (
                          <span
                            className="w-2.5 h-2.5 rounded"
                            style={{
                              backgroundColor: preset.highlight.color === 'yellow' ? '#eab308' :
                                              preset.highlight.color === 'blue' ? '#3b82f6' :
                                              preset.highlight.color === 'green' ? '#22c55e' :
                                              preset.highlight.color === 'red' ? '#ef4444' :
                                              preset.highlight.color === 'orange' ? '#f97316' :
                                              '#eab308',
                            }}
                          />
                        )}
                        <span className="text-scripture-text">{preset.word}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            <div className="text-xs text-scripture-muted italic">No theme recorded yet</div>
          )}
        </div>
      )}
      
      {/* Section Headings */}
      {headings.length > 0 && (
        <div className="pb-3 border-b border-scripture-border/50">
          <div className="text-sm text-scripture-muted mb-2">Section Headings</div>
          <div className="space-y-1.5">
            {headings.map(heading => {
              const verseRange = heading.coversUntil
                ? `${heading.beforeRef.verse}${heading.coversUntil.verse !== heading.beforeRef.verse ? `-${heading.coversUntil.verse}` : ''}`
                : `${heading.beforeRef.verse}+`;

              return (
                <button
                  key={heading.id}
                  onClick={() => {
                    setTimeout(() => {
                      const sectionHeadingElement = document.querySelector(`[data-section-heading="${heading.id}"]`) as HTMLElement;
                      if (sectionHeadingElement) {
                        sectionHeadingElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }, 100);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-scripture-elevated hover:bg-scripture-border/40 transition-colors text-left group"
                >
                  <span className="text-scripture-accent font-mono text-xs font-semibold shrink-0">
                    v{verseRange}
                  </span>
                  <span className="text-scripture-text text-sm font-medium group-hover:text-scripture-accent transition-colors">
                    {heading.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
      
      {/* Key Words */}
      {keywords.length > 0 && (
        <div className="pb-3 border-b border-scripture-border/50">
          <div className="text-sm text-scripture-muted mb-2">Key Words</div>
          <div className="flex flex-wrap gap-2">
            {keywords.map(({ preset, count }) => (
              <div
                key={preset.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-scripture-elevated rounded text-sm"
              >
                {preset.symbol && (
                  <span className="text-base">{SYMBOLS[preset.symbol]}</span>
                )}
                {preset.highlight && (
                  <span
                    className="w-3 h-3 rounded"
                    style={{
                      backgroundColor: preset.highlight.color === 'yellow' ? '#eab308' :
                                      preset.highlight.color === 'blue' ? '#3b82f6' :
                                      preset.highlight.color === 'green' ? '#22c55e' :
                                      preset.highlight.color === 'red' ? '#ef4444' :
                                      preset.highlight.color === 'orange' ? '#f97316' :
                                      '#eab308',
                    }}
                  />
                )}
                <span className="text-scripture-text">{preset.word}</span>
                <span className="text-scripture-muted text-xs">({count})</span>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Observations */}
      {observations.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-scripture-muted">Observations</div>
            <button
              onClick={() => {
                if (onOpenObservationTools) {
                  onOpenObservationTools();
                } else {
                  // Dispatch custom event to open ObservationToolsPanel
                  window.dispatchEvent(new CustomEvent('openObservationTools', { 
                    detail: { tab: 'lists' } 
                  }));
                }
              }}
              className="text-xs text-scripture-accent hover:text-scripture-accent/80 transition-colors"
              title="Open Observation Tools"
            >
              View All →
            </button>
          </div>
          <div className="space-y-2">
            {observations.map(({ list, items }) => (
              <button
                key={list.id}
                onClick={() => {
                  if (onOpenObservationTools) {
                    onOpenObservationTools(list.id);
                  } else if (onObservationClick) {
                    onObservationClick(list.id);
                  } else {
                    // Dispatch custom event to open ObservationToolsPanel with specific list
                    window.dispatchEvent(new CustomEvent('openObservationTools', { 
                      detail: { tab: 'lists', listId: list.id } 
                    }));
                  }
                }}
                className="text-sm text-left w-full hover:bg-scripture-elevated/50 rounded p-2 transition-colors"
              >
                <div className="text-scripture-text font-medium mb-1">{list.title}</div>
                <div className="text-scripture-muted text-xs">{items} observation{items !== 1 ? 's' : ''} in this chapter</div>
              </button>
            ))}
          </div>
        </div>
      )}
      
      {/* Empty State */}
      {!title && headings.length === 0 && keywords.length === 0 && observations.length === 0 && (
        <div className="text-center py-8 text-scripture-muted text-sm">
          No summary data available for this chapter yet.
          <br />
          <span className="text-xs">Add chapter titles, headings, keywords, or observations to see them here.</span>
        </div>
      )}
    </div>
  );
}
