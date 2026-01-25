/**
 * 5 W's and H Worksheet Component
 * 
 * Worksheet for recording Who, What, When, Where, Why, and How observations.
 */

import { useState, useEffect } from 'react';
import { useObservationStore } from '@/stores/observationStore';
import { useBibleStore } from '@/stores/bibleStore';
import { formatVerseRef, getBookById } from '@/types/bible';
import type { FiveWAndHEntry } from '@/types/observation';
import type { VerseRef } from '@/types/bible';
import { Textarea, ConfirmationDialog } from '@/components/shared';

interface FiveWAndHProps {
  selectedText?: string;
  verseRef?: VerseRef;
}

// Helper to create a unique key for a verse reference
const getVerseKey = (ref: VerseRef): string => {
  return `${ref.book}:${ref.chapter}:${ref.verse}`;
};

// Group entries by verse
const groupByVerse = (entries: FiveWAndHEntry[]): Map<string, FiveWAndHEntry[]> => {
  const map = new Map<string, FiveWAndHEntry[]>();
  entries.forEach(entry => {
    const key = getVerseKey(entry.verseRef);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(entry);
  });
  return map;
};

// Sort verse groups by canonical order
const sortVerseGroups = (groups: Map<string, FiveWAndHEntry[]>): Array<[string, FiveWAndHEntry[]]> => {
  return Array.from(groups.entries()).sort(([keyA], [keyB]) => {
    const [bookA, chapterA, verseA] = keyA.split(':').map(Number);
    const [bookB, chapterB, verseB] = keyB.split(':').map(Number);
    
    if (bookA !== bookB) return bookA - bookB;
    if (chapterA !== chapterB) return chapterA - chapterB;
    return verseA - verseB;
  });
};

