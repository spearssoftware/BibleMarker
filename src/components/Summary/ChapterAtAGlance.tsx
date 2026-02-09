/**
 * Chapter at a Glance
 * 
 * Summary view showing chapter title, section headings, keywords, and observations
 */

import { useEffect, useState, useMemo } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { 
  getChapterTitle, 
  getChapterHeadings, 
  getChapterAnnotations,
  getMarkingPreset,
  getAllObservationLists,
} from '@/lib/database';
import type { ChapterTitle, SectionHeading } from '@/types/annotation';
import { SYMBOLS } from '@/types/annotation';
import type { MarkingPreset } from '@/types/keyWord';
import type { ObservationList } from '@/types/list';
import { getBookById } from '@/types/bible';

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
  onEditTheme?: () => void; // For opening theme editor in ObservationToolsPanel
}

export function ChapterAtAGlance({ onObservationClick, onOpenObservationTools, onEditTheme }: ChapterAtAGlanceProps = {}) {
  const { currentBook, currentChapter, currentModuleId } = useBibleStore();
  const { activeView } = useMultiTranslationStore();
  const { presets } = useMarkingPresetStore();
  
  // Get the primary translation ID (first valid one) for section headings, chapter titles
  const primaryTranslationId = activeView?.translationIds[0] || currentModuleId || null;
  
  const [summary, setSummary] = useState<ChapterSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  const bookInfo = useMemo(() => getBookById(currentBook), [currentBook]);
  
  useEffect(() => {
    async function loadSummary() {
      if (!primaryTranslationId || !currentBook || !currentChapter) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      
      try {
        // Load chapter title (translation-agnostic)
        const title = await getChapterTitle(null, currentBook, currentChapter);
        
        // Load section headings (translation-agnostic)
        const headings = await getChapterHeadings(null, currentBook, currentChapter);
        
        // Load annotations to find keywords used
        const annotations = await getChapterAnnotations(primaryTranslationId, currentBook, currentChapter);
        
        // Group annotations by presetId to count keyword usage
        const keywordMap = new Map<string, { preset: MarkingPreset | null; count: number }>();
        
        for (const ann of annotations) {
          if (ann.presetId) {
            const existing = keywordMap.get(ann.presetId);
            if (existing) {
              existing.count++;
            } else {
              const preset = await getMarkingPreset(ann.presetId);
              if (preset && preset.word) {
                keywordMap.set(ann.presetId, { preset, count: 1 });
              }
            }
          }
        }
        
        // Convert to array and filter out null presets
        const keywords = Array.from(keywordMap.values())
          .filter(item => item.preset !== null)
          .map(item => ({ preset: item.preset!, count: item.count }))
          .sort((a, b) => b.count - a.count); // Sort by count descending
        
        // Load observation lists and filter by chapter
        const allLists = await getAllObservationLists();
        const observations = allLists
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
  }, [primaryTranslationId, currentBook, currentChapter]);
  
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
      {title && (
        <div className="pb-3 border-b border-scripture-border/50">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm text-scripture-muted">Chapter Title</div>
            <button
              onClick={() => {
                if (onEditTheme) {
                  onEditTheme();
                } else {
                  // Dispatch custom event to open ObservationToolsPanel with theme tab
                  window.dispatchEvent(new CustomEvent('openObservationTools', { 
                    detail: { tab: 'theme' } 
                  }));
                }
              }}
              className="text-xs text-scripture-accent hover:text-scripture-accent/80 transition-colors"
              title="Edit theme in Observation Tools"
            >
              Edit Theme →
            </button>
          </div>
          <div className="text-scripture-text font-medium">{title.title}</div>
        </div>
      )}
      
      {/* Chapter Theme */}
      {theme && (
        <div className="pb-3 border-b border-scripture-border/50">
          <div className="flex items-center justify-between mb-1">
            <div className="text-sm text-scripture-muted">Chapter Theme</div>
            <button
              onClick={() => {
                if (onEditTheme) {
                  onEditTheme();
                } else {
                  // Dispatch custom event to open ObservationToolsPanel with theme tab
                  window.dispatchEvent(new CustomEvent('openObservationTools', { 
                    detail: { tab: 'theme' } 
                  }));
                }
              }}
              className="text-xs text-scripture-accent hover:text-scripture-accent/80 transition-colors"
              title="Edit theme in Observation Tools"
            >
              Edit →
            </button>
          </div>
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
        </div>
      )}
      
      {/* Theme prompt if no theme exists */}
      {!theme && title && (
        <div className="pb-3 border-b border-scripture-border/50">
          <div className="flex items-center justify-between">
            <div className="text-sm text-scripture-muted">Chapter Theme</div>
            <button
              onClick={() => {
                if (onEditTheme) {
                  onEditTheme();
                } else {
                  // Dispatch custom event to open ObservationToolsPanel with theme tab
                  window.dispatchEvent(new CustomEvent('openObservationTools', { 
                    detail: { tab: 'theme' } 
                  }));
                }
              }}
              className="text-xs text-scripture-accent hover:text-scripture-accent/80 transition-colors"
              title="Add theme in Observation Tools"
            >
              Add Theme →
            </button>
          </div>
          <div className="text-xs text-scripture-muted italic mt-1">No theme recorded yet</div>
        </div>
      )}
      
      {/* Section Headings */}
      {headings.length > 0 && (
        <div className="pb-3 border-b border-scripture-border/50">
          <div className="text-sm text-scripture-muted mb-2">Section Headings</div>
          <div className="space-y-1">
            {headings.map(heading => {
              const verseRange = heading.coversUntil
                ? `${heading.beforeRef.verse}${heading.coversUntil.verse !== heading.beforeRef.verse ? `-${heading.coversUntil.verse}` : ''}`
                : `${heading.beforeRef.verse}+`;
              
              return (
                <div key={heading.id} className="flex items-start gap-2 text-sm">
                  <span className="text-scripture-muted font-mono text-xs">
                    v{verseRange}
                  </span>
                  <button
                    onClick={() => {
                      // Scroll to section heading in verse view
                      setTimeout(() => {
                        const sectionHeadingElement = document.querySelector(`[data-section-heading="${heading.id}"]`) as HTMLElement;
                        if (sectionHeadingElement) {
                          sectionHeadingElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }, 100);
                    }}
                    className="text-scripture-text hover:text-scripture-accent transition-colors bg-transparent border-none p-0 cursor-pointer text-left"
                  >
                    {heading.title}
                  </button>
                </div>
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
                  <span className="text-base">{preset.symbol}</span>
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
