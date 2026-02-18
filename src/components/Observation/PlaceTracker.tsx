/**
 * Geographic Location Tracker
 * 
 * Component for recording and displaying places and geographic locations.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { usePlaceStore } from '@/stores/placeStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useStudyStore } from '@/stores/studyStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { getCachedChapter } from '@/lib/database';
import type { Place } from '@/types/place';
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

interface PlaceTrackerProps {
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

// Group places by verse
const groupByVerse = (places: Place[]): Map<string, Place[]> => {
  const map = new Map<string, Place[]>();
  places.forEach(place => {
    const key = getVerseKey(place.verseRef);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(place);
  });
  return map;
};

// Group places by keyword (presetId), with "Manual" for items without presetId
function groupByKeyword(
  items: Place[],
  presetMap: Map<string, { word?: string }>
): Array<{ key: string; label: string; items: Place[] }> {
  const byKey = new Map<string, Place[]>();
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
  groups: Array<{ key: string; label: string; items: Place[] }>
): Array<{ key: string; label: string; items: Place[] }> {
  return [...groups].sort((a, b) => {
    if (a.key === 'manual' && b.key !== 'manual') return 1;
    if (b.key === 'manual' && a.key !== 'manual') return -1;
    const nameCmp = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    const minVerse = (items: Place[]) => {
      if (items.length === 0) return '';
      const keys = items.map(p => getVerseKey(p.verseRef));
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
const sortVerseGroups = (groups: Map<string, Place[]>): Array<[string, Place[]]> => {
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

export function PlaceTracker({ selectedText, verseRef: initialVerseRef, filterByChapter = true, onFilterByChapterChange, onNavigate }: PlaceTrackerProps) {
  const { places, loadPlaces, createPlace, updatePlace, deletePlace, autoImportFromAnnotations, removeDuplicates, autoPopulateFromChapter } = usePlaceStore();
  const { currentBook, currentChapter } = useBibleStore();
  const [isPopulating, setIsPopulating] = useState(false);
  const { activeStudyId } = useStudyStore();
  const { presets } = useMarkingPresetStore();
  const presetMap = useMemo(() => new Map(presets.map(p => [p.id, { word: p.word }])), [presets]);
  const [expandedKeywords, setExpandedKeywords] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [editingName, setEditingName] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
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
      await loadPlaces();
      if (count > 0) alert(`Added ${count} place(s) from chapter.`);
    } catch (e) {
      console.error('[PlaceTracker] Populate failed:', e);
    } finally {
      setIsPopulating(false);
    }
  };
  
  // Track if we've already run initialization to prevent duplicates
  const hasInitialized = useRef(false);

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

  // Load places on mount
  useEffect(() => {
    loadPlaces();
  }, [loadPlaces]);

  // Clean up duplicates and auto-import existing keyword annotations (only once per mount)
  useEffect(() => {
    let isMounted = true;
    
    const initialize = async () => {
      if (!hasInitialized.current) {
        hasInitialized.current = true;
        
        // Clean up any existing duplicates first
        const removedCount = await removeDuplicates();
        if (removedCount > 0 && isMounted) {
          console.log(`[PlaceTracker] Removed ${removedCount} duplicate places`);
        }
        
        // Auto-import existing keyword annotations with place symbols
        try {
          const count = await autoImportFromAnnotations();
          if (count > 0 && isMounted) {
            loadPlaces(); // Reload to show imported places
          }
        } catch (error) {
          if (isMounted) {
            console.error('[PlaceTracker] Auto-import failed:', error);
          }
        }
      }
    };
    initialize();
    
    return () => {
      isMounted = false;
    };
  }, [autoImportFromAnnotations, loadPlaces, removeDuplicates]);

  // Pre-fill form if selectedText is provided
  useEffect(() => {
    if (selectedText && isCreating && !newName) {
      // Pre-fill with selected text
      queueMicrotask(() => setNewName(selectedText.trim()));
    }
  }, [selectedText, isCreating, newName]);

  const handleCreate = async () => {
    const verseRef = getCurrentVerseRef();
    if (!verseRef || !newName.trim()) {
      alert('Please fill in the place name and ensure you have a verse reference.');
      return;
    }

    await createPlace(
      newName.trim(),
      verseRef,
      newNotes.trim() || undefined,
      undefined, // presetId - will be set if coming from annotation
      undefined  // annotationId - will be set if coming from annotation
    );

    setIsCreating(false);
    setNewName('');
    setNewNotes('');
    loadPlaces();
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewName('');
    setNewNotes('');
  };

  const handleStartEdit = (place: Place) => {
    setEditingId(place.id);
    setEditingName(place.name);
    setEditingNotes(place.notes || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setEditingNotes('');
  };

  const handleSaveEdit = async (placeId: string) => {
    if (!editingName.trim()) {
      alert('Place name is required.');
      return;
    }

    const place = places.find(p => p.id === placeId);
    if (!place) return;

    await updatePlace({
      ...place,
      name: editingName.trim(),
      notes: editingNotes.trim() || undefined,
    });

    setEditingId(null);
    setEditingName('');
    setEditingNotes('');
    loadPlaces();
  };

  const handleDeleteClick = (placeId: string) => {
    setConfirmDeleteId(placeId);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;

    const idToDelete = confirmDeleteId;
    setConfirmDeleteId(null);

    await deletePlace(idToDelete);
    loadPlaces();
  };

  const handleCancelDelete = () => {
    setConfirmDeleteId(null);
  };

  // Load verse texts for displayed places

  const handleAddObservation = async (placeId: string) => {
    if (!newObservation.trim()) return;
    const place = places.find(p => p.id === placeId);
    if (!place) return;
    const existingNotes = place.notes ? place.notes + '\n' : '';
    await updatePlace({ ...place, notes: existingNotes + newObservation.trim() });
    setAddingObservationToId(null);
    setNewObservation('');
    loadPlaces();
  };

  // Filter places by chapter and study
  const filteredPlaces = useMemo(() => {
    let filtered = places;
    // Filter by active study
    if (activeStudyId) {
      filtered = filtered.filter(place => !place.studyId || place.studyId === activeStudyId);
    }
    // Filter by chapter
    if (filterByChapter) {
      filtered = filtered.filter(place => 
        place.verseRef.book === currentBook && place.verseRef.chapter === currentChapter
      );
    }
    return filtered;
  }, [places, filterByChapter, currentBook, currentChapter, activeStudyId]);

  // Load verse texts when filtered places change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!primaryModuleId) return;
      const chapterCache = new Map<string, Record<number, string>>();
      const newTexts = new Map<string, string>();
      for (const place of filteredPlaces) {
        const cacheKey = `${place.verseRef.book}:${place.verseRef.chapter}`;
        if (!chapterCache.has(cacheKey)) {
          const cached = await getCachedChapter(primaryModuleId, place.verseRef.book, place.verseRef.chapter);
          if (cached?.verses) chapterCache.set(cacheKey, cached.verses);
        }
        const verses = chapterCache.get(cacheKey);
        if (verses) {
          const text = verses[place.verseRef.verse] || '';
          newTexts.set(getVerseKey(place.verseRef), text);
        }
      }
      if (!cancelled) setVerseTexts(newTexts);
    })();
    return () => { cancelled = true; };
  }, [filteredPlaces, primaryModuleId]);

  const keywordGroups = useMemo(() => {
    const grouped = groupByKeyword(filteredPlaces, presetMap);
    return sortKeywordGroups(grouped);
  }, [filteredPlaces, presetMap]);

  const toggleKeyword = (key: string) => {
    setExpandedKeywords(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <>
      <ConfirmationDialog
        isOpen={confirmDeleteId !== null}
        title="Delete Place"
        message="Are you sure you want to delete this place? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        destructive={true}
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
      {/* Create new place button and Current Chapter Only */}
      {!isCreating && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsCreating(true)}
            className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
          >
            + New Place
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
          <h3 className="text-sm font-medium text-scripture-text mb-3">New Place</h3>
          <div className="space-y-3">
            <Input
              label="Place Name"
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g., 'Jerusalem', 'Mount Sinai', 'Babylon'"
              autoFocus
            />
            <Textarea
              label="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Additional notes about this place"
              rows={2}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || !getCurrentVerseRef()}
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
      {places.length === 0 && !isCreating && (
        <div className="text-center py-12">
          <p className="text-scripture-muted text-sm mb-4">No places recorded yet.</p>
          <p className="text-scripture-muted text-xs mb-4">
            Record geographic locations and places you observe in the text. Use the 📍, ⛰, or 🏙️ symbols to mark places, then add details here.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
          >
            Create Your First Place
          </button>
        </div>
      )}

      {/* Places list - grouped by keyword */}
      {filteredPlaces.length > 0 && (
        <div className="space-y-4">
          {keywordGroups.map(({ key, label, items: keywordItems }) => {
            const isExpanded = expandedKeywords.has(key);
            const verseGroups = groupByVerse(keywordItems);
            const sortedVerseGroups = sortVerseGroups(verseGroups);

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
                    {verseGroups.size} {verseGroups.size === 1 ? 'verse' : 'verses'}
                  </span>
                </button>
                {isExpanded && (
                  <div className="border-t border-scripture-border/30 p-3 space-y-3">
                    {sortedVerseGroups.map(([verseKey, versePlaces]) => {
                      const verseRef = versePlaces[0].verseRef;
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
                              {highlightWords(verseSnippet, versePlaces.map(p => p.name))}
                            </div>
                          )}
                          <div className="space-y-2">
                            {versePlaces.map(place => {
                    const isEditing = editingId === place.id;
                    const isAddingObs = addingObservationToId === place.id;

                    return (
                      <div key={place.id} className="group/place">
                        {isEditing ? (
                          <div className="space-y-3">
                            <Input
                              label="Place Name"
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
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
                                onClick={() => handleSaveEdit(place.id)}
                                disabled={!editingName.trim()}
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
                                <span className="text-sm font-medium text-scripture-text">📍 {place.name}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/place:opacity-100 transition-opacity">
                                <button
                                  onClick={() => handleStartEdit(place)}
                                  className="px-2 py-1 text-xs text-scripture-muted hover:text-scripture-accent transition-colors rounded hover:bg-scripture-elevated"
                                  title="Edit place"
                                >
                                  ✏️
                                </button>
                                <button
                                  onClick={() => handleDeleteClick(place.id)}
                                  className="px-2 py-1 text-xs text-highlight-red hover:text-highlight-red/80 transition-colors rounded hover:bg-scripture-elevated"
                                  title="Delete place"
                                >
                                  🗑️
                                </button>
                              </div>
                            </div>

                            {/* Observations (notes) */}
                            {place.notes && (
                              <div className="mt-1 text-sm text-scripture-text">
                                {place.notes}
                              </div>
                            )}

                            {/* Add observation */}
                            {!isAddingObs && (
                              <button
                                onClick={() => { setAddingObservationToId(place.id); setNewObservation(''); }}
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
                                  placeholder="What do you observe about this place?"
                                  rows={2}
                                  autoFocus
                                />
                                <div className="flex items-center gap-2 mt-1">
                                  <button
                                    onClick={() => handleAddObservation(place.id)}
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
    </>
  );
}
