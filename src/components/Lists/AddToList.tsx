/**
 * Add to List Component
 * 
 * Dialog to add selected text as an observation to a list.
 */

import { useState, useEffect } from 'react';
import { useListStore } from '@/stores/listStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import type { VerseRef } from '@/types/bible';
import { formatVerseRef } from '@/types/bible';
import { stripSymbols } from '@/lib/textUtils';

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

  // Initialize with most recently used list if available
  const [selectedListId, setSelectedListId] = useState<string>('');

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
    <div className="fixed inset-0 backdrop-overlay z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-full flex items-center justify-center p-4">
        <div 
          className="bg-scripture-surface border border-scripture-border/50 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col" 
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-scripture-border/50">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-ui font-semibold text-scripture-text">Add Observation</h2>
              <button
                onClick={onClose}
                className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
            <div className="space-y-4">
              {/* Verse reference */}
              <div>
                <label className="block text-sm font-medium text-scripture-text mb-2">
                  Verse Reference
                </label>
                <div className="px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg text-scripture-text">
                  {formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse)}
                </div>
              </div>

              {/* Selected text (read-only) */}
              <div>
                <label className="block text-sm font-medium text-scripture-text mb-2">
                  Selected Text
                </label>
                <div className="px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg text-scripture-text italic">
                  "{stripSymbols(selectedText)}"
                </div>
              </div>

              {/* Observation text */}
              <div>
                <label className="block text-sm font-medium text-scripture-text mb-2">
                  Your Observation About the Keyword
                </label>
                <textarea
                  value={observationText}
                  onChange={(e) => setObservationText(e.target.value)}
                  placeholder="What do you observe about this keyword in this verse? (e.g., 'the word was with God', 'the word was God')"
                  rows={4}
                  className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted resize-none"
                  autoFocus
                />
                <p className="mt-1 text-xs text-scripture-muted">
                  Add your observation about how the keyword appears or is used in this verse.
                </p>
              </div>

              {/* List selection */}
              {!showCreateNew ? (
                <>
                  <div>
                    <label className="block text-sm font-medium text-scripture-text mb-2">
                      Add to Observation List
                    </label>
                    {lists.length === 0 ? (
                      <div className="text-sm text-scripture-muted mb-2">
                        No lists yet. Create one below.
                      </div>
                    ) : (
                      <>
                        <select
                          value={selectedListId}
                          onChange={(e) => setSelectedListId(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                        >
                          <option value="">Select a list...</option>
                          {lists.map(list => {
                            const keywordName = presets.find(p => p.id === list.keyWordId)?.word || 'Unknown';
                            // Count unique verses
                            const verseCount = new Set(
                              list.items.map(item => `${item.verseRef.book}:${item.verseRef.chapter}:${item.verseRef.verse}`)
                            ).size;
                            return (
                              <option key={list.id} value={list.id}>
                                {list.title} (Keyword: {keywordName}, {verseCount} {verseCount === 1 ? 'verse' : 'verses'})
                              </option>
                            );
                          })}
                        </select>
                        <p className="mt-1 text-xs text-scripture-muted">
                          Select a list about a keyword. You can add multiple observations for the same verse.
                        </p>
                      </>
                    )}
                  </div>
                  <button
                    onClick={() => setShowCreateNew(true)}
                    className="w-full px-4 py-2 text-sm bg-scripture-surface/80 text-scripture-text border border-scripture-border/50 rounded hover:bg-scripture-surface transition-colors"
                  >
                    + Create New List
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-scripture-text mb-2">
                      New List Title
                    </label>
                    <input
                      type="text"
                      value={newListTitle}
                      onChange={(e) => setNewListTitle(e.target.value)}
                      placeholder="e.g., 'What I learn about God in John 1'"
                      className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-scripture-text mb-2">
                      Keyword <span className="text-highlight-red">*</span>
                      <span className="text-xs text-scripture-muted ml-2">(This list is about observations of this keyword)</span>
                    </label>
                    <select
                      value={newListKeywordId}
                      onChange={(e) => setNewListKeywordId(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                      required
                    >
                      <option value="">Select a keyword...</option>
                      {keywordPresets.map(preset => (
                        <option key={preset.id} value={preset.id}>
                          {preset.word} {preset.symbol && `(${preset.symbol})`}
                        </option>
                      ))}
                    </select>
                    {keywordPresets.length === 0 && (
                      <p className="mt-2 text-xs text-scripture-muted">
                        No keywords yet. Create a keyword first from the toolbar.
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => setShowCreateNew(false)}
                    className="text-sm text-scripture-muted hover:text-scripture-text transition-colors"
                  >
                    ← Back to existing lists
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="p-4 border-t border-scripture-border/50 flex items-center justify-end gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
            >
              Cancel
            </button>
            {showCreateNew ? (
              <button
                onClick={handleCreateAndAdd}
                disabled={!newListTitle.trim() || !newListKeywordId || !observationText.trim()}
                className="px-4 py-2 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create & Add
              </button>
            ) : (
              <button
                onClick={handleAdd}
                disabled={!selectedListId || !observationText.trim()}
                className="px-4 py-2 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add to List
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
