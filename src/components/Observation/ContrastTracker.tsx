/**
 * Contrast and Comparison Tracker
 * 
 * Component for recording and displaying contrasts and comparisons.
 */

import { useState, useEffect, useMemo } from 'react';
import { useContrastStore } from '@/stores/contrastStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import type { Contrast } from '@/types';
import type { VerseRef } from '@/types';
import { formatVerseRef, getBookById } from '@/types';
import { ConfirmationDialog, Input, Textarea, Checkbox } from '@/components/shared';
import { getAnnotationsBySymbol, getAnnotationText, getAnnotationVerseRef } from '@/lib/annotationQueries';

interface ContrastTrackerProps {
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

// Group contrasts by verse
const groupByVerse = (contrasts: Contrast[]): Map<string, Contrast[]> => {
  const map = new Map<string, Contrast[]>();
  contrasts.forEach(contrast => {
    const key = getVerseKey(contrast.verseRef);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(contrast);
  });
  return map;
};

// Sort verse groups by canonical order
const sortVerseGroups = (groups: Map<string, Contrast[]>): Array<[string, Contrast[]]> => {
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

export function ContrastTracker({ selectedText, verseRef: initialVerseRef, filterByChapter = false, onFilterByChapterChange, onNavigate }: ContrastTrackerProps) {
  const { contrasts, loadContrasts, createContrast, updateContrast, deleteContrast } = useContrastStore();
  const { currentBook, currentChapter } = useBibleStore();
  const { presets } = useMarkingPresetStore();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newItemA, setNewItemA] = useState('');
  const [newItemB, setNewItemB] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [editingItemA, setEditingItemA] = useState('');
  const [editingItemB, setEditingItemB] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [expandedVerses, setExpandedVerses] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [hasCheckedAutoImport, setHasCheckedAutoImport] = useState(false);

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

  // Load contrasts on mount
  useEffect(() => {
    loadContrasts();
  }, [loadContrasts]);

  // Auto-import existing keyword annotations with contrast symbol
  useEffect(() => {
    if (hasCheckedAutoImport || contrasts.length > 0) return;
    
    const autoImportAnnotations = async () => {
      try {
        // Get all annotations with the contrast symbol (doubleArrow)
        const contrastAnnotations = await getAnnotationsBySymbol('doubleArrow');
        
        if (contrastAnnotations.length === 0) {
          setHasCheckedAutoImport(true);
          return;
        }

        // Group by presetId to create contrasts
        const annotationsByPreset = new Map<string, typeof contrastAnnotations>();
        for (const ann of contrastAnnotations) {
          if (ann.presetId) {
            if (!annotationsByPreset.has(ann.presetId)) {
              annotationsByPreset.set(ann.presetId, []);
            }
            annotationsByPreset.get(ann.presetId)!.push(ann);
          }
        }

        // For each preset, try to create contrasts from pairs of annotations
        // If only one annotation, create a contrast with the annotation text as itemA
        let importedCount = 0;
        for (const [presetId, annotations] of annotationsByPreset.entries()) {
          const preset = presets.find(p => p.id === presetId);
          const keywordName = preset?.word || 'Unknown';
          
          if (annotations.length >= 2) {
            // Create contrasts from pairs
            for (let i = 0; i < annotations.length - 1; i += 2) {
              const ann1 = annotations[i];
              const ann2 = annotations[i + 1];
              const text1 = getAnnotationText(ann1) || keywordName;
              const text2 = getAnnotationText(ann2) || keywordName;
              
              // Check if contrast already exists
              const verseRef1 = getAnnotationVerseRef(ann1);
              const existing = contrasts.find(c => 
                c.presetId === presetId &&
                c.verseRef.book === verseRef1.book &&
                c.verseRef.chapter === verseRef1.chapter &&
                c.verseRef.verse === verseRef1.verse &&
                (c.itemA === text1 || c.itemA === text2) &&
                (c.itemB === text1 || c.itemB === text2)
              );
              
              if (!existing) {
                await createContrast(
                  text1,
                  text2,
                  verseRef1,
                  `Auto-imported from keyword: ${keywordName}`,
                  presetId,
                  ann1.id
                );
                importedCount++;
              }
            }
          } else if (annotations.length === 1) {
            // Single annotation - create contrast with keyword as one item
            const ann = annotations[0];
            const text = getAnnotationText(ann) || keywordName;
            const verseRef = getAnnotationVerseRef(ann);
            
            // Check if contrast already exists
            const existing = contrasts.find(c => 
              c.presetId === presetId &&
              c.verseRef.book === verseRef.book &&
              c.verseRef.chapter === verseRef.chapter &&
              c.verseRef.verse === verseRef.verse
            );
            
            if (!existing) {
              await createContrast(
                keywordName,
                text,
                verseRef,
                `Auto-imported from keyword annotation`,
                presetId,
                ann.id
              );
              importedCount++;
            }
          }
        }
        
        if (importedCount > 0) {
          await loadContrasts();
        }
      } catch (error) {
        console.error('Error auto-importing contrast annotations:', error);
      } finally {
        setHasCheckedAutoImport(true);
      }
    };

    autoImportAnnotations();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once when contrasts length/loadContrasts change
  }, [contrasts.length, hasCheckedAutoImport, loadContrasts, createContrast, presets]);

  // Pre-fill form if selectedText is provided
  useEffect(() => {
    if (selectedText && isCreating && !newItemA && !newItemB) {
      // Try to split by common contrast words
      const contrastWords = [' vs ', ' versus ', ' vs. ', ' vs. ', ' but ', ' however ', ' whereas ', ' while ', ' unlike '];
      let found = false;
      for (const word of contrastWords) {
        if (selectedText.toLowerCase().includes(word.toLowerCase())) {
          const parts = selectedText.split(new RegExp(word, 'i'));
          if (parts.length === 2) {
            setNewItemA(parts[0].trim());
            setNewItemB(parts[1].trim());
            found = true;
            break;
          }
        }
      }
      // If no contrast word found, put all text in itemA and let user fill itemB
      if (!found && selectedText.trim()) {
        setNewItemA(selectedText.trim());
      }
    }
  }, [selectedText, isCreating, newItemA, newItemB]);

  const handleCreate = async () => {
    const verseRef = getCurrentVerseRef();
    if (!verseRef || !newItemA.trim() || !newItemB.trim()) {
      alert('Please fill in both items and ensure you have a verse reference.');
      return;
    }

    await createContrast(
      newItemA.trim(),
      newItemB.trim(),
      verseRef,
      newNotes.trim() || undefined,
      undefined, // presetId - can be added later if needed
      undefined  // annotationId - can be added later if needed
    );

    setIsCreating(false);
    setNewItemA('');
    setNewItemB('');
    setNewNotes('');
    loadContrasts();
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewItemA('');
    setNewItemB('');
    setNewNotes('');
  };

  const handleStartEdit = (contrast: Contrast) => {
    setEditingId(contrast.id);
    setEditingItemA(contrast.itemA);
    setEditingItemB(contrast.itemB);
    setEditingNotes(contrast.notes || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingItemA('');
    setEditingItemB('');
    setEditingNotes('');
  };

  const handleSaveEdit = async (contrastId: string) => {
    if (!editingItemA.trim() || !editingItemB.trim()) {
      alert('Both items are required.');
      return;
    }

    const contrast = contrasts.find(c => c.id === contrastId);
    if (!contrast) return;

    await updateContrast({
      ...contrast,
      itemA: editingItemA.trim(),
      itemB: editingItemB.trim(),
      notes: editingNotes.trim() || undefined,
    });

    setEditingId(null);
    setEditingItemA('');
    setEditingItemB('');
    setEditingNotes('');
    loadContrasts();
  };

  const handleDeleteClick = (contrastId: string) => {
    setConfirmDeleteId(contrastId);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;

    const idToDelete = confirmDeleteId;
    setConfirmDeleteId(null);

    await deleteContrast(idToDelete);
    loadContrasts();
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
    if (contrasts.length > 0 && expandedVerses.size === 0) {
      const verseGroups = groupByVerse(contrasts);
      setExpandedVerses(new Set(verseGroups.keys()));
    }
  }, [contrasts, expandedVerses.size]);

  // Filter contrasts by chapter if filterByChapter is enabled
  const filteredContrasts = useMemo(() => {
    if (!filterByChapter) return contrasts;
    return contrasts.filter(contrast => 
      contrast.verseRef.book === currentBook && contrast.verseRef.chapter === currentChapter
    );
  }, [contrasts, filterByChapter, currentBook, currentChapter]);

  const verseGroups = groupByVerse(filteredContrasts);
  const sortedGroups = sortVerseGroups(verseGroups);

  return (
    <>
      <ConfirmationDialog
        isOpen={confirmDeleteId !== null}
        title="Delete Contrast"
        message="Are you sure you want to delete this contrast? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        destructive={true}
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
      {/* Create new contrast button and Current Chapter Only */}
      {!isCreating && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setIsCreating(true)}
            className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
          >
            + New Contrast
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
          <h3 className="text-sm font-medium text-scripture-text mb-3">New Contrast</h3>
          <div className="space-y-3">
            <Input
              label="Item A"
              type="text"
              value={newItemA}
              onChange={(e) => setNewItemA(e.target.value)}
              placeholder="First item being compared/contrasted"
              autoFocus
            />
            <Input
              label="Item B"
              type="text"
              value={newItemB}
              onChange={(e) => setNewItemB(e.target.value)}
              placeholder="Second item being compared/contrasted"
            />
            <Textarea
              label="Notes (optional)"
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Additional notes about this contrast"
              rows={2}
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={!newItemA.trim() || !newItemB.trim() || !getCurrentVerseRef()}
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
      {contrasts.length === 0 && !isCreating && (
        <div className="text-center py-12">
          <p className="text-scripture-muted text-sm mb-4">No contrasts recorded yet.</p>
          <p className="text-scripture-muted text-xs mb-4">
            Record contrasts and comparisons you observe in the text. Use the ⇔ symbol to mark contrasts, then add details here.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
          >
            Create Your First Contrast
          </button>
        </div>
      )}

      {/* Contrasts list */}
      {contrasts.length > 0 && (
        <div className="space-y-3">
          {sortedGroups.map(([verseKey, verseContrasts]) => {
            const isExpanded = expandedVerses.has(verseKey);
            const verseRef = verseContrasts[0].verseRef;
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
                        <span className="text-xs text-scripture-muted shrink-0">{isExpanded ? '▼' : '▶'}</span>
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
                          ({verseContrasts.length} {verseContrasts.length === 1 ? 'contrast' : 'contrasts'})
                        </span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Contrasts for this verse */}
                {isExpanded && (
                  <div className="border-t border-scripture-muted/20 p-4 bg-scripture-bg/50 space-y-3">
                    {verseContrasts.map(contrast => {
                      const isEditing = editingId === contrast.id;

                      return (
                        <div
                          key={contrast.id}
                          className="bg-scripture-surface rounded-lg border border-scripture-border/30 p-3"
                        >
                          {isEditing ? (
                            <div className="space-y-3">
                              <Input
                                label="Item A"
                                type="text"
                                value={editingItemA}
                                onChange={(e) => setEditingItemA(e.target.value)}
                                autoFocus
                              />
                              <Input
                                label="Item B"
                                type="text"
                                value={editingItemB}
                                onChange={(e) => setEditingItemB(e.target.value)}
                              />
                              <Textarea
                                label="Notes (optional)"
                                value={editingNotes}
                                onChange={(e) => setEditingNotes(e.target.value)}
                                rows={2}
                              />
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleSaveEdit(contrast.id)}
                                  disabled={!editingItemA.trim() || !editingItemB.trim()}
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
                            <div className="group/contrast">
                              <div className="flex items-start gap-2 mb-2">
                                <div className="flex-1">
                                  <div className="text-sm text-scripture-text">
                                    <span className="font-medium">{contrast.itemA}</span>
                                    <span className="mx-2 text-scripture-muted">⇔</span>
                                    <span className="font-medium">{contrast.itemB}</span>
                                  </div>
                                  {contrast.notes && (
                                    <div className="mt-2 text-xs text-scripture-muted italic">
                                      {contrast.notes}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover/contrast:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleStartEdit(contrast)}
                                    className="px-2 py-1 text-xs text-scripture-muted hover:text-scripture-accent transition-colors rounded hover:bg-scripture-elevated"
                                    title="Edit contrast"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => handleDeleteClick(contrast.id)}
                                    className="px-2 py-1 text-xs text-highlight-red hover:text-highlight-red/80 transition-colors rounded hover:bg-scripture-elevated"
                                    title="Delete contrast"
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
