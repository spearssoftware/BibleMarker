/**
 * Add to List Component
 * 
 * Dialog to add selected text as an observation to a list.
 * Auto-selects the keyword's list when the selected text matches a keyword preset.
 */

import { useState, useEffect, useRef } from 'react';
import { useListStore } from '@/stores/listStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import type { VerseRef } from '@/types';
import { formatVerseRef } from '@/types';
import { SYMBOLS } from '@/types';
import { stripSymbols } from '@/lib/textUtils';
import { useModal } from '@/hooks/useModal';
import { Modal, Button, Textarea, DropdownSelect, ReadOnlyField, Input } from '@/components/shared';

interface AddToListProps {
  verseRef: VerseRef;
  selectedText: string;
  annotationId?: string;
  onClose: () => void;
  onAdded?: () => void;
}

export function AddToList({ verseRef, selectedText, annotationId, onClose, onAdded }: AddToListProps) {
  const { lists, loadLists, addItemToList, createList, getOrCreateListForKeyword, getMostRecentlyUsedList } = useListStore();
  const { presets } = useMarkingPresetStore();
  const { activeStudyId } = useStudyStore();
  const [observationText, setObservationText] = useState(stripSymbols(selectedText));
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-matched keyword list (set when selectedText matches a keyword)
  const [autoListId, setAutoListId] = useState<string | null>(null);
  const [autoListTitle, setAutoListTitle] = useState<string | null>(null);
  const [isAutoResolving, setIsAutoResolving] = useState(false);

  // Create new list flow
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [newListKeywordId, setNewListKeywordId] = useState<string>('');

  // Fallback: manual list selection (when no keyword match)
  const [selectedListId, setSelectedListId] = useState<string>('');

  useModal({
    isOpen: true,
    onClose,
    lockScroll: true,
    handleEscape: true,
    initialFocusRef: textareaRef,
  });

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  // Match selected text to a keyword preset and auto-resolve the list
  useEffect(() => {
    const strippedText = stripSymbols(selectedText).toLowerCase().trim();
    if (!strippedText) return;

    const matchingPreset = presets.find(p => {
      if (p.word?.toLowerCase().trim() === strippedText) return true;
      if (p.variants?.some(v => {
        const variantText = typeof v === 'string' ? v : v.text;
        return variantText.toLowerCase().trim() === strippedText;
      })) return true;
      return false;
    });

    if (matchingPreset) {
      setIsAutoResolving(true);
      getOrCreateListForKeyword(matchingPreset.id, activeStudyId ?? undefined, verseRef.book)
        .then(list => {
          setAutoListId(list.id);
          setAutoListTitle(list.title);
        })
        .catch(err => {
          console.error('[AddToList] Failed to auto-resolve list:', err);
        })
        .finally(() => setIsAutoResolving(false));
    }
  // Run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Filter lists to current study
  const studyLists = lists.filter(l =>
    activeStudyId ? l.studyId === activeStudyId : !l.studyId
  );

  // Set default manual selection to most recently used list when no auto match
  useEffect(() => {
    if (autoListId || studyLists.length === 0 || selectedListId) return;
    const recentList = getMostRecentlyUsedList();
    if (recentList && studyLists.some(l => l.id === recentList.id)) {
      queueMicrotask(() => setSelectedListId(recentList.id));
    } else {
      queueMicrotask(() => setSelectedListId(studyLists[0].id));
    }
  }, [studyLists, getMostRecentlyUsedList, selectedListId, autoListId]);

  const effectiveListId = autoListId || selectedListId;

  const handleAdd = async () => {
    if (!effectiveListId) {
      alert('Please select a list');
      return;
    }

    if (!observationText.trim()) {
      alert('Please enter an observation');
      return;
    }

    await addItemToList(effectiveListId, {
      content: observationText.trim(),
      verseRef,
      annotationId,
    });

    if (onAdded) {
      onAdded();
    }
    onClose();
  };

  const handleCreateAndAdd = async () => {
    if (!newListTitle.trim()) {
      alert('Please enter a list title');
      return;
    }
    if (!newListKeywordId) {
      alert('Please select a keyword. Observation lists are about specific keywords.');
      return;
    }
    if (!observationText.trim()) {
      alert('Please enter an observation');
      return;
    }

    const newList = await createList(newListTitle.trim(), newListKeywordId, undefined, activeStudyId ?? undefined);
    await addItemToList(newList.id, {
      content: observationText.trim(),
      verseRef,
      annotationId,
    });

    if (onAdded) {
      onAdded();
    }
    onClose();
  };

  // Get keyword presets for dropdown labels
  const keywordPresets = presets.filter(p => p.word);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Add Observation"
      size="md"
      initialFocusRef={textareaRef}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {showCreateNew ? (
            <Button
              onClick={handleCreateAndAdd}
              disabled={!newListTitle.trim() || !newListKeywordId || !observationText.trim()}
            >
              Create & Add
            </Button>
          ) : (
            <Button
              onClick={handleAdd}
              disabled={!effectiveListId || !observationText.trim() || isAutoResolving}
            >
              {isAutoResolving ? 'Loading...' : 'Add to List'}
            </Button>
          )}
        </div>
      }
    >
            <div className="space-y-4">
              {/* Verse reference */}
              <ReadOnlyField
                label="Verse Reference"
                value={formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse)}
              />

              {/* Selected text (read-only) */}
              <ReadOnlyField
                label="Selected Text"
                value={`"${stripSymbols(selectedText)}"`}
                className="italic"
              />

              {/* Observation text */}
              <Textarea
                ref={textareaRef}
                label="Your Observation About the Keyword"
                value={observationText}
                onChange={(e) => setObservationText(e.target.value)}
                placeholder="What do you observe about this keyword in this verse? (e.g., 'the word was with God', 'the word was God')"
                rows={4}
                helpText="Add your observation about how the keyword appears or is used in this verse."
                autoFocus
                aria-label="Your observation about the keyword"
              />

              {/* List selection */}
              {autoListId && !showCreateNew ? (
                // Auto-matched: show the list as read-only
                <ReadOnlyField
                  label="Observation List"
                  value={autoListTitle || 'Loading...'}
                />
              ) : !showCreateNew ? (
                // No keyword match: show dropdown of existing lists
                <>
                  {studyLists.length === 0 ? (
                    <div className="text-sm text-scripture-muted mb-2" role="status" aria-live="polite">
                      No lists yet for this study. Create one below.
                    </div>
                  ) : (
                    <DropdownSelect
                      label="Add to Observation List"
                      value={selectedListId}
                      onChange={(value) => setSelectedListId(value)}
                      helpText="Select a list about a keyword."
                      options={[
                        { value: '', label: 'Select a list...' },
                        ...studyLists.map(list => {
                          const keywordName = keywordPresets.find(p => p.id === list.keyWordId)?.word || 'Unknown';
                          const verseCount = new Set(
                            list.items.map(item => `${item.verseRef.book}:${item.verseRef.chapter}:${item.verseRef.verse}`)
                          ).size;
                          return {
                            value: list.id,
                            label: `${list.title} (Keyword: ${keywordName}, ${verseCount} ${verseCount === 1 ? 'verse' : 'verses'})`
                          };
                        })
                      ]}
                    />
                  )}
                </>
              ) : (
                // Create new list form
                <>
                  <Input
                    label="New List Title"
                    type="text"
                    value={newListTitle}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewListTitle(e.target.value)}
                    placeholder="e.g., 'What I learn about God in John 1'"
                  />
                  <DropdownSelect
                    label="Keyword"
                    helpText="This list is about observations of this keyword"
                    value={newListKeywordId}
                    onChange={(value) => setNewListKeywordId(value)}
                    options={[
                      { value: '', label: 'Select a keyword...' },
                      ...keywordPresets.map(preset => ({
                        value: preset.id,
                        label: `${preset.word}${preset.symbol ? ` (${SYMBOLS[preset.symbol]})` : ''}`
                      }))
                    ]}
                  />
                  {keywordPresets.length === 0 && (
                    <p className="text-xs text-scripture-muted">
                      No keywords yet. Create a keyword first from the toolbar.
                    </p>
                  )}
                </>
              )}

              {/* Toggle between create new and existing */}
              {showCreateNew ? (
                <button
                  onClick={() => setShowCreateNew(false)}
                  className="text-sm text-scripture-muted hover:text-scripture-text transition-colors"
                >
                  ← Back to existing lists
                </button>
              ) : (
                <Button
                  variant="secondary"
                  fullWidth
                  onClick={() => setShowCreateNew(true)}
                >
                  + Create New List
                </Button>
              )}
            </div>
    </Modal>
  );
}
