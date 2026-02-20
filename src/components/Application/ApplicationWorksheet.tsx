/**
 * Application Worksheet Component
 * 
 * Worksheet for recording how Scripture applies to life through:
 * - Teaching: What does this teach me?
 * - Reproof: What does this rebuke/correct in my life?
 * - Correction: How should I change?
 * - Training in Righteousness: How does this train me to be more like Christ?
 * 
 * Based on 2 Timothy 3:16-17
 */

import { useState, useEffect, useMemo } from 'react';
import { useApplicationStore } from '@/stores/applicationStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import { formatVerseRef } from '@/types';
import type { ApplicationEntry } from '@/types';
import type { VerseRef } from '@/types';
import { Textarea, ConfirmationDialog } from '@/components/shared';
import { getChapterAnnotations } from '@/lib/database';

interface ApplicationWorksheetProps {
  selectedText?: string;
  verseRef?: VerseRef;
}

// Helper to create a unique key for a verse reference
const getVerseKey = (ref: VerseRef): string => {
  return `${ref.book}:${ref.chapter}:${ref.verse}`;
};

// Group entries by verse
const groupByVerse = (entries: ApplicationEntry[]): Map<string, ApplicationEntry[]> => {
  const map = new Map<string, ApplicationEntry[]>();
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
const sortVerseGroups = (groups: Map<string, ApplicationEntry[]>): Array<[string, ApplicationEntry[]]> => {
  return Array.from(groups.entries()).sort(([keyA], [keyB]) => {
    const [bookA, chapterA, verseA] = keyA.split(':').map(Number);
    const [bookB, chapterB, verseB] = keyB.split(':').map(Number);
    
    if (bookA !== bookB) return bookA - bookB;
    if (chapterA !== chapterB) return chapterA - chapterB;
    return verseA - verseB;
  });
};

export function ApplicationWorksheet({ verseRef: initialVerseRef }: ApplicationWorksheetProps) {
  const { currentBook, currentChapter, currentModuleId } = useBibleStore();
  const {
    applicationEntries,
    loadApplications,
    createApplication,
    updateApplication,
    deleteApplication,
  } = useApplicationStore();
  const { presets } = useMarkingPresetStore();
  const { activeStudyId } = useStudyStore();
  
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedVerses, setExpandedVerses] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [availableKeywords, setAvailableKeywords] = useState<Array<{ id: string; word: string }>>([]);
  
  // Form state
  const [formVerseRef, setFormVerseRef] = useState<VerseRef | null>(
    initialVerseRef || (currentBook && currentChapter ? { book: currentBook, chapter: currentChapter, verse: 1 } : null)
  );
  const [formTeaching, setFormTeaching] = useState('');
  const [formReproof, setFormReproof] = useState('');
  const [formCorrection, setFormCorrection] = useState('');
  const [formTraining, setFormTraining] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formLinkedPresetIds, setFormLinkedPresetIds] = useState<string[]>([]);

  // Load entries on mount
  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  // Load available keywords for the current verse when formVerseRef changes
  useEffect(() => {
    const loadKeywordsForVerse = async () => {
      if (!formVerseRef || !currentModuleId) {
        setAvailableKeywords([]);
        return;
      }

      try {
        // Get all annotations for the chapter
        const annotations = await getChapterAnnotations(
          currentModuleId,
          formVerseRef.book,
          formVerseRef.chapter
        );

        // Filter annotations for this specific verse that have presetId
        const verseAnnotations = annotations.filter(ann => {
          if (ann.type === 'symbol') {
            return ann.ref.book === formVerseRef.book &&
                   ann.ref.chapter === formVerseRef.chapter &&
                   ann.ref.verse === formVerseRef.verse &&
                   ann.presetId;
          } else {
            return ann.startRef.book === formVerseRef.book &&
                   ann.startRef.chapter === formVerseRef.chapter &&
                   ann.startRef.verse === formVerseRef.verse &&
                   ann.presetId;
          }
        });

        // Get unique presetIds and find their words
        const presetIds = new Set<string>();
        verseAnnotations.forEach(ann => {
          if (ann.presetId) {
            presetIds.add(ann.presetId);
          }
        });

        // Map to preset words
        const keywords = Array.from(presetIds)
          .map(presetId => {
            const preset = presets.find(p => p.id === presetId);
            return preset && preset.word ? { id: presetId, word: preset.word } : null;
          })
          .filter((k): k is { id: string; word: string } => k !== null);

        setAvailableKeywords(keywords);
      } catch (error) {
        console.error('Error loading keywords for verse:', error);
        setAvailableKeywords([]);
      }
    };

    loadKeywordsForVerse();
  }, [formVerseRef, currentModuleId, presets]);

  const filteredEntries = useMemo(
    () =>
      applicationEntries.filter((e) =>
        !activeStudyId ? !e.studyId : (!e.studyId || e.studyId === activeStudyId)
      ),
    [applicationEntries, activeStudyId]
  );

  // If initialVerseRef is provided, expand that verse and scroll to it
  useEffect(() => {
    if (initialVerseRef && filteredEntries.length > 0) {
      const key = getVerseKey(initialVerseRef);
      queueMicrotask(() => setExpandedVerses(new Set([key])));
      // Small delay to ensure the expansion completes before scrolling
      setTimeout(() => {
        const verseElement = document.querySelector(`[data-verse-key="${key}"]`);
        if (verseElement) {
          verseElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  }, [initialVerseRef, filteredEntries]);

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
    setFormTeaching('');
    setFormReproof('');
    setFormCorrection('');
    setFormTraining('');
    setFormNotes('');
    setFormLinkedPresetIds([]);
    setIsCreating(false);
    setEditingId(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const handleStartEdit = (entry: ApplicationEntry) => {
    setFormVerseRef(entry.verseRef);
    setFormTeaching(entry.teaching || '');
    setFormReproof(entry.reproof || '');
    setFormCorrection(entry.correction || '');
    setFormTraining(entry.training || '');
    setFormNotes(entry.notes || '');
    setFormLinkedPresetIds(entry.linkedPresetIds || []);
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
    const hasContent = formTeaching.trim() || 
                       formReproof.trim() || 
                       formCorrection.trim() || 
                       formTraining.trim() || 
                       formNotes.trim();
    
    if (!hasContent) {
      alert('Please fill in at least one field');
      return;
    }

    try {
      if (editingId) {
        // Update existing entry
        const existing = applicationEntries.find(e => e.id === editingId);
        if (existing) {
          await updateApplication({
            ...existing,
            verseRef: formVerseRef,
            teaching: formTeaching.trim() || undefined,
            reproof: formReproof.trim() || undefined,
            correction: formCorrection.trim() || undefined,
            training: formTraining.trim() || undefined,
            notes: formNotes.trim() || undefined,
            linkedPresetIds: formLinkedPresetIds.length > 0 ? formLinkedPresetIds : undefined,
          });
        }
      } else {
        // Create new entry
        await createApplication({
          verseRef: formVerseRef,
          teaching: formTeaching.trim() || undefined,
          reproof: formReproof.trim() || undefined,
          correction: formCorrection.trim() || undefined,
          training: formTraining.trim() || undefined,
          notes: formNotes.trim() || undefined,
          linkedPresetIds: formLinkedPresetIds.length > 0 ? formLinkedPresetIds : undefined,
          studyId: activeStudyId ?? undefined,
        });
      }
      
      resetForm();
      await loadApplications();
    } catch (error) {
      console.error('Error saving application entry:', error);
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
      await deleteApplication(idToDelete);
      await loadApplications();
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Failed to delete entry. Please try again.');
    }
  };

  const handleCancelDelete = () => {
    setConfirmDeleteId(null);
  };

  const verseGroups = groupByVerse(filteredEntries);
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
                Select a verse in the Bible text to add application notes
              </p>
            )}
          </div>

          {/* Application Fields */}
          <div className="space-y-4">
            <div>
              <Textarea
                label="Teaching"
                value={formTeaching}
                onChange={(e) => setFormTeaching(e.target.value)}
                placeholder="What does this teach me?"
                rows={3}
                className="text-sm"
              />
              <p className="text-xs text-scripture-muted mt-1">
                What truth or principle does this passage teach?
              </p>
            </div>
            <div>
              <Textarea
                label="Reproof"
                value={formReproof}
                onChange={(e) => setFormReproof(e.target.value)}
                placeholder="What does this rebuke or correct in my life?"
                rows={3}
                className="text-sm"
              />
              <p className="text-xs text-scripture-muted mt-1">
                What sin, attitude, or behavior does this expose in my life?
              </p>
            </div>
            <div>
              <Textarea
                label="Correction"
                value={formCorrection}
                onChange={(e) => setFormCorrection(e.target.value)}
                placeholder="How should I change?"
                rows={3}
                className="text-sm"
              />
              <p className="text-xs text-scripture-muted mt-1">
                What specific changes should I make in my life?
              </p>
            </div>
            <div>
              <Textarea
                label="Training in Righteousness"
                value={formTraining}
                onChange={(e) => setFormTraining(e.target.value)}
                placeholder="How does this train me to be more like Christ?"
                rows={3}
                className="text-sm"
              />
              <p className="text-xs text-scripture-muted mt-1">
                How does this help me grow in godliness and Christlikeness?
              </p>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Textarea
              label="Additional Notes"
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              placeholder="Any additional thoughts or reflections..."
              rows={3}
              className="text-sm"
            />
          </div>

          {/* Linked Keywords */}
          {formVerseRef && availableKeywords.length > 0 && (
            <div>
              <label className="block text-xs font-ui font-semibold text-scripture-text uppercase tracking-wider mb-2">
                Link to Marked Keywords
              </label>
              <div className="flex flex-wrap gap-2">
                {availableKeywords.map(keyword => {
                  const isLinked = formLinkedPresetIds.includes(keyword.id);
                  return (
                    <button
                      key={keyword.id}
                      type="button"
                      onClick={() => {
                        if (isLinked) {
                          setFormLinkedPresetIds(formLinkedPresetIds.filter(id => id !== keyword.id));
                        } else {
                          setFormLinkedPresetIds([...formLinkedPresetIds, keyword.id]);
                        }
                      }}
                      className={`px-3 py-1.5 text-xs rounded transition-colors ${
                        isLinked
                          ? 'bg-scripture-accent text-white'
                          : 'bg-scripture-surface text-scripture-text border border-scripture-border/50 hover:bg-scripture-border/50'
                      }`}
                    >
                      {keyword.word} {isLinked ? '✓' : '+'}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-scripture-muted mt-1">
                Link this entry to keywords marked in this verse
              </p>
            </div>
          )}

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
              disabled={!formVerseRef || (!formTeaching.trim() && !formReproof.trim() && !formCorrection.trim() && !formTraining.trim() && !formNotes.trim())}
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
            <p className="text-scripture-muted text-sm mb-4">No application entries yet.</p>
            <p className="text-scripture-muted text-xs mb-4">
              Use the Application worksheet to record how Scripture applies to your life through teaching, reproof, correction, and training in righteousness (2 Timothy 3:16-17).
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
                            <div className="flex-1 space-y-3">
                              {entry.teaching && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Teaching
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.teaching}</div>
                                </div>
                              )}
                              {entry.reproof && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Reproof
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.reproof}</div>
                                </div>
                              )}
                              {entry.correction && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Correction
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.correction}</div>
                                </div>
                              )}
                              {entry.training && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Training in Righteousness
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.training}</div>
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
                              {entry.linkedPresetIds && entry.linkedPresetIds.length > 0 && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Linked Keywords
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {entry.linkedPresetIds.map(presetId => {
                                      const preset = presets.find(p => p.id === presetId);
                                      return preset && preset.word ? (
                                        <span
                                          key={presetId}
                                          className="inline-flex items-center px-2 py-0.5 text-xs bg-scripture-accent/20 text-scripture-accent rounded"
                                        >
                                          {preset.word}
                                        </span>
                                      ) : null;
                                    })}
                                  </div>
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
