/**
 * Time Expression Tracker
 * 
 * Component for recording and displaying chronological sequences and time references.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useTimeStore } from '@/stores/timeStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useStudyStore } from '@/stores/studyStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { getCachedChapter } from '@/lib/database';
import type { TimeExpression } from '@/types/timeExpression';
import type { VerseRef } from '@/types/bible';
import { formatVerseRef, getBookById } from '@/types/bible';
import { ConfirmationDialog, Input, Textarea, Checkbox } from '@/components/shared';

function highlightWords(text: string, words: string[]): React.ReactNode {
  const filtered = words.filter(w => w.trim());
  if (!filtered.length || !text) return text;
  const escaped = filtered.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  escaped.sort((a, b) => b.length - a.length);
  const pattern = new RegExp(escaped.join('|'), 'gi');
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const idx = match.index!;
    if (idx > lastIndex) result.push(text.slice(lastIndex, idx));
    result.push(
      <mark key={idx} className="bg-scripture-accent/25 text-scripture-text rounded-sm px-0.5 not-italic font-medium">{match[0]}</mark>
    );
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) result.push(text.slice(lastIndex));
  return result.length > 0 ? <>{result}</> : text;
}

interface TimeTrackerProps {
  selectedText?: string;
  verseRef?: VerseRef;
  filterByChapter?: boolean;
  onFilterByChapterChange?: (value: boolean) => void;
  onNavigate?: (verseRef: VerseRef) => void;
}

// Helper to create a unique key for a verse reference
const getVerseKey = (ref: VerseRef): string => {
  return `${ref.book}:${ref.chapter}:${ref.verse}`;
};

// Group time expressions by verse
const groupByVerse = (timeExpressions: TimeExpression[]): Map<string, TimeExpression[]> => {
  const map = new Map<string, TimeExpression[]>();
  timeExpressions.forEach(timeExpression => {
    const key = getVerseKey(timeExpression.verseRef);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(timeExpression);
  });
  return map;
};

// Group time expressions by keyword (presetId), with "Manual" for items without presetId
function groupByKeyword(
  items: TimeExpression[],
  presetMap: Map<string, { word?: string }>
): Array<{ key: string; label: string; items: TimeExpression[] }> {
  const byKey = new Map<string, TimeExpression[]>();
  for (const item of items) {
    const key = item.presetId || 'manual';
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(item);
  }
  return Array.from(byKey.entries()).map(([key, keywordItems]) => {
    const label = key === 'manual' ? 'Manual' : (presetMap.get(key)?.word ?? 'Unknown');
    return { key, label, items: keywordItems };
  });
}

// Sort keyword groups by label (Manual last), then by earliest verse
function sortKeywordGroups(
  groups: Array<{ key: string; label: string; items: TimeExpression[] }>
): Array<{ key: string; label: string; items: TimeExpression[] }> {
  return [...groups].sort((a, b) => {
    if (a.key === 'manual' && b.key !== 'manual') return 1;
    if (b.key === 'manual' && a.key !== 'manual') return -1;
    const nameCmp = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    const minVerse = (items: TimeExpression[]) => {
      if (items.length === 0) return '';
      const keys = items.map(t => getVerseKey(t.verseRef));
      keys.sort((ka, kb) => {
        const [bookA, chA, vA] = ka.split(':');
        const [bookB, chB, vB] = kb.split(':');
        const ordA = getBookById(bookA)?.order ?? 999;
        const ordB = getBookById(bookB)?.order ?? 999;
        if (ordA !== ordB) return ordA - ordB;
        if (parseInt(chA, 10) !== parseInt(chB, 10)) return parseInt(chA, 10) - parseInt(chB, 10);
        return parseInt(vA, 10) - parseInt(vB, 10);
      });
      return keys[0];
    };
    return minVerse(a.items).localeCompare(minVerse(b.items));
  });
}

// Sort verse groups by canonical order
const sortVerseGroups = (groups: Map<string, TimeExpression[]>): Array<[string, TimeExpression[]]> => {
  return Array.from(groups.entries()).sort(([keyA], [keyB]) => {
    const [bookA, chapterA, verseA] = keyA.split(':');
    const [bookB, chapterB, verseB] = keyB.split(':');
    
    const bookInfoA = getBookById(bookA);
    const bookInfoB = getBookById(bookB);
    
    if (bookInfoA && bookInfoB && bookInfoA.order !== bookInfoB.order) {
      return bookInfoA.order - bookInfoB.order;
    }
    
    if (!bookInfoA && !bookInfoB) return 0;
    if (!bookInfoA) return 1;
    if (!bookInfoB) return -1;
    
    const chapterANum = parseInt(chapterA, 10);
    const chapterBNum = parseInt(chapterB, 10);
    if (chapterANum !== chapterBNum) {
      return chapterANum - chapterBNum;
    }
    
    const verseANum = parseInt(verseA, 10);
    const verseBNum = parseInt(verseB, 10);
    return verseANum - verseBNum;
  });
};

const getChapterKey = (ref: VerseRef): string => `${ref.book}:${ref.chapter}`;

interface ChapterGroup {
  key: string;
  book: string;
  chapter: number;
  items: TimeExpression[];
  years: Array<{ year: number; era: 'BC' | 'AD' }>;
}

function groupByChapter(items: TimeExpression[]): ChapterGroup[] {
  const byKey = new Map<string, TimeExpression[]>();
  for (const item of items) {
    const key = getChapterKey(item.verseRef);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(item);
  }
  const groups: ChapterGroup[] = [];
  for (const [key, chapterItems] of byKey) {
    const [book, chStr] = key.split(':');
    const yearSet = new Map<string, { year: number; era: 'BC' | 'AD' }>();
    for (const item of chapterItems) {
      if (item.year != null && item.yearEra) {
        const yk = `${item.year}-${item.yearEra}`;
        if (!yearSet.has(yk)) yearSet.set(yk, { year: item.year, era: item.yearEra });
      }
    }
    const years = Array.from(yearSet.values()).sort((a, b) => {
      const numA = (a.era === 'BC' ? -1 : 1) * a.year;
      const numB = (b.era === 'BC' ? -1 : 1) * b.year;
      return numA - numB;
    });
    groups.push({ key, book, chapter: parseInt(chStr, 10), items: chapterItems, years });
  }
  return groups.sort((a, b) => {
    const ordA = getBookById(a.book)?.order ?? 999;
    const ordB = getBookById(b.book)?.order ?? 999;
    if (ordA !== ordB) return ordA - ordB;
    return a.chapter - b.chapter;
  });
}

function formatChapterYears(years: Array<{ year: number; era: 'BC' | 'AD' }>): string {
  if (years.length === 0) return '';
  if (years.length === 1) return `${years[0].year} ${years[0].era}`;
  return years.map(y => `${y.year} ${y.era}`).join(', ');
}

export function TimeTracker({ selectedText, verseRef: initialVerseRef, filterByChapter = true, onFilterByChapterChange, onNavigate }: TimeTrackerProps) {
  const { timeExpressions, loadTimeExpressions, createTimeExpression, updateTimeExpression, deleteTimeExpression, autoImportFromAnnotations, removeDuplicates, autoPopulateFromChapter } = useTimeStore();
  const { currentBook, currentChapter } = useBibleStore();
  const [isPopulating, setIsPopulating] = useState(false);
  const { activeStudyId } = useStudyStore();
  const { presets } = useMarkingPresetStore();
  const presetMap = useMemo(() => new Map(presets.map(p => [p.id, { word: p.word }])), [presets]);
  const [expandedKeywords, setExpandedKeywords] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newExpression, setNewExpression] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [newYear, setNewYear] = useState<number | ''>('');
  const [newYearEra, setNewYearEra] = useState<'BC' | 'AD'>('AD');
  const [editingExpression, setEditingExpression] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [editingYear, setEditingYear] = useState<number | ''>('');
  const [editingYearEra, setEditingYearEra] = useState<'BC' | 'AD'>('AD');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [addingObservationToId, setAddingObservationToId] = useState<string | null>(null);
  const [newObservation, setNewObservation] = useState('');
  const [verseTexts, setVerseTexts] = useState<Map<string, string>>(new Map());
  const { activeView } = useMultiTranslationStore();
  const primaryModuleId = activeView?.translationIds[0] || '';

  const handlePopulateFromChapter = async () => {
    if (!currentBook || !currentChapter || !primaryModuleId || isPopulating) return;
    setIsPopulating(true);
    try {
      const count = await autoPopulateFromChapter(currentBook, currentChapter, primaryModuleId);
      await loadTimeExpressions();
      if (count > 0) alert(`Added ${count} time expression(s) from chapter.`);
    } catch (e) {
      console.error('[TimeTracker] Populate failed:', e);
    } finally {
      setIsPopulating(false);
    }
  };

  // Determine verse reference - use provided one, or current location
  const getCurrentVerseRef = (): VerseRef | null => {
    if (initialVerseRef) return initialVerseRef;
    // Use current location from bible store, default to verse 1 if no verse selected
    if (currentBook && currentChapter) {
      return {
        book: currentBook,
        chapter: currentChapter,
        verse: 1, // Default to verse 1 if no specific verse
      };
    }
    return null;
  };

  // Track if we've already run initialization to prevent duplicates
  const hasInitialized = useRef(false);
  
  // Load time expressions on mount, clean up duplicates, and auto-import from annotations
  useEffect(() => {
    let isMounted = true;
    
    const initialize = async () => {
      await loadTimeExpressions();
      // Only run cleanup and auto-import once per mount
      if (!hasInitialized.current && isMounted) {
        hasInitialized.current = true;
        
        // Clean up any existing duplicates first
        const removedCount = await removeDuplicates();
        if (removedCount > 0 && isMounted) {
          console.log(`[TimeTracker] Removed ${removedCount} duplicate time expressions`);
        }
        
        // Auto-import existing keyword annotations with time symbols
        try {
          const importedCount = await autoImportFromAnnotations();
          if (importedCount > 0 && isMounted) {
            // Reload after import
            await loadTimeExpressions();
          }
        } catch (error) {
          if (isMounted) {
            console.error('[TimeTracker] Auto-import failed:', error);
          }
        }
      }
    };
    initialize();
    
    return () => {
      isMounted = false;
    };
  }, [loadTimeExpressions, autoImportFromAnnotations, removeDuplicates]);

  // Pre-fill form if selectedText is provided
  useEffect(() => {
    if (selectedText && isCreating && !newExpression) {
      // Pre-fill with selected text
      queueMicrotask(() => setNewExpression(selectedText.trim()));
    }
  }, [selectedText, isCreating, newExpression]);

  // Smart default for year era when creating: OT → BC, NT → AD
  const defaultYearEra = useMemo((): 'BC' | 'AD' => {
    if (!currentBook) return 'AD';
    const book = getBookById(currentBook);
    return book?.testament === 'OT' ? 'BC' : 'AD';
  }, [currentBook]);

  useEffect(() => {
    if (isCreating) setNewYearEra(defaultYearEra);
  }, [isCreating, defaultYearEra]);

  const handleCreate = async () => {
    const verseRef = getCurrentVerseRef();
    if (!verseRef || !newExpression.trim()) {
      alert('Please fill in the time expression and ensure you have a verse reference.');
      return;
    }

    const yearVal = newYear === '' ? undefined : newYear;
    await createTimeExpression(
      newExpression.trim(),
      verseRef,
      newNotes.trim() || undefined,
      undefined, // presetId - manual entry, no preset
      undefined, // annotationId - manual entry, no annotation
      undefined, // timeOrder - will be assigned if needed
      undefined, // studyId
      yearVal,
      yearVal !== undefined ? newYearEra : undefined
    );

    setIsCreating(false);
    setNewExpression('');
    setNewNotes('');
    setNewYear('');
    loadTimeExpressions();
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewExpression('');
    setNewNotes('');
    setNewYear('');
  };

  const handleStartEdit = (timeExpression: TimeExpression) => {
    setEditingId(timeExpression.id);
    setEditingExpression(timeExpression.expression);
    setEditingNotes(timeExpression.notes || '');
    setEditingYear(timeExpression.year ?? '');
    setEditingYearEra(timeExpression.yearEra ?? defaultYearEra);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingExpression('');
    setEditingNotes('');
    setEditingYear('');
  };

  const handleSaveEdit = async (timeExpressionId: string) => {
    if (!editingExpression.trim()) {
      alert('Time expression is required.');
      return;
    }

    const timeExpression = timeExpressions.find(t => t.id === timeExpressionId);
    if (!timeExpression) return;

    const yearVal = editingYear === '' ? undefined : editingYear;
    await updateTimeExpression({
      ...timeExpression,
      expression: editingExpression.trim(),
      notes: editingNotes.trim() || undefined,
      year: yearVal,
      yearEra: yearVal !== undefined ? editingYearEra : undefined,
    });

    setEditingId(null);
    setEditingExpression('');
    setEditingNotes('');
    setEditingYear('');
    loadTimeExpressions();
  };

  const handleDeleteClick = (timeExpressionId: string) => {
    setConfirmDeleteId(timeExpressionId);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;

    const idToDelete = confirmDeleteId;
    setConfirmDeleteId(null);

    await deleteTimeExpression(idToDelete);
    loadTimeExpressions();
  };

  const handleCancelDelete = () => {
    setConfirmDeleteId(null);
  };

  const handleAddObservation = async (timeExpressionId: string) => {
    if (!newObservation.trim()) return;
    const te = timeExpressions.find(t => t.id === timeExpressionId);
    if (!te) return;
    const existingNotes = te.notes ? te.notes + '\n' : '';
    await updateTimeExpression({ ...te, notes: existingNotes + newObservation.trim() });
    setAddingObservationToId(null);
    setNewObservation('');
    loadTimeExpressions();
  };

  // Filter time expressions by chapter and study
  const filteredTimeExpressions = useMemo(() => {
    let filtered = timeExpressions;
    // Filter by active study
    if (activeStudyId) {
      filtered = filtered.filter(t => !t.studyId || t.studyId === activeStudyId);
    }
    // Filter by chapter
    if (filterByChapter) {
      filtered = filtered.filter(t => 
        t.verseRef.book === currentBook && t.verseRef.chapter === currentChapter
      );
    }
    return filtered;
  }, [timeExpressions, filterByChapter, currentBook, currentChapter, activeStudyId]);

  // Load verse texts when filtered items change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!primaryModuleId) return;
      const chapterCache = new Map<string, Record<number, string>>();
      const newTexts = new Map<string, string>();
      for (const item of filteredTimeExpressions) {
        const cacheKey = `${item.verseRef.book}:${item.verseRef.chapter}`;
        if (!chapterCache.has(cacheKey)) {
          const cached = await getCachedChapter(primaryModuleId, item.verseRef.book, item.verseRef.chapter);
          if (cached?.verses) chapterCache.set(cacheKey, cached.verses);
        }
        const verses = chapterCache.get(cacheKey);
        if (verses) {
          const text = verses[item.verseRef.verse] || '';
          newTexts.set(getVerseKey(item.verseRef), text);
        }
      }
      if (!cancelled) setVerseTexts(newTexts);
    })();
    return () => { cancelled = true; };
  }, [filteredTimeExpressions, primaryModuleId]);

  const keywordGroups = useMemo(() => {
    const grouped = groupByKeyword(filteredTimeExpressions, presetMap);
    return sortKeywordGroups(grouped);
  }, [filteredTimeExpressions, presetMap]);

  // Timeline: entries with year/yearEra, sorted chronologically (BC before AD)
  const timelineEntries = useMemo(() => {
    const withYear = filteredTimeExpressions.filter(t => t.year != null && t.yearEra);
    if (withYear.length === 0) return [];
    return [...withYear].sort((a, b) => {
      const numA = (a.yearEra === 'BC' ? -1 : 1) * (a.year ?? 0);
      const numB = (b.yearEra === 'BC' ? -1 : 1) * (b.year ?? 0);
      return numA - numB;
    });
  }, [filteredTimeExpressions]);

  const toggleKeyword = (key: string) => {
    setExpandedKeywords(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleChapter = (keywordKey: string, chapterKey: string) => {
    const compositeKey = `${keywordKey}::${chapterKey}`;
    setExpandedChapters(prev => {
      const next = new Set(prev);
      if (next.has(compositeKey)) next.delete(compositeKey);
      else next.add(compositeKey);
      return next;
    });
  };

  return (
    <>
      <ConfirmationDialog
        isOpen={confirmDeleteId !== null}
        title="Delete Time Expression"
        message="Are you sure you want to delete this time expression? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        destructive={true}
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
      {/* Timeline at top - when any time expressions have year set */}
      {timelineEntries.length > 0 && (
        <div className="mb-4 overflow-x-auto custom-scrollbar">
          <div className="flex gap-4 min-w-max py-2 px-2 bg-scripture-surface rounded-lg border border-scripture-border/30">
            {timelineEntries.map((te) => (
              <div
                key={te.id}
                className="flex flex-col items-center shrink-0 min-w-[4rem]"
              >
                <span className="text-xs font-medium text-scripture-text">
                  {te.year} {te.yearEra}
                </span>
                <span className="text-[10px] text-scripture-muted mt-0.5">—</span>
                {onNavigate ? (
                  <button
                    onClick={() => onNavigate(te.verseRef)}
                    className="text-xs text-scripture-accent hover:text-scripture-accent/80 underline cursor-pointer mt-0.5"
                    title="Navigate to verse"
                  >
                    {formatVerseRef(te.verseRef.book, te.verseRef.chapter, te.verseRef.verse)}
                  </button>
                ) : (
                  <span className="text-xs text-scripture-accent mt-0.5">
                    {formatVerseRef(te.verseRef.book, te.verseRef.chapter, te.verseRef.verse)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      {/* Create new time expression button and Current Chapter Only */}
      {!isCreating && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsCreating(true)}
            className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
          >
            + New Time Expression
          </button>
          {currentBook && currentChapter && (
            <button
              onClick={handlePopulateFromChapter}
              disabled={isPopulating || !primaryModuleId}
              className="px-3 py-1.5 text-sm bg-scripture-elevated text-scripture-text rounded hover:bg-scripture-border/50 transition-colors disabled:opacity-50"
            >
              {isPopulating ? '...' : 'Populate from Chapter'}
            </button>
          )}
          {onFilterByChapterChange && (
            <Checkbox
              label="Current Chapter Only"
              checked={filterByChapter}
              onChange={(e) => onFilterByChapterChange(e.target.checked)}
            />
          )}
        </div>
      )}

      {/* Create form */}
      {isCreating && (
        <div className="mb-4 p-4 bg-scripture-surface rounded-xl border border-scripture-border/50">
          <h3 className="text-sm font-medium text-scripture-text mb-3">New Time Expression</h3>
          <div className="space-y-3">
            <Input
              label="Time Expression"
              type="text"
              value={newExpression}
              onChange={(e) => setNewExpression(e.target.value)}
              placeholder="e.g., 'in the morning', 'three days later', 'on the third day'"
              autoFocus
            />
            <Textarea
              label="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Additional notes about this time expression"
              rows={2}
            />
            <div className="space-y-2">
              <label className="text-xs font-medium text-scripture-muted">Year (optional)</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={newYear}
                  onChange={(e) => setNewYear(e.target.value === '' ? '' : parseInt(e.target.value, 10) || '')}
                  placeholder="e.g., 233, 586, 33"
                  className="w-24 px-2 py-1.5 text-sm bg-scripture-surface border border-scripture-border/50 rounded text-scripture-text focus:outline-none focus:ring-2 focus:ring-scripture-accent"
                />
                <label className="flex items-center gap-1.5 text-sm text-scripture-text cursor-pointer">
                  <input
                    type="radio"
                    name="newYearEra"
                    checked={newYearEra === 'BC'}
                    onChange={() => setNewYearEra('BC')}
                    className="accent-scripture-accent"
                  />
                  BC
                </label>
                <label className="flex items-center gap-1.5 text-sm text-scripture-text cursor-pointer">
                  <input
                    type="radio"
                    name="newYearEra"
                    checked={newYearEra === 'AD'}
                    onChange={() => setNewYearEra('AD')}
                    className="accent-scripture-accent"
                  />
                  AD
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={!newExpression.trim() || !getCurrentVerseRef()}
                className="px-3 py-1.5 text-xs bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Save
              </button>
              <button
                onClick={handleCancelCreate}
                className="px-3 py-1.5 text-xs bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
              >
                Cancel
              </button>
            </div>
            {!getCurrentVerseRef() && (
              <p className="text-xs text-scripture-muted">
                Note: Verse reference will use current location or selected verse.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {timeExpressions.length === 0 && !isCreating && (
        <div className="text-center py-12">
          <p className="text-scripture-muted text-sm mb-4">No time expressions recorded yet.</p>
          <p className="text-scripture-muted text-xs mb-4">
            Record time expressions and chronological sequences you observe in the text. Use the 🕐, 📅, or ⏳ symbols to mark time references, then add details here.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
          >
            Create Your First Time Expression
          </button>
        </div>
      )}

      {/* Time expressions list - grouped by keyword then chapter */}
      {filteredTimeExpressions.length > 0 && (
        <div className="space-y-4">
          {keywordGroups.map(({ key, label, items: keywordItems }) => {
            const isExpanded = expandedKeywords.has(key);
            const chapterGroups = groupByChapter(keywordItems);

            return (
              <div key={key} className="bg-scripture-surface rounded-xl border border-scripture-border/50 overflow-hidden">
                <button
                  onClick={() => toggleKeyword(key)}
                  className="w-full p-4 text-left flex items-center gap-2 hover:bg-scripture-elevated/50 transition-colors"
                >
                  <span className="text-xs text-scripture-muted shrink-0" aria-hidden="true">
                    {isExpanded ? '▼' : '▶'}
                  </span>
                  <h3 className="font-medium text-scripture-text">{label}</h3>
                  <span className="text-xs text-scripture-muted bg-scripture-elevated px-2 py-0.5 rounded">
                    {keywordItems.length} {keywordItems.length === 1 ? 'entry' : 'entries'}
                  </span>
                </button>
                {isExpanded && (
                  <div className="border-t border-scripture-border/30 p-3 space-y-2">
                    {chapterGroups.map((chGroup) => {
                      const chapterExpanded = expandedChapters.has(`${key}::${chGroup.key}`);
                      const bookInfo = getBookById(chGroup.book);
                      const chapterLabel = bookInfo ? `${bookInfo.name} ${chGroup.chapter}` : `${chGroup.book} ${chGroup.chapter}`;
                      const yearLabel = formatChapterYears(chGroup.years);
                      const verseGroups = groupByVerse(chGroup.items);
                      const sortedVerseGroups = sortVerseGroups(verseGroups);

                      return (
                        <div key={chGroup.key} className="bg-scripture-bg/30 rounded-lg border border-scripture-border/20 overflow-hidden">
                          <button
                            onClick={() => toggleChapter(key, chGroup.key)}
                            className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-scripture-elevated/30 transition-colors"
                          >
                            <span className="text-xs text-scripture-muted shrink-0" aria-hidden="true">
                              {chapterExpanded ? '▼' : '▶'}
                            </span>
                            <span className="text-sm font-medium text-scripture-text">{chapterLabel}</span>
                            {yearLabel && (
                              <span className="text-xs text-scripture-accent bg-scripture-accent/10 px-1.5 py-0.5 rounded">
                                {yearLabel}
                              </span>
                            )}
                            <span className="text-xs text-scripture-muted">
                              {chGroup.items.length} {chGroup.items.length === 1 ? 'expression' : 'expressions'}
                            </span>
                          </button>
                          {chapterExpanded && (
                            <div className="border-t border-scripture-border/20 p-2 space-y-2">
                              {sortedVerseGroups.map(([verseKey, verseTimeExpressions]) => {
                                const verseRef = verseTimeExpressions[0].verseRef;
                                const verseSnippet = verseTexts.get(verseKey);

                                return (
                                  <div key={verseKey} className="bg-scripture-bg/50 rounded-lg border border-scripture-border/30 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                      {onNavigate ? (
                                        <button
                                          onClick={() => onNavigate(verseRef)}
                                          className="text-sm font-medium text-scripture-accent hover:text-scripture-accent/80 underline cursor-pointer transition-colors"
                                          title="Click to navigate to verse"
                                        >
                                          {formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse)}
                                        </button>
                                      ) : (
                                        <span className="text-sm font-medium text-scripture-accent">
                                          {formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse)}
                                        </span>
                                      )}
                                    </div>
                                    {verseSnippet && (
                                      <div className="text-xs text-scripture-text italic pl-3 border-l-2 border-scripture-border/30 mb-2">
                                        {highlightWords(verseSnippet, verseTimeExpressions.map(t => t.expression))}
                                      </div>
                                    )}
                                    <div className="space-y-2">
                                      {verseTimeExpressions.map(timeExpression => {
                                        const isEditing = editingId === timeExpression.id;
                                        const isAddingObs = addingObservationToId === timeExpression.id;

                                        return (
                                          <div key={timeExpression.id} className="group/time">
                                            {isEditing ? (
                                              <div className="space-y-3">
                                                <Input
                                                  label="Time Expression"
                                                  type="text"
                                                  value={editingExpression}
                                                  onChange={(e) => setEditingExpression(e.target.value)}
                                                  autoFocus
                                                />
                                                <Textarea
                                                  label="Notes (optional)"
                                                  value={editingNotes}
                                                  onChange={(e) => setEditingNotes(e.target.value)}
                                                  rows={2}
                                                />
                                                <div className="space-y-2">
                                                  <label className="text-xs font-medium text-scripture-muted">Year (optional)</label>
                                                  <div className="flex items-center gap-2">
                                                    <input
                                                      type="number"
                                                      value={editingYear}
                                                      onChange={(e) => setEditingYear(e.target.value === '' ? '' : parseInt(e.target.value, 10) || '')}
                                                      placeholder="e.g., 233, 586, 33"
                                                      className="w-24 px-2 py-1.5 text-sm bg-scripture-surface border border-scripture-border/50 rounded text-scripture-text focus:outline-none focus:ring-2 focus:ring-scripture-accent"
                                                    />
                                                    <label className="flex items-center gap-1.5 text-sm text-scripture-text cursor-pointer">
                                                      <input
                                                        type="radio"
                                                        name={`editYearEra-${timeExpression.id}`}
                                                        checked={editingYearEra === 'BC'}
                                                        onChange={() => setEditingYearEra('BC')}
                                                        className="accent-scripture-accent"
                                                      />
                                                      BC
                                                    </label>
                                                    <label className="flex items-center gap-1.5 text-sm text-scripture-text cursor-pointer">
                                                      <input
                                                        type="radio"
                                                        name={`editYearEra-${timeExpression.id}`}
                                                        checked={editingYearEra === 'AD'}
                                                        onChange={() => setEditingYearEra('AD')}
                                                        className="accent-scripture-accent"
                                                      />
                                                      AD
                                                    </label>
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <button
                                                    onClick={() => handleSaveEdit(timeExpression.id)}
                                                    disabled={!editingExpression.trim()}
                                                    className="px-3 py-1.5 text-xs bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                  >
                                                    Save
                                                  </button>
                                                  <button
                                                    onClick={handleCancelEdit}
                                                    className="px-3 py-1.5 text-xs bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
                                                  >
                                                    Cancel
                                                  </button>
                                                </div>
                                              </div>
                                            ) : (
                                              <>
                                                <div className="flex items-start gap-2">
                                                  <div className="flex-1">
                                                    <span className="text-sm font-medium text-scripture-text">
                                                      🕐 {timeExpression.expression}
                                                      {timeExpression.year != null && (
                                                        <span className="ml-2 text-scripture-muted text-xs">
                                                          ({timeExpression.year} {timeExpression.yearEra || 'AD'})
                                                        </span>
                                                      )}
                                                    </span>
                                                  </div>
                                                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/time:opacity-100 transition-opacity">
                                                    <button
                                                      onClick={() => handleStartEdit(timeExpression)}
                                                      className="px-2 py-1 text-xs text-scripture-muted hover:text-scripture-accent transition-colors rounded hover:bg-scripture-elevated"
                                                      title="Edit time expression"
                                                    >
                                                      ✏️
                                                    </button>
                                                    <button
                                                      onClick={() => handleDeleteClick(timeExpression.id)}
                                                      className="px-2 py-1 text-xs text-highlight-red hover:text-highlight-red/80 transition-colors rounded hover:bg-scripture-elevated"
                                                      title="Delete time expression"
                                                    >
                                                      🗑️
                                                    </button>
                                                  </div>
                                                </div>

                                                {timeExpression.notes && (
                                                  <div className="mt-1 text-sm text-scripture-text">
                                                    {timeExpression.notes}
                                                  </div>
                                                )}

                                                {!isAddingObs && (
                                                  <button
                                                    onClick={() => { setAddingObservationToId(timeExpression.id); setNewObservation(''); }}
                                                    className="mt-1 text-xs text-scripture-muted hover:text-scripture-accent transition-colors"
                                                  >
                                                    + Add observation
                                                  </button>
                                                )}
                                                {isAddingObs && (
                                                  <div className="mt-2">
                                                    <Textarea
                                                      value={newObservation}
                                                      onChange={(e) => setNewObservation(e.target.value)}
                                                      placeholder="What do you observe about this time reference?"
                                                      rows={2}
                                                      autoFocus
                                                    />
                                                    <div className="flex items-center gap-2 mt-1">
                                                      <button
                                                        onClick={() => handleAddObservation(timeExpression.id)}
                                                        disabled={!newObservation.trim()}
                                                        className="px-3 py-1.5 text-xs bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                                      >
                                                        Add
                                                      </button>
                                                      <button
                                                        onClick={() => { setAddingObservationToId(null); setNewObservation(''); }}
                                                        className="px-3 py-1.5 text-xs bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
                                                      >
                                                        Cancel
                                                      </button>
                                                    </div>
                                                  </div>
                                                )}
                                              </>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </>
  );
}
