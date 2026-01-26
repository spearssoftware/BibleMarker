/**
 * Conclusion Terms Tracker
 * 
 * Component for recording and displaying logical flow of conclusions and therefore statements.
 */

import { useState, useEffect } from 'react';
import { useConclusionStore } from '@/stores/conclusionStore';
import { useBibleStore } from '@/stores/bibleStore';
import type { Conclusion } from '@/types/conclusion';
import type { VerseRef } from '@/types/bible';
import { formatVerseRef, getBookById } from '@/types/bible';
import { ConfirmationDialog } from '@/components/shared';

interface ConclusionTrackerProps {
  selectedText?: string;
  verseRef?: VerseRef;
}

// Helper to create a unique key for a verse reference
const getVerseKey = (ref: VerseRef): string => {
  return `${ref.book}:${ref.chapter}:${ref.verse}`;
};

// Group conclusions by verse
const groupByVerse = (conclusions: Conclusion[]): Map<string, Conclusion[]> => {
  const map = new Map<string, Conclusion[]>();
  conclusions.forEach(conclusion => {
    const key = getVerseKey(conclusion.verseRef);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(conclusion);
  });
  return map;
};

// Sort verse groups by canonical order
const sortVerseGroups = (groups: Map<string, Conclusion[]>): Array<[string, Conclusion[]]> => {
  return Array.from(groups.entries()).sort(([keyA], [keyB]) => {
    const [bookA, chapterA, verseA] = keyA.split(':').map(Number);
    const [bookB, chapterB, verseB] = keyB.split(':').map(Number);
    
    if (bookA !== bookB) return bookA - bookB;
    if (chapterA !== chapterB) return chapterA - chapterB;
    return verseA - verseB;
  });
};

