/**
 * Add to List Component
 * 
 * Dialog to add selected text as an observation to a list.
 */

import { useState, useEffect, useRef } from 'react';
import { useListStore } from '@/stores/listStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import type { VerseRef } from '@/types/bible';
import { formatVerseRef } from '@/types/bible';
import { stripSymbols } from '@/lib/textUtils';
import { useModal } from '@/hooks/useModal';
import { Modal, Button, Textarea, DropdownSelect, ReadOnlyField, Input } from '@/components/shared';
import { Z_INDEX } from '@/lib/modalConstants';

interface AddToListProps {
  verseRef: VerseRef;
  selectedText: string;
  annotationId?: string;
  onClose: () => void;
  onAdded?: () => void;
}

export function AddToList({ verseRef, selectedText, annotationId, onClose, onAdded }: AddToListProps) {
  const { lists, loadLists, addItemToList, createList, getMostRecentlyUsedList } = useListStore();
  const { presets } = useMarkingPresetStore();
  // Strip symbols from selected text before initializing
  const [observationText, setObservationText] = useState(stripSymbols(selectedText));
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newListTitle, setNewListTitle] = useState('');
  const [newListKeywordId, setNewListKeywordId] = useState<string>('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize with most recently used list if available
  const [selectedListId, setSelectedListId] = useState<string>('');

  const { handleBackdropClick } = useModal({
    isOpen: true,
    onClose,
    lockScroll: true,
    handleEscape: true,
    initialFocusRef: textareaRef,
  });

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  // Set default to most recently used list when lists are loaded, or first list if no recent
  useEffect(() => {
    if (lists.length > 0 && !selectedListId) {
      const recentList = getMostRecentlyUsedList();
      if (recentList && lists.some(l => l.id === recentList.id)) {
        setSelectedListId(recentList.id);
      } else {
        // Default to first list if no recent list
        setSelectedListId(lists[0].id);
      }
    }
  }, [lists, getMostRecentlyUsedList, selectedListId]);

  const handleAdd = async () => {
    if (!selectedListId) {
      alert('Please select a list');
      return;
    }

    if (!observationText.trim()) {
      alert('Please enter an observation');
      return;
    }

    await addItemToList(selectedListId, {
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

    const newList = await createList(newListTitle.trim(), newListKeywordId);
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

  // Get keyword presets (only those with words)
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
              disabled={!selectedListId || !observationText.trim()}
            >
              Add to List
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
              {!showCreateNew ? (
                <>
                  {lists.length === 0 ? (
                    <div className="text-sm text-scripture-muted mb-2" role="status" aria-live="polite">
                      No lists yet. Create one below.
                    </div>
                  ) : (
                    <DropdownSelect
                      label="Add to Observation List"
                      value={selectedListId}
                      onChange={(value) => setSelectedListId(value)}
                      helpText="Select a list about a keyword. You can add multiple observations for the same verse."
                      options={[
                        { value: '', label: 'Select a list...' },
                        ...lists.map(list => {
                          const keywordName = presets.find(p => p.id === list.keyWordId)?.word || 'Unknown';
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
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => setShowCreateNew(true)}
                  >
                    + Create New List
                  </Button>
                </>
              ) : (
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
                        label: `${preset.word}${preset.symbol ? ` (${preset.symbol})` : ''}`
                      }))
                    ]}
                  />
                  {keywordPresets.length === 0 && (
                    <p className="text-xs text-scripture-muted">
                      No keywords yet. Create a keyword first from the toolbar.
                    </p>
                  )}
                  <button
                    onClick={() => setShowCreateNew(false)}
                    className="text-sm text-scripture-muted hover:text-scripture-text transition-colors"
                  >
                    ← Back to existing lists
                  </button>
                </>
              )}
            </div>
    </Modal>
  );
}