export function FiveWAndH({ selectedText, verseRef: initialVerseRef }: FiveWAndHProps) {
  const { currentBook, currentChapter } = useBibleStore();
  const { 
    fiveWAndHEntries, 
    loadFiveWAndH, 
    createFiveWAndH, 
    updateFiveWAndH, 
    deleteFiveWAndH 
  } = useObservationStore();
  
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedVerses, setExpandedVerses] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  
  // Form state
  const [formVerseRef, setFormVerseRef] = useState<VerseRef | null>(
    initialVerseRef || (currentBook && currentChapter ? { book: currentBook, chapter: currentChapter, verse: 1 } : null)
  );
  const [formWho, setFormWho] = useState('');
  const [formWhat, setFormWhat] = useState('');
  const [formWhen, setFormWhen] = useState('');
  const [formWhere, setFormWhere] = useState('');
  const [formWhy, setFormWhy] = useState('');
  const [formHow, setFormHow] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Load entries on mount
  useEffect(() => {
    loadFiveWAndH();
  }, [loadFiveWAndH]);

  // If initialVerseRef is provided, expand that verse and scroll to it
  useEffect(() => {
    if (initialVerseRef && fiveWAndHEntries.length > 0) {
      const key = getVerseKey(initialVerseRef);
      setExpandedVerses(new Set([key]));
      // Small delay to ensure the expansion completes before scrolling
      setTimeout(() => {
        const verseElement = document.querySelector(`[data-verse-key="${key}"]`);
        if (verseElement) {
          verseElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  }, [initialVerseRef, fiveWAndHEntries]);

  const toggleVerse = (verseKey: string) => {
    const newExpanded = new Set(expandedVerses);
    if (newExpanded.has(verseKey)) {
      newExpanded.delete(verseKey);
    } else {
      newExpanded.add(verseKey);
    }
    setExpandedVerses(newExpanded);
  };

  const resetForm = () => {
    setFormVerseRef(initialVerseRef || (currentBook && currentChapter ? { book: currentBook, chapter: currentChapter, verse: 1 } : null));
    setFormWho('');
    setFormWhat('');
    setFormWhen('');
    setFormWhere('');
    setFormWhy('');
    setFormHow('');
    setFormNotes('');
    setIsCreating(false);
    setEditingId(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const handleStartEdit = (entry: FiveWAndHEntry) => {
    setFormVerseRef(entry.verseRef);
    setFormWho(entry.who || '');
    setFormWhat(entry.what || '');
    setFormWhen(entry.when || '');
    setFormWhere(entry.where || '');
    setFormWhy(entry.why || '');
    setFormHow(entry.how || '');
    setFormNotes(entry.notes || '');
    setEditingId(entry.id);
    setIsCreating(false);
  };

  const handleCancel = () => {
    resetForm();
  };

  const handleSave = async () => {
    if (!formVerseRef) {
      alert('Please select a verse reference');
      return;
    }

    // At least one field must have content
    const hasContent = formWho.trim() || 
                       formWhat.trim() || 
                       formWhen.trim() || 
                       formWhere.trim() || 
                       formWhy.trim() || 
                       formHow.trim() || 
                       formNotes.trim();
    
    if (!hasContent) {
      alert('Please fill in at least one field');
      return;
    }

    try {
      if (editingId) {
        // Update existing entry
        const existing = fiveWAndHEntries.find(e => e.id === editingId);
        if (existing) {
          await updateFiveWAndH({
            ...existing,
            verseRef: formVerseRef,
            who: formWho.trim() || undefined,
            what: formWhat.trim() || undefined,
            when: formWhen.trim() || undefined,
            where: formWhere.trim() || undefined,
            why: formWhy.trim() || undefined,
            how: formHow.trim() || undefined,
            notes: formNotes.trim() || undefined,
          });
        }
      } else {
        // Create new entry
        await createFiveWAndH({
          verseRef: formVerseRef,
          who: formWho.trim() || undefined,
          what: formWhat.trim() || undefined,
          when: formWhen.trim() || undefined,
          where: formWhere.trim() || undefined,
          why: formWhy.trim() || undefined,
          how: formHow.trim() || undefined,
          notes: formNotes.trim() || undefined,
        });
      }
      
      resetForm();
      await loadFiveWAndH();
    } catch (error) {
      console.error('Error saving 5W+H entry:', error);
      alert('Failed to save entry. Please try again.');
    }
  };

  const handleDeleteClick = (entryId: string) => {
    setConfirmDeleteId(entryId);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    
    const idToDelete = confirmDeleteId;
    setConfirmDeleteId(null);
    
    try {
      await deleteFiveWAndH(idToDelete);
      await loadFiveWAndH();
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Failed to delete entry. Please try again.');
    }
  };

  const handleCancelDelete = () => {
    setConfirmDeleteId(null);
  };

  const verseGroups = groupByVerse(fiveWAndHEntries);
  const sortedGroups = sortVerseGroups(verseGroups);

  return (
    <>
      <ConfirmationDialog
        isOpen={confirmDeleteId !== null}
        title="Delete Entry"
        message="Are you sure you want to delete this entry?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        destructive={true}
      />
      <div className="flex flex-col h-full min-h-0">
      {/* Create/Edit Form */}
      {(isCreating || editingId) && (
        <div className="flex-shrink-0 border-b border-scripture-border/50 bg-scripture-elevated/30 p-4 space-y-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-ui font-semibold text-scripture-text">
              {editingId ? 'Edit Entry' : 'New Entry'}
            </h3>
            <button
              onClick={handleCancel}
              className="text-scripture-muted hover:text-scripture-text transition-colors"
              aria-label="Cancel"
            >
              ✕
            </button>
          </div>

          {/* Verse Reference */}
          <div>
            <label className="block text-xs font-ui font-semibold text-scripture-text uppercase tracking-wider mb-2">
              Verse Reference
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formVerseRef ? formatVerseRef(formVerseRef.book, formVerseRef.chapter, formVerseRef.verse) : ''}
                readOnly
                className="flex-1 px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg text-scripture-text"
                placeholder="Select verse from Bible text"
              />
              {initialVerseRef && (
                <button
                  onClick={() => {
                    setFormVerseRef(initialVerseRef);
                  }}
                  className="px-3 py-2 text-xs bg-scripture-surface text-scripture-text rounded-lg hover:bg-scripture-border/50 transition-colors"
                >
                  Use Selected
                </button>
              )}
            </div>
            {!formVerseRef && (
              <p className="text-xs text-scripture-muted mt-1">
                Select a verse in the Bible text to add observations
              </p>
            )}
          </div>

          {/* 5W+H Fields */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Textarea
                label="Who"
                value={formWho}
                onChange={(e) => setFormWho(e.target.value)}
                placeholder="People or characters involved..."
                rows={2}
                className="text-sm"
              />
            </div>
            <div>
              <Textarea
                label="What"
                value={formWhat}
                onChange={(e) => setFormWhat(e.target.value)}
                placeholder="Events or actions that occurred..."
                rows={2}
                className="text-sm"
              />
            </div>
            <div>
              <Textarea
                label="When"
                value={formWhen}
                onChange={(e) => setFormWhen(e.target.value)}
                placeholder="Time expressions or chronology..."
                rows={2}
                className="text-sm"
              />
            </div>
            <div>
              <Textarea
                label="Where"
                value={formWhere}
                onChange={(e) => setFormWhere(e.target.value)}
                placeholder="Places or locations..."
                rows={2}
                className="text-sm"
              />
            </div>
            <div>
              <Textarea
                label="Why"
                value={formWhy}
                onChange={(e) => setFormWhy(e.target.value)}
                placeholder="Reasons or motivations..."
                rows={2}
                className="text-sm"
              />
            </div>
            <div>
              <Textarea
                label="How"
                value={formHow}
                onChange={(e) => setFormHow(e.target.value)}
                placeholder="Methods or means..."
                rows={2}
                className="text-sm"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <Textarea
              label="Additional Notes"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Any additional observations..."
              rows={3}
              className="text-sm"
            />
          </div>

          {/* Save/Cancel */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-scripture-border/30">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-xs bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!formVerseRef || (!formWho.trim() && !formWhat.trim() && !formWhen.trim() && !formWhere.trim() && !formWhy.trim() && !formHow.trim() && !formNotes.trim())}
              className="px-3 py-1.5 text-xs bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {editingId ? 'Save' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Entries List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
        {/* New Entry button */}
        {!isCreating && !editingId && (
          <div className="mb-4">
            <button
              onClick={handleStartCreate}
              className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
            >
              + New Entry
            </button>
          </div>
        )}

        {sortedGroups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-scripture-muted text-sm mb-4">No 5W+H entries yet.</p>
            <p className="text-scripture-muted text-xs mb-4">
              Use the 5W+H worksheet to record observations about Who, What, When, Where, Why, and How from scripture passages.
            </p>
            <button
              onClick={handleStartCreate}
              className="px-4 py-2 bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
            >
              Create Your First Entry
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedGroups.map(([verseKey, entries]) => {
              const verseRef = entries[0].verseRef;
              const isExpanded = expandedVerses.has(verseKey);
              
              return (
                <div
                  key={verseKey}
                  data-verse-key={verseKey}
                  className="bg-scripture-surface rounded-xl border border-scripture-border/50 shadow-sm overflow-hidden"
                >
                  {/* Verse header */}
                  <div className="p-4">
                    <button
                      onClick={() => toggleVerse(verseKey)}
                      className="w-full flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-scripture-accent">
                          {formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse)}
                        </span>
                        <span className="text-xs text-scripture-muted bg-scripture-elevated px-2 py-0.5 rounded">
                          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
                        </span>
                      </div>
                      <span className="text-scripture-muted">
                        {isExpanded ? '▼' : '▶'}
                      </span>
                    </button>
                  </div>

                  {/* Entries (collapsible) */}
                  {isExpanded && (
                    <div className="border-t border-scripture-muted/20 p-4 bg-scripture-bg/50 space-y-4">
                      {entries.map(entry => (
                        <div
                          key={entry.id}
                          className="bg-scripture-surface rounded-lg border border-scripture-border/30 p-4 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 space-y-2">
                              {entry.who && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Who
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.who}</div>
                                </div>
                              )}
                              {entry.what && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    What
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.what}</div>
                                </div>
                              )}
                              {entry.when && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    When
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.when}</div>
                                </div>
                              )}
                              {entry.where && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Where
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.where}</div>
                                </div>
                              )}
                              {entry.why && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Why
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.why}</div>
                                </div>
                              )}
                              {entry.how && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    How
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.how}</div>
                                </div>
                              )}
                              {entry.notes && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Notes
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.notes}</div>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleStartEdit(entry)}
                                className="px-2 py-1 text-xs text-scripture-muted hover:text-scripture-text transition-colors rounded hover:bg-scripture-elevated"
                                title="Edit entry"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteClick(entry.id)}
                                className="px-2 py-1 text-xs text-highlight-red hover:text-highlight-red/80 transition-colors rounded hover:bg-scripture-elevated"
                                title="Delete entry"
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </>
  );
}
