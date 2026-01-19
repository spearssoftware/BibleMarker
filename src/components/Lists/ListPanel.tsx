/**
 * Observation List Panel Component
 * 
 * Sidebar panel showing all observation lists.
 */

import { useState, useEffect, useMemo } from 'react';
import { useListStore } from '@/stores/listStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import { getBookById, formatVerseRef, BIBLE_BOOKS } from '@/types/bible';
import type { ObservationList, ObservationItem } from '@/types/list';
import type { VerseRef } from '@/types/bible';
import { ListEditor } from './ListEditor';

interface ListPanelProps {
  onClose?: () => void;
}

// Helper to create a unique key for a verse reference
const getVerseKey = (ref: VerseRef): string => {
  return `${ref.book}:${ref.chapter}:${ref.verse}`;
};

// Group observations by verse
const groupByVerse = (items: ObservationItem[]): Map<string, ObservationItem[]> => {
  const grouped = new Map<string, ObservationItem[]>();
  items.forEach(item => {
    const key = getVerseKey(item.verseRef);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(item);
  });
  return grouped;
};

// Compare verse references for sorting
const compareVerseRefs = (a: VerseRef, b: VerseRef): number => {
  // First compare books using canonical order from BIBLE_BOOKS
  const bookA = getBookById(a.book);
  const bookB = getBookById(b.book);
  
  // If books are different, sort by canonical order
  if (bookA && bookB && bookA.order !== bookB.order) {
    return bookA.order - bookB.order;
  }
  
  // If one book not found, put found book first (shouldn't happen normally)
  if (!bookA && !bookB) return 0;
  if (!bookA) return 1;
  if (!bookB) return -1;
  
  // Same book: compare chapters
  if (a.chapter !== b.chapter) {
    return a.chapter - b.chapter;
  }
  
  // Same chapter: compare verses
  return a.verse - b.verse;
};

// Sort verse groups by verse reference
const sortVerseGroups = (verseGroups: Map<string, ObservationItem[]>): Array<[string, ObservationItem[]]> => {
  return Array.from(verseGroups.entries()).sort(([keyA, itemsA], [keyB, itemsB]) => {
    const refA = itemsA[0].verseRef;
    const refB = itemsB[0].verseRef;
    return compareVerseRefs(refA, refB);
  });
};

