/**
 * Interpretation Worksheet Component
 * 
 * Worksheet for recording interpretation insights with guided questions.
 */

import { useState, useEffect, useMemo } from 'react';
import { useInterpretationStore } from '@/stores/interpretationStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import { formatVerseRef, getBookById } from '@/types/bible';
import type { InterpretationEntry } from '@/types/interpretation';
import type { VerseRef } from '@/types/bible';
import { Textarea, ConfirmationDialog } from '@/components/shared';
import { getChapterAnnotations } from '@/lib/db';
import type { Annotation } from '@/types/annotation';

interface InterpretationWorksheetProps {
  selectedText?: string;
  verseRef?: VerseRef;
}

// Helper to create a unique key for a verse reference
const getVerseKey = (ref: VerseRef, endRef?: VerseRef): string => {
  if (endRef && (endRef.verse !== ref.verse || endRef.chapter !== ref.chapter)) {
    return `${ref.book}:${ref.chapter}:${ref.verse}-${endRef.verse}`;
  }
  return `${ref.book}:${ref.chapter}:${ref.verse}`;
};

// Group entries by verse
const groupByVerse = (entries: InterpretationEntry[]): Map<string, InterpretationEntry[]> => {
  const map = new Map<string, InterpretationEntry[]>();
  entries.forEach(entry => {
    const key = getVerseKey(entry.verseRef, entry.endVerseRef);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(entry);
  });
  return map;
};

// Sort verse groups by canonical order
const sortVerseGroups = (groups: Map<string, InterpretationEntry[]>): Array<[string, InterpretationEntry[]]> => {
  return Array.from(groups.entries()).sort(([keyA], [keyB]) => {
    const parseKey = (key: string) => {
      const [book, chapter, versePart] = key.split(':');
      const [verse] = versePart.split('-');
      return { book: Number(book), chapter: Number(chapter), verse: Number(verse) };
    };
    
    const a = parseKey(keyA);
    const b = parseKey(keyB);
    
    if (a.book !== b.book) return a.book - b.book;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  });
};

