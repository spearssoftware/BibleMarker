/**
 * Geographic Location Tracker
 * 
 * Component for recording and displaying places and geographic locations.
 */

import { useState, useEffect, useMemo } from 'react';
import { usePlaceStore } from '@/stores/placeStore';
import { useBibleStore } from '@/stores/bibleStore';
import type { Place } from '@/types/place';
import type { VerseRef } from '@/types/bible';
import { formatVerseRef, getBookById } from '@/types/bible';
import { ConfirmationDialog } from '@/components/shared';

interface PlaceTrackerProps {
  selectedText?: string;
  verseRef?: VerseRef;
  filterByChapter?: boolean;
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

export function PlaceTracker({ selectedText, verseRef: initialVerseRef, filterByChapter = false, onNavigate }: PlaceTrackerProps) {
  const { places, loadPlaces, createPlace, updatePlace, deletePlace, autoImportFromAnnotations } = usePlaceStore();
  const { currentBook, currentChapter } = useBibleStore();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [editingName, setEditingName] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [expandedVerses, setExpandedVerses] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hasAutoImported, setHasAutoImported] = useState(false);

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

  // Auto-import existing keyword annotations with place symbols
  useEffect(() => {
    if (!hasAutoImported) {
      autoImportFromAnnotations().then((count) => {
        if (count > 0) {
          loadPlaces(); // Reload to show imported places
        }
        setHasAutoImported(true);
      }).catch((error) => {
        console.error('[PlaceTracker] Auto-import failed:', error);
        setHasAutoImported(true);
      });
    }
  }, [hasAutoImported, autoImportFromAnnotations, loadPlaces]);

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

  const toggleVerse = (verseKey: string) => {
    const newExpanded = new Set(expandedVerses);
    if (newExpanded.has(verseKey)) {
      newExpanded.delete(verseKey);
    } else {
      newExpanded.add(verseKey);
    }
    setExpandedVerses(newExpanded);
  };

  // Expand all verses by default
  useEffect(() => {
    if (places.length > 0 && expandedVerses.size === 0) {
      const verseGroups = groupByVerse(places);
      queueMicrotask(() => setExpandedVerses(new Set(verseGroups.keys())));
    }
  }, [places, expandedVerses.size]);

  // Filter places by chapter if filterByChapter is enabled
  const filteredPlaces = useMemo(() => {
    if (!filterByChapter) return places;
    return places.filter(place => 
      place.verseRef.book === currentBook && place.verseRef.chapter === currentChapter
    );
  }, [places, filterByChapter, currentBook, currentChapter]);

  const verseGroups = groupByVerse(filteredPlaces);
  const sortedGroups = sortVerseGroups(verseGroups);

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
      {/* Create new place button */}
      {!isCreating && (
        <div className="mb-4">
          <button
            onClick={() => setIsCreating(true)}
            className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
          >
            + New Place
          </button>
        </div>
      )}

      {/* Create form */}
      {isCreating && (
        <div className="mb-4 p-4 bg-scripture-surface rounded-xl border border-scripture-border/50">
          <h3 className="text-sm font-medium text-scripture-text mb-3">New Place</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-scripture-muted mb-1">Place Name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., 'Jerusalem', 'Mount Sinai', 'Babylon'"
                className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-scripture-muted mb-1">Notes (optional)</label>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Additional notes about this place"
                rows={2}
                className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted resize-none"
              />
            </div>
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

      {/* Places list */}
      {places.length > 0 && (
        <div className="space-y-3">
          {sortedGroups.map(([verseKey, versePlaces]) => {
            const isExpanded = expandedVerses.has(verseKey);
            const verseRef = versePlaces[0].verseRef;
            return (
              <div
                key={verseKey}
                className="bg-scripture-surface rounded-xl border border-scripture-border/50 shadow-sm overflow-hidden"
              >
                {/* Verse header */}
                <div className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      onClick={() => toggleVerse(verseKey)}
                      className="flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        {onNavigate ? (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onNavigate(verseRef);
                            }}
                            className="text-sm font-medium text-scripture-accent hover:text-scripture-accent/80 cursor-pointer underline transition-colors"
                            title="Click to navigate to verse"
                          >
                            {formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse)}
                          </button>
                        ) : (
                          <span className="text-sm font-medium text-scripture-accent">
                            {formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse)}
                          </span>
                        )}
                        <span className="text-xs text-scripture-muted">
                          ({versePlaces.length} {versePlaces.length === 1 ? 'place' : 'places'})
                        </span>
                        <span className="text-xs text-scripture-muted">{isExpanded ? '▼' : '▶'}</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Places for this verse */}
                {isExpanded && (
                  <div className="border-t border-scripture-muted/20 p-4 bg-scripture-bg/50 space-y-3">
                    {versePlaces.map(place => {
                      const isEditing = editingId === place.id;

                      return (
                        <div
                          key={place.id}
                          className="bg-scripture-surface rounded-lg border border-scripture-border/30 p-3"
                        >
                          {isEditing ? (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs text-scripture-muted mb-1">Place Name</label>
                                <input
                                  type="text"
                                  value={editingName}
                                  onChange={(e) => setEditingName(e.target.value)}
                                  className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                                  autoFocus
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-scripture-muted mb-1">Notes (optional)</label>
                                <textarea
                                  value={editingNotes}
                                  onChange={(e) => setEditingNotes(e.target.value)}
                                  rows={2}
                                  className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted resize-none"
                                />
                              </div>
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
                            <div className="group/place">
                              <div className="flex items-start gap-2 mb-2">
                                <div className="flex-1">
                                  <div className="text-sm text-scripture-text">
                                    <span className="font-medium">📍 {place.name}</span>
                                  </div>
                                  {place.notes && (
                                    <div className="mt-2 text-xs text-scripture-muted italic">
                                      {place.notes}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover/place:opacity-100 transition-opacity">
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