export function ListPanel({ onClose }: ListPanelProps = {}) {
  const { lists, loadLists, deleteList, addItemToList, updateItem, deleteItem } = useListStore();
  const { presets } = useMarkingPresetStore();
  const { studies } = useStudyStore();
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
  const [addingToVerse, setAddingToVerse] = useState<{ listId: string; verseRef: VerseRef } | null>(null);
  const [newObservationText, setNewObservationText] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemText, setEditingItemText] = useState('');

  useEffect(() => {
    loadLists();
  }, [loadLists]);

  const toggleList = (listId: string) => {
    const newExpanded = new Set(expandedLists);
    if (newExpanded.has(listId)) {
      newExpanded.delete(listId);
    } else {
      newExpanded.add(listId);
    }
    setExpandedLists(newExpanded);
  };

  const handleDelete = async (listId: string) => {
    if (!confirm('Are you sure you want to delete this list? All observations will be lost.')) {
      return;
    }
    await deleteList(listId);
  };

  const handleExport = (list: ObservationList) => {
    const lines: string[] = [];
    lines.push(list.title);
    lines.push('='.repeat(list.title.length));
    lines.push('');
    
    const keywordName = getKeywordName(list.keyWordId);
    if (keywordName) {
      lines.push(`Keyword: ${keywordName}`);
      lines.push('');
    }
    
    if (list.scope?.book) {
      const bookName = getBookById(list.scope.book)?.name || list.scope.book;
      lines.push(`Scope: ${bookName}${list.scope.chapters ? ` ${list.scope.chapters.join(', ')}` : ''}`);
      lines.push('');
    }

    // Group by verse and export (sorted by verse reference)
    const verseGroups = groupByVerse(list.items);
    sortVerseGroups(verseGroups).forEach(([verseKey, verseItems]) => {
      const verseRef = verseItems[0].verseRef;
      const ref = formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse);
      lines.push(ref);
      verseItems.forEach((item, index) => {
        lines.push(`  • ${item.content}`);
      });
      lines.push('');
    });

    const text = lines.join('\n');
    
    // Copy to clipboard
    navigator.clipboard.writeText(text).then(() => {
      alert('List copied to clipboard!');
    }).catch(() => {
      // Fallback: show in prompt
      prompt('Copy this text:', text);
    });
  };

  const getKeywordName = (keyWordId: string) => {
    const preset = presets.find(p => p.id === keyWordId);
    return preset?.word || null;
  };

  const getStudyName = (studyId?: string) => {
    if (!studyId) return null;
    const study = studies.find(s => s.id === studyId);
    return study?.name || null;
  };

  const handleAddObservation = async () => {
    if (!addingToVerse || !newObservationText.trim()) return;
    
    await addItemToList(addingToVerse.listId, {
      content: newObservationText.trim(),
      verseRef: addingToVerse.verseRef,
    });
    
    setNewObservationText('');
    setAddingToVerse(null);
    loadLists(); // Refresh to show new observation
  };

  const handleCancelAddObservation = () => {
    setNewObservationText('');
    setAddingToVerse(null);
  };

  const handleStartEdit = (item: ObservationItem) => {
    setEditingItemId(item.id);
    setEditingItemText(item.content);
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditingItemText('');
  };

  const handleSaveEdit = async (listId: string, itemId: string) => {
    if (!editingItemText.trim()) {
      alert('Observation cannot be empty');
      return;
    }
    
    await updateItem(listId, itemId, {
      content: editingItemText.trim(),
    });
    
    setEditingItemId(null);
    setEditingItemText('');
    loadLists(); // Refresh to show updated observation
  };

  const handleDeleteObservation = async (listId: string, itemId: string) => {
    if (!confirm('Are you sure you want to delete this observation?')) {
      return;
    }
    
    await deleteItem(listId, itemId);
    loadLists(); // Refresh to remove deleted observation
  };

  if (isCreating) {
    return (
      <ListEditor
        onClose={() => setIsCreating(false)}
        onSave={() => setIsCreating(false)}
      />
    );
  }

  if (editingListId) {
    const list = lists.find(l => l.id === editingListId);
    if (list) {
      return (
        <ListEditor
          list={list}
          onClose={() => setEditingListId(null)}
          onSave={() => setEditingListId(null)}
        />
      );
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 overflow-y-auto" onClick={onClose}>
      <div className="min-h-full flex items-center justify-center p-4">
        <div 
          className="bg-scripture-surface border border-scripture-border/50 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col" 
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-4 border-b border-scripture-border/50">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-ui font-semibold text-scripture-text">Observation Lists</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsCreating(true)}
                  className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
                >
                  + New List
                </button>
                <button
                  onClick={onClose}
                  className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
                  aria-label="Close"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>

          <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
            {lists.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-scripture-muted text-sm mb-4">No observation lists yet.</p>
                <p className="text-scripture-muted text-xs mb-4">Create a list to record observations about a specific keyword found in scripture.</p>
                <button
                  onClick={() => setIsCreating(true)}
                  className="px-4 py-2 bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
                >
                  Create Your First List
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {lists.map(list => {
                  const isExpanded = expandedLists.has(list.id);
                  const keywordName = getKeywordName(list.keyWordId);
                  const studyName = getStudyName(list.studyId);
                  
                  return (
                    <div
                      key={list.id}
                      className="bg-scripture-surface/50 rounded-lg border border-scripture-muted/20 overflow-hidden"
                    >
                      {/* List header */}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <button
                                onClick={() => toggleList(list.id)}
                                className="text-scripture-text hover:text-scripture-accent transition-colors flex-1 text-left"
                              >
                                <h3 className="font-medium text-scripture-text">{list.title}</h3>
                              </button>
                              <span className="text-xs text-scripture-muted bg-scripture-elevated px-2 py-0.5 rounded">
                                {Array.from(groupByVerse(list.items).keys()).length} {Array.from(groupByVerse(list.items).keys()).length === 1 ? 'verse' : 'verses'}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-2 text-xs">
                              <span className="bg-scripture-accent/20 text-scripture-accent px-2 py-0.5 rounded font-medium">
                                Keyword: {keywordName || 'Unknown'}
                              </span>
                              {studyName && (
                                <span className="bg-scripture-elevated px-2 py-0.5 rounded text-scripture-muted">
                                  Study: {studyName}
                                </span>
                              )}
                              {list.scope?.book && (
                                <span className="bg-scripture-elevated px-2 py-0.5 rounded text-scripture-muted">
                                  {getBookById(list.scope.book)?.name || list.scope.book}
                                  {list.scope.chapters && ` ${list.scope.chapters.join(', ')}`}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleExport(list)}
                              className="px-2 py-1 text-xs text-scripture-muted hover:text-scripture-text transition-colors"
                              title="Export/Copy list"
                            >
                              📋
                            </button>
                            <button
                              onClick={() => setEditingListId(list.id)}
                              className="px-2 py-1 text-xs text-scripture-muted hover:text-scripture-text transition-colors"
                              title="Edit list"
                            >
                              ✏️
                            </button>
                            <button
                              onClick={() => handleDelete(list.id)}
                              className="px-2 py-1 text-xs text-highlight-red hover:text-highlight-red/80 transition-colors"
                              title="Delete list"
                            >
                              🗑️
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* List items (collapsible) - grouped by verse */}
                      {isExpanded && (
                        <div className="border-t border-scripture-muted/20 p-4 bg-scripture-bg/50">
                          {list.items.length === 0 ? (
                            <p className="text-sm text-scripture-muted">No observations yet. Add some from the Bible text.</p>
                          ) : (
                            <div className="space-y-4">
                              {sortVerseGroups(groupByVerse(list.items)).map(([verseKey, verseItems]) => {
                                const verseRef = verseItems[0].verseRef;
                                const isAddingToThisVerse = addingToVerse?.listId === list.id && 
                                  verseKey === (addingToVerse ? getVerseKey(addingToVerse.verseRef) : '');
                                
                                return (
                                  <div
                                    key={verseKey}
                                    className="bg-scripture-surface rounded-lg border border-scripture-border/30 p-3"
                                  >
                                    {/* Verse header */}
                                    <div className="flex items-center justify-between mb-2">
                                      <div className="text-sm font-medium text-scripture-accent">
                                        {formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse)}
                                      </div>
                                      {!isAddingToThisVerse && (
                                        <button
                                          onClick={() => setAddingToVerse({ listId: list.id, verseRef })}
                                          className="text-xs text-scripture-muted hover:text-scripture-accent transition-colors px-2 py-1 rounded hover:bg-scripture-elevated"
                                        >
                                          + Add observation
                                        </button>
                                      )}
                                    </div>
                                    
                                    {/* Observations for this verse */}
                                    <ul className="space-y-1.5 ml-4">
                                      {verseItems.map(item => {
                                        const isEditing = editingItemId === item.id;
                                        
                                        return (
                                          <li key={item.id} className="text-sm text-scripture-text list-disc group/item">
                                            {isEditing ? (
                                              <div className="flex flex-col gap-2 -ml-4">
                                                <textarea
                                                  value={editingItemText}
                                                  onChange={(e) => setEditingItemText(e.target.value)}
                                                  placeholder={`What do you observe about "${keywordName || 'this keyword'}" in this verse?`}
                                                  rows={3}
                                                  className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted resize-none"
                                                  autoFocus
                                                />
                                                <div className="flex items-center gap-2">
                                                  <button
                                                    onClick={() => handleSaveEdit(list.id, item.id)}
                                                    disabled={!editingItemText.trim()}
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
                                              <div className="flex items-start gap-2">
                                                <span className="flex-1">{item.content}</span>
                                                <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                  <button
                                                    onClick={() => handleStartEdit(item)}
                                                    className="px-2 py-1 text-xs text-scripture-muted hover:text-scripture-accent transition-colors rounded hover:bg-scripture-elevated"
                                                    title="Edit observation"
                                                  >
                                                    ✏️
                                                  </button>
                                                  <button
                                                    onClick={() => handleDeleteObservation(list.id, item.id)}
                                                    className="px-2 py-1 text-xs text-highlight-red hover:text-highlight-red/80 transition-colors rounded hover:bg-scripture-elevated"
                                                    title="Delete observation"
                                                  >
                                                    🗑️
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </li>
                                        );
                                      })}
                                    </ul>
                                    
                                    {/* Add observation form for this verse */}
                                    {isAddingToThisVerse && (
                                      <div className="mt-3 pt-3 border-t border-scripture-border/30">
                                        <textarea
                                          value={newObservationText}
                                          onChange={(e) => setNewObservationText(e.target.value)}
                                          placeholder={`What do you observe about "${keywordName || 'this keyword'}" in this verse?`}
                                          rows={3}
                                          className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted resize-none mb-2"
                                          autoFocus
                                        />
                                        <div className="flex items-center gap-2">
                                          <button
                                            onClick={handleAddObservation}
                                            disabled={!newObservationText.trim()}
                                            className="px-3 py-1.5 text-xs bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                          >
                                            Add
                                          </button>
                                          <button
                                            onClick={handleCancelAddObservation}
                                            className="px-3 py-1.5 text-xs bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
                                          >
                                            Cancel
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