export function ConclusionTracker({ selectedText, verseRef: initialVerseRef }: ConclusionTrackerProps) {
  const { conclusions, loadConclusions, createConclusion, updateConclusion, deleteConclusion } = useConclusionStore();
  const { currentBook, currentChapter } = useBibleStore();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newTerm, setNewTerm] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [editingTerm, setEditingTerm] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [expandedVerses, setExpandedVerses] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  // Load conclusions on mount and auto-import from annotations
  useEffect(() => {
    const initialize = async () => {
      await loadConclusions();
      // Auto-import existing keyword annotations with conclusion symbols
      const { autoImportFromAnnotations } = useConclusionStore.getState();
      const importedCount = await autoImportFromAnnotations();
      if (importedCount > 0) {
        // Reload after import
        await loadConclusions();
      }
    };
    initialize();
  }, [loadConclusions]);

  // Pre-fill form if selectedText is provided
  useEffect(() => {
    if (selectedText && isCreating && !newTerm) {
      // Pre-fill with selected text
      setNewTerm(selectedText.trim());
    }
  }, [selectedText, isCreating, newTerm]);

  const handleCreate = async () => {
    const verseRef = getCurrentVerseRef();
    if (!verseRef || !newTerm.trim()) {
      alert('Please fill in the conclusion term and ensure you have a verse reference.');
      return;
    }

    await createConclusion(
      newTerm.trim(),
      verseRef,
      newNotes.trim() || undefined,
      undefined, // presetId - manual entry, no preset
      undefined, // annotationId - manual entry, no annotation
      undefined  // flowOrder - will be assigned if needed
    );

    setIsCreating(false);
    setNewTerm('');
    setNewNotes('');
    loadConclusions();
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewTerm('');
    setNewNotes('');
  };

  const handleStartEdit = (conclusion: Conclusion) => {
    setEditingId(conclusion.id);
    setEditingTerm(conclusion.term);
    setEditingNotes(conclusion.notes || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingTerm('');
    setEditingNotes('');
  };

  const handleSaveEdit = async (conclusionId: string) => {
    if (!editingTerm.trim()) {
      alert('Conclusion term is required.');
      return;
    }

    const conclusion = conclusions.find(c => c.id === conclusionId);
    if (!conclusion) return;

    await updateConclusion({
      ...conclusion,
      term: editingTerm.trim(),
      notes: editingNotes.trim() || undefined,
    });

    setEditingId(null);
    setEditingTerm('');
    setEditingNotes('');
    loadConclusions();
  };

  const handleDeleteClick = (conclusionId: string) => {
    setConfirmDeleteId(conclusionId);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;

    const idToDelete = confirmDeleteId;
    setConfirmDeleteId(null);

    await deleteConclusion(idToDelete);
    loadConclusions();
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
    if (conclusions.length > 0 && expandedVerses.size === 0) {
      const verseGroups = groupByVerse(conclusions);
      setExpandedVerses(new Set(verseGroups.keys()));
    }
  }, [conclusions, expandedVerses.size]);

  const verseGroups = groupByVerse(conclusions);
  const sortedGroups = sortVerseGroups(verseGroups);

  return (
    <>
      <ConfirmationDialog
        isOpen={confirmDeleteId !== null}
        title="Delete Conclusion"
        message="Are you sure you want to delete this conclusion? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        destructive={true}
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
      {/* Create new conclusion button */}
      {!isCreating && (
        <div className="mb-4">
          <button
            onClick={() => setIsCreating(true)}
            className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
          >
            + New Conclusion
          </button>
        </div>
      )}

      {/* Create form */}
      {isCreating && (
        <div className="mb-4 p-4 bg-scripture-surface rounded-xl border border-scripture-border/50">
          <h3 className="text-sm font-medium text-scripture-text mb-3">New Conclusion</h3>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-scripture-muted mb-1">Conclusion Term</label>
              <input
                type="text"
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                placeholder="e.g., 'therefore', 'so', 'thus', 'consequently'"
                className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs text-scripture-muted mb-1">Notes (optional)</label>
              <textarea
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Additional notes about this conclusion"
                rows={2}
                className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted resize-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCreate}
                disabled={!newTerm.trim() || !getCurrentVerseRef()}
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
      {conclusions.length === 0 && !isCreating && (
        <div className="text-center py-12">
          <p className="text-scripture-muted text-sm mb-4">No conclusions recorded yet.</p>
          <p className="text-scripture-muted text-xs mb-4">
            Record conclusion terms and logical flow you observe in the text. Use the → symbol to mark conclusion terms, then add details here.
          </p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
          >
            Create Your First Conclusion
          </button>
        </div>
      )}

      {/* Conclusions list */}
      {conclusions.length > 0 && (
        <div className="space-y-3">
          {sortedGroups.map(([verseKey, verseConclusions]) => {
            const isExpanded = expandedVerses.has(verseKey);
            const verseRef = verseConclusions[0].verseRef;
            const bookName = getBookById(verseRef.book)?.name || verseRef.book;

            return (
              <div
                key={verseKey}
                className="bg-scripture-surface rounded-xl border border-scripture-border/50 shadow-sm overflow-hidden"
              >
                {/* Verse header */}
                <div className="p-4">
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => toggleVerse(verseKey)}
                      className="flex-1 text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-scripture-accent">
                          {formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse)}
                        </span>
                        <span className="text-xs text-scripture-muted">
                          ({verseConclusions.length} {verseConclusions.length === 1 ? 'conclusion' : 'conclusions'})
                        </span>
                        <span className="text-xs text-scripture-muted">{isExpanded ? '▼' : '▶'}</span>
                      </div>
                    </button>
                  </div>
                </div>

                {/* Conclusions for this verse */}
                {isExpanded && (
                  <div className="border-t border-scripture-muted/20 p-4 bg-scripture-bg/50 space-y-3">
                    {verseConclusions.map(conclusion => {
                      const isEditing = editingId === conclusion.id;

                      return (
                        <div
                          key={conclusion.id}
                          className="bg-scripture-surface rounded-lg border border-scripture-border/30 p-3"
                        >
                          {isEditing ? (
                            <div className="space-y-3">
                              <div>
                                <label className="block text-xs text-scripture-muted mb-1">Conclusion Term</label>
                                <input
                                  type="text"
                                  value={editingTerm}
                                  onChange={(e) => setEditingTerm(e.target.value)}
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
                                  onClick={() => handleSaveEdit(conclusion.id)}
                                  disabled={!editingTerm.trim()}
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
                            <div className="group/conclusion">
                              <div className="flex items-start gap-2 mb-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <div className="text-sm text-scripture-text">
                                      <span className="font-medium">→ {conclusion.term}</span>
                                    </div>
                                    {conclusion.presetId && (
                                      <span className="text-xs bg-scripture-accent/20 text-scripture-accent px-2 py-0.5 rounded" title="Auto-imported from keyword annotation">
                                        Keyword
                                      </span>
                                    )}
                                    {conclusion.flowOrder && (
                                      <span className="text-xs bg-scripture-elevated text-scripture-muted px-2 py-0.5 rounded" title="Logical flow order">
                                        #{conclusion.flowOrder}
                                      </span>
                                    )}
                                  </div>
                                  {conclusion.notes && (
                                    <div className="mt-2 text-xs text-scripture-muted italic">
                                      {conclusion.notes}
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover/conclusion:opacity-100 transition-opacity">
                                  <button
                                    onClick={() => handleStartEdit(conclusion)}
                                    className="px-2 py-1 text-xs text-scripture-muted hover:text-scripture-accent transition-colors rounded hover:bg-scripture-elevated"
                                    title="Edit conclusion"
                                  >
                                    ✏️
                                  </button>
                                  <button
                                    onClick={() => handleDeleteClick(conclusion.id)}
                                    className="px-2 py-1 text-xs text-highlight-red hover:text-highlight-red/80 transition-colors rounded hover:bg-scripture-elevated"
                                    title="Delete conclusion"
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
