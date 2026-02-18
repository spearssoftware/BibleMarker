/**
 * Time Expression Tracker
 * 
 * Component for recording and displaying chronological sequences and time references.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useTimeStore } from '@/stores/timeStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useStudyStore } from '@/stores/studyStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { getCachedChapter } from '@/lib/database';
import type { TimeExpression } from '@/types/timeExpression';
import type { VerseRef } from '@/types/bible';
import { formatVerseRef, getBookById } from '@/types/bible';
import { ConfirmationDialog, Input, Textarea, Checkbox } from '@/components/shared';

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

// Sort verse groups by canonical order
const sortVerseGroups = (groups: Map<string, TimeExpression[]>): Array<[string, TimeExpression[]]> => {
  return Array.from(groups.entries()).sort(([keyA], [keyB]) => {
    const [bookA, chapterA, verseA] = keyA.split(':');
    const [bookB, chapterB, verseB] = keyB.split(':');
    
    // Compare books using canonical order
    const bookInfoA = getBookById(bookA);
    const bookInfoB = getBookById(bookB);
    
    if (bookInfoA && bookInfoB && bookInfoA.order !== bookInfoB.order) {
      return bookInfoA.order - bookInfoB.order;
    }
    
    // If one book not found, put found book first (shouldn't happen normally)
    if (!bookInfoA && !bookInfoB) return 0;
    if (!bookInfoA) return 1;
    if (!bookInfoB) return -1;
    
    // Same book: compare chapters
    const chapterANum = parseInt(chapterA, 10);
    const chapterBNum = parseInt(chapterB, 10);
    if (chapterANum !== chapterBNum) {
      return chapterANum - chapterBNum;
    }
    
    // Same chapter: compare verses
    const verseANum = parseInt(verseA, 10);
    const verseBNum = parseInt(verseB, 10);
    return verseANum - verseBNum;
  });
};

export function TimeTracker({ selectedText, verseRef: initialVerseRef, filterByChapter = true, onFilterByChapterChange, onNavigate }: TimeTrackerProps) {
  const { timeExpressions, loadTimeExpressions, createTimeExpression, updateTimeExpression, deleteTimeExpression, autoImportFromAnnotations, removeDuplicates } = useTimeStore();
  const { currentBook, currentChapter } = useBibleStore();
  const { activeStudyId } = useStudyStore();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newExpression, setNewExpression] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [editingExpression, setEditingExpression] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [addingObservationToId, setAddingObservationToId] = useState<string | null>(null);
  const [newObservation, setNewObservation] = useState('');
  const [verseTexts, setVerseTexts] = useState<Map<string, string>>(new Map());
  const { activeView } = useMultiTranslationStore();
  const primaryModuleId = activeView?.translationIds[0] || '';

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

  const handleCreate = async () => {
    const verseRef = getCurrentVerseRef();
    if (!verseRef || !newExpression.trim()) {
      alert('Please fill in the time expression and ensure you have a verse reference.');
      return;
    }

    await createTimeExpression(
      newExpression.trim(),
      verseRef,
      newNotes.trim() || undefined,
      undefined, // presetId - manual entry, no preset
      undefined, // annotationId - manual entry, no annotation
      undefined  // timeOrder - will be assigned if needed
    );

    setIsCreating(false);
    setNewExpression('');
    setNewNotes('');
    loadTimeExpressions();
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewExpression('');
    setNewNotes('');
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
          const snippet = text.length > 80 ? text.substring(0, 80) + '...' : text;
          newTexts.set(getVerseKey(item.verseRef), snippet);
        }
      }
      if (!cancelled) setVerseTexts(newTexts);
    })();
    return () => { cancelled = true; };
  }, [filteredTimeExpressions, primaryModuleId]);

  const verseGroups = groupByVerse(filteredTimeExpressions);
  const sortedGroups = sortVerseGroups(verseGroups);

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

      {/* Time expressions list */}
      {filteredTimeExpressions.length > 0 && (
        <div className="space-y-4">
          {sortedGroups.map(([verseKey, verseTimeExpressions]) => {
            const verseRef = verseTimeExpressions[0].verseRef;
            const verseSnippet = verseTexts.get(verseKey);

            return (
              <div key={verseKey} className="bg-scripture-surface rounded-lg border border-scripture-border/30 p-3">
                {/* Verse header */}
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

                {/* Verse snippet */}
                {verseSnippet && (
                  <div className="text-xs text-scripture-text italic pl-3 border-l-2 border-scripture-border/30 mb-2">
                    {verseSnippet}
                  </div>
                )}

                {/* Time expressions for this verse */}
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
                                <span className="text-sm font-medium text-scripture-text">🕐 {timeExpression.expression}</span>
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

                            {/* Observations (notes) */}
                            {timeExpression.notes && (
                              <div className="mt-1 text-sm text-scripture-text">
                                {timeExpression.notes}
                              </div>
                            )}

                            {/* Add observation */}
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
    </>
  );
}
