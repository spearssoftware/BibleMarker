/**
 * Theme Editor Component
 * 
 * Component for editing chapter themes with keyword integration.
 */

import { useState, useEffect, useMemo } from 'react';
import { useBibleStore } from '@/stores/bibleStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { getChapterTitle, saveChapterTitle } from '@/lib/database';
import { analyzeKeywordFrequencyByChapter } from '@/lib/annotationQueries';
import type { ChapterTitle } from '@/types/annotation';
import { SYMBOLS } from '@/types/annotation';
import type { MarkingPreset } from '@/types/keyWord';
import { getBookById } from '@/types/bible';
import { Textarea, Checkbox } from '@/components/shared';

interface ThemeEditorProps {
  selectedText?: string;
  verseRef?: { book: string; chapter: number; verse: number };
}

export function ThemeEditor({ verseRef }: ThemeEditorProps) {
  const { currentBook, currentChapter, currentModuleId } = useBibleStore();
  const { activeView } = useMultiTranslationStore();
  const { presets } = useMarkingPresetStore();
  
  // Get the primary translation ID
  const primaryTranslationId = activeView?.translationIds[0] || currentModuleId || null;
  
  // Use provided verseRef or current location
  const book = verseRef?.book || currentBook;
  const chapter = verseRef?.chapter || currentChapter;
  
  const [chapterTitle, setChapterTitle] = useState<ChapterTitle | null>(null);
  const [theme, setTheme] = useState('');
  const [supportingPresetIds, setSupportingPresetIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [keywordSuggestions, setKeywordSuggestions] = useState<Array<{ presetId: string; word: string; count: number }>>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [syncWithTitle, setSyncWithTitle] = useState(false);
  
  const bookInfo = useMemo(() => getBookById(book), [book]);
  
  // Load chapter title and theme
  useEffect(() => {
    async function loadTheme() {
      if (!book || !chapter) {
        setIsLoading(false);
        return;
      }
      
      setIsLoading(true);
      try {
        const title = await getChapterTitle(null, book, chapter);
        if (title) {
          setChapterTitle(title);
          // If theme is empty but title exists, check if they should be synced
          const themeValue = title.theme || '';
          setTheme(themeValue);
          setSupportingPresetIds(title.supportingPresetIds || []);
          // Auto-enable sync if theme matches title
          setSyncWithTitle(themeValue === title.title);
        } else {
          setChapterTitle(null);
          setTheme('');
          setSupportingPresetIds([]);
          setSyncWithTitle(false);
        }
      } catch (error) {
        console.error('Error loading theme:', error);
      } finally {
        setIsLoading(false);
      }
    }
    
    loadTheme();
  }, [book, chapter]);
  
  // Load keyword suggestions for theme
  useEffect(() => {
    async function loadSuggestions() {
      if (!primaryTranslationId || !book || !chapter) {
        setKeywordSuggestions([]);
        return;
      }
      
      setIsLoadingSuggestions(true);
      try {
        const suggestions = await analyzeKeywordFrequencyByChapter(
          primaryTranslationId,
          book,
          chapter
        );
        // Show top 10 most frequent keywords
        setKeywordSuggestions(suggestions.slice(0, 10));
      } catch (error) {
        console.error('Error loading keyword suggestions:', error);
      } finally {
        setIsLoadingSuggestions(false);
      }
    }
    
    loadSuggestions();
  }, [primaryTranslationId, book, chapter]);
  
  const handleSave = async () => {
    if (!book || !chapter) return;
    
    setIsSaving(true);
    try {
      const now = new Date();
      const titleData: ChapterTitle = chapterTitle || {
        id: `chapter-title-${book}-${chapter}`,
        book,
        chapter,
        title: `${bookInfo?.name || book} ${chapter}`,
        createdAt: now,
        updatedAt: now,
      };
      
      // If sync is enabled, use title as theme
      const themeValue = syncWithTitle ? titleData.title : theme.trim();
      
      const updatedTitle: ChapterTitle = {
        ...titleData,
        theme: themeValue || undefined,
        supportingPresetIds: supportingPresetIds.length > 0 ? supportingPresetIds : undefined,
        updatedAt: new Date(),
      };
      
      await saveChapterTitle(updatedTitle);
      setChapterTitle(updatedTitle);
      // Update theme state if syncing
      if (syncWithTitle) {
        setTheme(titleData.title);
      }
    } catch (error) {
      console.error('Error saving theme:', error);
      alert('Failed to save theme. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };
  
  const handleCopyFromTitle = () => {
    if (chapterTitle?.title) {
      setTheme(chapterTitle.title);
      setSyncWithTitle(true);
    }
  };
  
  // Update theme when sync is enabled and title changes
  useEffect(() => {
    if (syncWithTitle && chapterTitle?.title) {
      setTheme(chapterTitle.title);
    }
  }, [syncWithTitle, chapterTitle?.title]);
  
  const handleDelete = async () => {
    if (!chapterTitle) return;
    
    if (confirm('Are you sure you want to delete the theme for this chapter?')) {
      try {
        const updatedTitle: ChapterTitle = {
          ...chapterTitle,
          theme: undefined,
          supportingPresetIds: undefined,
          updatedAt: new Date(),
        };
        await saveChapterTitle(updatedTitle);
        setChapterTitle(updatedTitle);
        setTheme('');
        setSupportingPresetIds([]);
      } catch (error) {
        console.error('Error deleting theme:', error);
        alert('Failed to delete theme. Please try again.');
      }
    }
  };
  
  const togglePreset = (presetId: string) => {
    setSupportingPresetIds(prev => {
      if (prev.includes(presetId)) {
        return prev.filter(id => id !== presetId);
      } else {
        return [...prev, presetId];
      }
    });
  };
  
  const getPreset = (presetId: string): MarkingPreset | undefined => {
    return presets.find(p => p.id === presetId);
  };
  
  if (isLoading) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
        <div className="flex items-center justify-center gap-3 py-8">
          <div className="w-6 h-6 border-2 border-scripture-border border-t-scripture-accent rounded-full animate-spin"></div>
          <div className="text-scripture-muted text-sm">Loading theme...</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-semibold text-scripture-text mb-2">
            Chapter Theme: {bookInfo?.name || book} {chapter}
          </h3>
          <p className="text-sm text-scripture-muted mb-4">
            Record the main theme or message of this chapter. Use words from the text when possible.
          </p>
        </div>
        
        {/* Theme Input */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-scripture-text">
              Theme Statement
            </label>
            {chapterTitle?.title && (
              <button
                onClick={handleCopyFromTitle}
                className="text-xs text-scripture-accent hover:text-scripture-accent/80 transition-colors"
                title="Copy chapter title to theme"
              >
                Copy from Title
              </button>
            )}
          </div>
          <Textarea
            value={theme}
            onChange={(e) => {
              setTheme(e.target.value);
              // Disable sync if user manually edits theme
              if (syncWithTitle && e.target.value !== chapterTitle?.title) {
                setSyncWithTitle(false);
              }
            }}
            placeholder="Enter the main theme or message of this chapter..."
            rows={4}
            className="w-full"
            disabled={syncWithTitle}
          />
          {chapterTitle?.title && (
            <div className="mt-2">
              <label className="flex items-center gap-2 text-sm text-scripture-text cursor-pointer">
                <Checkbox
                  checked={syncWithTitle}
                  onChange={(e) => {
                    setSyncWithTitle(e.target.checked);
                    if (e.target.checked) {
                      setTheme(chapterTitle.title);
                    }
                  }}
                />
                <span>Sync with chapter title: "{chapterTitle.title}"</span>
              </label>
              <p className="text-xs text-scripture-muted mt-1 ml-6">
                When enabled, the theme will automatically match the chapter title.
              </p>
            </div>
          )}
        </div>
        
        {/* Keyword Suggestions */}
        {isLoadingSuggestions ? (
          <div className="text-sm text-scripture-muted">Loading keyword suggestions...</div>
        ) : keywordSuggestions.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-scripture-text mb-2">
              Suggested Keywords (based on frequency in this chapter)
            </label>
            <div className="flex flex-wrap gap-2 mb-2">
              {keywordSuggestions.map(({ presetId, word, count }) => {
                const preset = getPreset(presetId);
                const isSelected = supportingPresetIds.includes(presetId);
                
                return (
                  <button
                    key={presetId}
                    onClick={() => togglePreset(presetId)}
                    className={`
                      inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all
                      ${isSelected
                        ? 'bg-scripture-accent text-scripture-bg'
                        : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'
                      }
                    `}
                  >
                    {preset?.symbol && (
                      <span className="text-base">{SYMBOLS[preset.symbol]}</span>
                    )}
                    {preset?.highlight && (
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
                    <span>{word}</span>
                    <span className="text-xs opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-scripture-muted">
              Click keywords to link them to this theme. These keywords support the theme statement above.
            </p>
          </div>
        )}
        
        {/* Selected Supporting Keywords */}
        {supportingPresetIds.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-scripture-text mb-2">
              Supporting Keywords
            </label>
            <div className="flex flex-wrap gap-2">
              {supportingPresetIds.map(presetId => {
                const preset = getPreset(presetId);
                if (!preset) return null;
                
                return (
                  <div
                    key={presetId}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-scripture-accent/20 text-scripture-text rounded-lg text-sm"
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
                    <span>{preset.word}</span>
                    <button
                      onClick={() => togglePreset(presetId)}
                      className="ml-1 text-scripture-muted hover:text-scripture-text"
                      title="Remove keyword"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        
        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-4 border-t border-scripture-border/50">
          <button
            onClick={handleSave}
            disabled={isSaving || !theme.trim()}
            className="px-4 py-2 bg-scripture-accent text-white rounded-lg hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? 'Saving...' : 'Save Theme'}
          </button>
          {chapterTitle?.theme && (
            <button
              onClick={handleDelete}
              className="px-4 py-2 bg-scripture-muted/20 text-scripture-text rounded-lg hover:bg-scripture-muted/30 transition-colors"
            >
              Clear Theme
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
