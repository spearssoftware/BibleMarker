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
  autoCreate?: boolean;
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

function getTimeGroupKey(item: TimeExpression): string {
  if (item.presetId) return item.presetId;
  return `manual:${item.verseRef.book}:${item.verseRef.chapter}`;
}

function groupByKeyword(
  items: TimeExpression[],
  presetMap: Map<string, { word?: string }>
): Array<{ key: string; label: string; items: TimeExpression[] }> {
  const byKey = new Map<string, TimeExpression[]>();
  for (const item of items) {
    const key = getTimeGroupKey(item);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(item);
  }
  return Array.from(byKey.entries()).map(([key, keywordItems]) => {
    if (key.startsWith('manual:')) {
      const ref = keywordItems[0].verseRef;
      return { key, label: `${ref.book} ${ref.chapter}`, items: keywordItems };
    }
    const label = presetMap.get(key)?.word ?? 'Unknown';
    return { key, label, items: keywordItems };
  });
}

// Sort keyword groups by label (Manual last), then by earliest verse
function sortKeywordGroups(
  groups: Array<{ key: string; label: string; items: TimeExpression[] }>
): Array<{ key: string; label: string; items: TimeExpression[] }> {
  return [...groups].sort((a, b) => {
    const aManual = a.key.startsWith('manual:');
    const bManual = b.key.startsWith('manual:');
    if (aManual && !bManual) return 1;
    if (bManual && !aManual) return -1;
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

export function TimeTracker({ selectedText, verseRef: initialVerseRef, autoCreate, filterByChapter = true, onFilterByChapterChange, onNavigate }: TimeTrackerProps) {
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
  const [newYear, setNewYear] = useState('');
  const [newYearEra, setNewYearEra] = useState<'BC' | 'AD'>('BC');
  const [editingExpression, setEditingExpression] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [editingGroupYear, setEditingGroupYear] = useState<string | null>(null);
  const [groupYear, setGroupYear] = useState('');
  const [groupYearEra, setGroupYearEra] = useState<'BC' | 'AD'>('BC');
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

  // Auto-open creation form when triggered from verse menu
  useEffect(() => {
    if (autoCreate) {
      setIsCreating(true);
    }
  }, [autoCreate]);

  // Pre-fill form if selectedText is provided
  useEffect(() => {
    if (selectedText && isCreating && !newExpression) {
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
    if (isCreating) {
      setGroupYearEra(defaultYearEra);
      setNewYearEra(defaultYearEra);
    }
  }, [isCreating, defaultYearEra]);

  const handleCreate = async () => {
    const verseRef = getCurrentVerseRef();
    if (!verseRef || !newExpression.trim()) {
      alert('Please fill in the time expression and ensure you have a verse reference.');
      return;
    }

    const yearVal = newYear ? parseInt(newYear, 10) : undefined;
    await createTimeExpression(
      newExpression.trim(),
      verseRef,
      newNotes.trim() || undefined,
      undefined,
      undefined,
      undefined,
      activeStudyId ?? undefined,
      yearVal !== undefined && !isNaN(yearVal) ? yearVal : undefined,
      yearVal !== undefined && !isNaN(yearVal) ? newYearEra : undefined,
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
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingExpression('');
    setEditingNotes('');
  };

  const handleSaveEdit = async (timeExpressionId: string) => {
    if (!editingExpression.trim()) {
      alert('Time expression is required.');
      return;
    }

    const timeExpression = timeExpressions.find(t => t.id === timeExpressionId);
    if (!timeExpression) return;

    await updateTimeExpression({
      ...timeExpression,
      expression: editingExpression.trim(),
      notes: editingNotes.trim() || undefined,
    });

    setEditingId(null);
    setEditingExpression('');
    setEditingNotes('');
    loadTimeExpressions();
  };

  const handleStartEditGroupYear = (groupKey: string) => {
    const allMatching = timeExpressions.filter(t => getTimeGroupKey(t) === groupKey);
    const withYear = allMatching.find(t => t.year != null);
    setEditingGroupYear(groupKey);
    setGroupYear(withYear?.year?.toString() || '');
    setGroupYearEra(withYear?.yearEra || defaultYearEra);
  };

  const handleSaveGroupYear = async (groupKey: string) => {
    const yearVal = groupYear ? parseInt(groupYear, 10) : undefined;
    const allMatching = timeExpressions.filter(t => getTimeGroupKey(t) === groupKey);
    for (const te of allMatching) {
      await updateTimeExpression({
        ...te,
        year: yearVal !== undefined && !isNaN(yearVal) ? yearVal : undefined,
        yearEra: yearVal !== undefined && !isNaN(yearVal) ? groupYearEra : undefined,
      });
    }
    setEditingGroupYear(null);
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
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-scripture-text">New Time Expression</h3>
            {getCurrentVerseRef() && (
              <span className="text-xs text-scripture-accent font-medium bg-scripture-accent/10 px-2 py-0.5 rounded">
                📍 {formatVerseRef(getCurrentVerseRef()!.book, getCurrentVerseRef()!.chapter, getCurrentVerseRef()!.verse)}
              </span>
            )}
          </div>
          <div className="space-y-3">
            <Input
              label="Time Expression"
              type="text"
              value={newExpression}
              onChange={(e) => setNewExpression(e.target.value)}
              placeholder="e.g., 'in the morning', 'three days later', 'on the third day'"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-scripture-muted whitespace-nowrap">Year (optional)</label>
              <input
                type="number"
                value={newYear}
                onChange={(e) => setNewYear(e.target.value)}
                placeholder="e.g. 588"
                className="w-20 px-2 py-1 text-xs bg-scripture-bg border border-scripture-border rounded text-scripture-text"
              />
              <select
                value={newYearEra}
                onChange={(e) => setNewYearEra(e.target.value as 'BC' | 'AD')}
                className="px-1.5 py-1 text-xs bg-scripture-bg border border-scripture-border rounded text-scripture-text"
              >
                <option value="BC">BC</option>
                <option value="AD">AD</option>
              </select>
            </div>
            <Textarea
              label="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Additional notes about this time expression"
              rows={2}
            />
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
              <p className="text-xs text-scripture-error">
                No verse reference available. Navigate to a chapter first.
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
            const withYear = timeExpressions.find(t => getTimeGroupKey(t) === key && t.year != null);
            const isEditingYear = editingGroupYear === key;

            return (
              <div key={key} className="bg-scripture-surface rounded-xl border border-scripture-border/50 overflow-hidden">
                <div className="flex items-center gap-2 p-4 hover:bg-scripture-elevated/50 transition-colors">
                  <button
                    onClick={() => toggleKeyword(key)}
                    className="flex-1 text-left flex items-center gap-2"
                  >
                    <span className="text-xs text-scripture-muted shrink-0" aria-hidden="true">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                    <h3 className="font-medium text-scripture-text">{label}</h3>
                    {withYear && !isEditingYear && (
                      <span className="text-xs text-scripture-muted">
                        {withYear.year} {withYear.yearEra ?? 'AD'}
                      </span>
                    )}
                    <span className="text-xs text-scripture-muted bg-scripture-elevated px-2 py-0.5 rounded">
                      {keywordItems.length} {keywordItems.length === 1 ? 'entry' : 'entries'}
                    </span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleStartEditGroupYear(key); }}
                    className="px-2 py-1 text-xs text-scripture-muted hover:text-scripture-accent transition-colors rounded hover:bg-scripture-elevated shrink-0"
                    title="Edit year"
                  >
                    📅
                  </button>
                </div>
                {isEditingYear && (
                  <div className="border-t border-scripture-border/30 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1.5">
                        <label className="text-xs text-scripture-muted whitespace-nowrap">Year</label>
                        <input
                          type="number"
                          value={groupYear}
                          onChange={(e) => setGroupYear(e.target.value)}
                          placeholder="e.g. 586"
                          className="w-20 px-2 py-1 text-xs bg-scripture-bg border border-scripture-border rounded text-scripture-text"
                          autoFocus
                        />
                        <select
                          value={groupYearEra}
                          onChange={(e) => setGroupYearEra(e.target.value as 'BC' | 'AD')}
                          className="px-1.5 py-1 text-xs bg-scripture-bg border border-scripture-border rounded text-scripture-text"
                        >
                          <option value="BC">BC</option>
                          <option value="AD">AD</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleSaveGroupYear(key)}
                          className="px-3 py-1 text-xs bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingGroupYear(null)}
                          className="px-3 py-1 text-xs bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
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