export function InterpretationWorksheet({ selectedText, verseRef: initialVerseRef }: InterpretationWorksheetProps) {
  const { currentBook, currentChapter, currentModuleId } = useBibleStore();
  const { 
    interpretationEntries, 
    loadInterpretations, 
    createInterpretation, 
    updateInterpretation, 
    deleteInterpretation 
  } = useInterpretationStore();
  const { presets } = useMarkingPresetStore();
  const { studies, activeStudyId } = useStudyStore();
  
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [expandedVerses, setExpandedVerses] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [availableKeywords, setAvailableKeywords] = useState<Array<{ id: string; word: string }>>([]);
  
  // Form state
  const [formVerseRef, setFormVerseRef] = useState<VerseRef | null>(
    initialVerseRef || (currentBook && currentChapter ? { book: currentBook, chapter: currentChapter, verse: 1 } : null)
  );
  const [formEndVerseRef, setFormEndVerseRef] = useState<VerseRef | null>(null);
  const [formMeaning, setFormMeaning] = useState('');
  const [formAuthorIntent, setFormAuthorIntent] = useState('');
  const [formKeyThemes, setFormKeyThemes] = useState('');
  const [formContext, setFormContext] = useState('');
  const [formImplications, setFormImplications] = useState('');
  const [formCrossReferences, setFormCrossReferences] = useState('');
  const [formQuestions, setFormQuestions] = useState('');
  const [formInsights, setFormInsights] = useState('');
  const [formLinkedPresetIds, setFormLinkedPresetIds] = useState<string[]>([]);
  const [formStudyId, setFormStudyId] = useState<string>(activeStudyId || '');

  // Load entries on mount
  useEffect(() => {
    loadInterpretations();
  }, [loadInterpretations]);

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

        // Filter annotations for this verse range that have presetId
        const startVerse = formVerseRef.verse;
        const endVerse = formEndVerseRef?.verse || formVerseRef.verse;
        
        const verseAnnotations = annotations.filter(ann => {
          const verse = ann.type === 'symbol' ? ann.ref.verse : ann.startRef.verse;
          return verse >= startVerse && verse <= endVerse && ann.presetId;
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
  }, [formVerseRef, formEndVerseRef, currentModuleId, presets]);

  // If initialVerseRef is provided, expand that verse and scroll to it
  useEffect(() => {
    if (initialVerseRef && interpretationEntries.length > 0) {
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
  }, [initialVerseRef, interpretationEntries]);

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
    setFormEndVerseRef(null);
    setFormMeaning('');
    setFormAuthorIntent('');
    setFormKeyThemes('');
    setFormContext('');
    setFormImplications('');
    setFormCrossReferences('');
    setFormQuestions('');
    setFormInsights('');
    setFormLinkedPresetIds([]);
    setFormStudyId(activeStudyId || '');
    setIsCreating(false);
    setEditingId(null);
  };

  const handleStartCreate = () => {
    resetForm();
    setIsCreating(true);
  };

  const handleStartEdit = (entry: InterpretationEntry) => {
    setFormVerseRef(entry.verseRef);
    setFormEndVerseRef(entry.endVerseRef || null);
    setFormMeaning(entry.meaning || '');
    setFormAuthorIntent(entry.authorIntent || '');
    setFormKeyThemes(entry.keyThemes || '');
    setFormContext(entry.context || '');
    setFormImplications(entry.implications || '');
    setFormCrossReferences(entry.crossReferences || '');
    setFormQuestions(entry.questions || '');
    setFormInsights(entry.insights || '');
    setFormLinkedPresetIds(entry.linkedPresetIds || []);
    setFormStudyId(entry.studyId || '');
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
    const hasContent = formMeaning.trim() || 
                       formAuthorIntent.trim() || 
                       formKeyThemes.trim() || 
                       formContext.trim() || 
                       formImplications.trim() || 
                       formCrossReferences.trim() || 
                       formQuestions.trim() || 
                       formInsights.trim();
    
    if (!hasContent) {
      alert('Please fill in at least one field');
      return;
    }

    try {
      if (editingId) {
        // Update existing entry
        const existing = interpretationEntries.find(e => e.id === editingId);
        if (existing) {
          await updateInterpretation({
            ...existing,
            verseRef: formVerseRef,
            endVerseRef: formEndVerseRef || undefined,
            meaning: formMeaning.trim() || undefined,
            authorIntent: formAuthorIntent.trim() || undefined,
            keyThemes: formKeyThemes.trim() || undefined,
            context: formContext.trim() || undefined,
            implications: formImplications.trim() || undefined,
            crossReferences: formCrossReferences.trim() || undefined,
            questions: formQuestions.trim() || undefined,
            insights: formInsights.trim() || undefined,
            linkedPresetIds: formLinkedPresetIds.length > 0 ? formLinkedPresetIds : undefined,
            studyId: formStudyId || undefined,
          });
        }
      } else {
        // Create new entry
        await createInterpretation({
          verseRef: formVerseRef,
          endVerseRef: formEndVerseRef || undefined,
          meaning: formMeaning.trim() || undefined,
          authorIntent: formAuthorIntent.trim() || undefined,
          keyThemes: formKeyThemes.trim() || undefined,
          context: formContext.trim() || undefined,
          implications: formImplications.trim() || undefined,
          crossReferences: formCrossReferences.trim() || undefined,
          questions: formQuestions.trim() || undefined,
          insights: formInsights.trim() || undefined,
          linkedPresetIds: formLinkedPresetIds.length > 0 ? formLinkedPresetIds : undefined,
          studyId: formStudyId || undefined,
        });
      }
      
      resetForm();
      await loadInterpretations();
    } catch (error) {
      console.error('Error saving interpretation entry:', error);
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
      await deleteInterpretation(idToDelete);
      await loadInterpretations();
    } catch (error) {
      console.error('Error deleting entry:', error);
      alert('Failed to delete entry. Please try again.');
    }
  };

  const handleCancelDelete = () => {
    setConfirmDeleteId(null);
  };

  const verseGroups = groupByVerse(interpretationEntries);
  const sortedGroups = sortVerseGroups(verseGroups);

  return (
    <>
      <ConfirmationDialog
        isOpen={confirmDeleteId !== null}
        title="Delete Entry"
        message="Are you sure you want to delete this interpretation entry?"
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
              {editingId ? 'Edit Interpretation' : 'New Interpretation'}
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
                Select a verse in the Bible text to add interpretation
              </p>
            )}
          </div>

          {/* End Verse Reference (optional) */}
          {formVerseRef && (
            <div>
              <label className="block text-xs font-ui font-semibold text-scripture-text uppercase tracking-wider mb-2">
                End Verse (Optional - for passages spanning multiple verses)
              </label>
              <input
                type="number"
                min={formVerseRef.verse}
                value={formEndVerseRef?.verse || ''}
                onChange={(e) => {
                  const verse = e.target.value ? parseInt(e.target.value, 10) : null;
                  if (verse && formVerseRef) {
                    setFormEndVerseRef({ ...formVerseRef, verse });
                  } else {
                    setFormEndVerseRef(null);
                  }
                }}
                placeholder="Leave blank for single verse"
                className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
              />
            </div>
          )}

          {/* Study Selection */}
          <div>
            <label className="block text-xs font-ui font-semibold text-scripture-text uppercase tracking-wider mb-2">
              Study (Optional)
            </label>
            <select
              value={formStudyId}
              onChange={(e) => setFormStudyId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
            >
              <option value="">No study (global)</option>
              {studies.map(study => (
                <option key={study.id} value={study.id}>{study.name}</option>
              ))}
            </select>
          </div>

          {/* Interpretation Fields */}
          <div className="space-y-4">
            <Textarea
              label="What does this passage mean?"
              value={formMeaning}
              onChange={(e) => setFormMeaning(e.target.value)}
              placeholder="Explain the meaning of this passage..."
              rows={3}
              className="text-sm"
            />
            <Textarea
              label="What is the author's intent or purpose?"
              value={formAuthorIntent}
              onChange={(e) => setFormAuthorIntent(e.target.value)}
              placeholder="What was the author trying to communicate?"
              rows={3}
              className="text-sm"
            />
            <Textarea
              label="What are the key themes or concepts?"
              value={formKeyThemes}
              onChange={(e) => setFormKeyThemes(e.target.value)}
              placeholder="Identify main themes and concepts..."
              rows={3}
              className="text-sm"
            />
            <Textarea
              label="What is the historical, cultural, or literary context?"
              value={formContext}
              onChange={(e) => setFormContext(e.target.value)}
              placeholder="Context that helps understand this passage..."
              rows={3}
              className="text-sm"
            />
            <Textarea
              label="What are the implications or applications?"
              value={formImplications}
              onChange={(e) => setFormImplications(e.target.value)}
              placeholder="What does this mean for us today?"
              rows={3}
              className="text-sm"
            />
            <Textarea
              label="How does this relate to other passages?"
              value={formCrossReferences}
              onChange={(e) => setFormCrossReferences(e.target.value)}
              placeholder="Cross-references, parallel passages, or related verses..."
              rows={3}
              className="text-sm"
            />
            <Textarea
              label="What questions does this passage raise?"
              value={formQuestions}
              onChange={(e) => setFormQuestions(e.target.value)}
              placeholder="Questions for further study or reflection..."
              rows={3}
              className="text-sm"
            />
            <Textarea
              label="Additional insights"
              value={formInsights}
              onChange={(e) => setFormInsights(e.target.value)}
              placeholder="Any other insights or observations..."
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
                Link this interpretation to keywords marked in this passage
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
              disabled={!formVerseRef || (!formMeaning.trim() && !formAuthorIntent.trim() && !formKeyThemes.trim() && !formContext.trim() && !formImplications.trim() && !formCrossReferences.trim() && !formQuestions.trim() && !formInsights.trim())}
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
              + New Interpretation
            </button>
          </div>
        )}

        {sortedGroups.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-scripture-muted text-sm mb-4">No interpretation entries yet.</p>
            <p className="text-scripture-muted text-xs mb-4">
              Use the interpretation worksheet to record insights about the meaning, context, and implications of scripture passages.
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
              const endVerseRef = entries[0].endVerseRef;
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
                          {endVerseRef && endVerseRef.verse !== verseRef.verse && `-${endVerseRef.verse}`}
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
                              {entry.meaning && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Meaning
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.meaning}</div>
                                </div>
                              )}
                              {entry.authorIntent && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Author's Intent
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.authorIntent}</div>
                                </div>
                              )}
                              {entry.keyThemes && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Key Themes
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.keyThemes}</div>
                                </div>
                              )}
                              {entry.context && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Context
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.context}</div>
                                </div>
                              )}
                              {entry.implications && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Implications
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.implications}</div>
                                </div>
                              )}
                              {entry.crossReferences && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Cross References
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.crossReferences}</div>
                                </div>
                              )}
                              {entry.questions && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Questions
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.questions}</div>
                                </div>
                              )}
                              {entry.insights && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Additional Insights
                                  </div>
                                  <div className="text-sm text-scripture-text">{entry.insights}</div>
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
                              {entry.studyId && (
                                <div>
                                  <div className="text-xs font-ui font-semibold text-scripture-muted uppercase tracking-wider mb-1">
                                    Study
                                  </div>
                                  <div className="text-sm text-scripture-text">
                                    {studies.find(s => s.id === entry.studyId)?.name || entry.studyId}
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
