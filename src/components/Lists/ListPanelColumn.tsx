/**
 * Observation List Panel Column Component
 * 
 * Column version of ListPanel for use in multi-translation view.
 * Displays observation lists grouped by verse.
 */

import { useState, useEffect } from 'react';
import { useListStore } from '@/stores/listStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import { getBookById, formatVerseRef } from '@/types/bible';
import type { ObservationList, ObservationItem } from '@/types/list';
import type { VerseRef } from '@/types/bible';
import { ListEditor } from './ListEditor';

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

interface ListPanelColumnProps {
  currentBook?: string;
  currentChapter?: number;
}

export function ListPanelColumn({ currentBook, currentChapter }: ListPanelColumnProps = {}) {
  const { lists, loadLists, deleteList, addItemToList } = useListStore();
  const { presets } = useMarkingPresetStore();
  const { studies } = useStudyStore();
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
  const [addingToVerse, setAddingToVerse] = useState<{ listId: string; verseRef: VerseRef } | null>(null);
  const [newObservationText, setNewObservationText] = useState('');

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

    // Group by verse and export
    const verseGroups = groupByVerse(list.items);
    Array.from(verseGroups.entries()).forEach(([verseKey, verseItems]) => {
      const verseRef = verseItems[0].verseRef;
      const ref = formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse);
      lines.push(ref);
      verseItems.forEach((item) => {
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

  // Filter lists to show only those relevant to current chapter (if specified)
  const filteredLists = currentBook && currentChapter
    ? lists.filter(list => {
        // Show if no scope, or scope matches current book/chapter
        if (!list.scope?.book) return true;
        if (list.scope.book !== currentBook) return false;
        if (!list.scope.chapters || list.scope.chapters.length === 0) return true;
        return list.scope.chapters.includes(currentChapter);
      })
    : lists;

  if (isCreating) {
    return (
      <div className="h-full flex flex-col bg-scripture-surface">
        <ListEditor
          onClose={() => setIsCreating(false)}
          onSave={() => {
            setIsCreating(false);
            loadLists();
          }}
        />
      </div>
    );
  }

  if (editingListId) {
    const list = lists.find(l => l.id === editingListId);
    if (list) {
      return (
        <div className="h-full flex flex-col bg-scripture-surface">
          <ListEditor
            list={list}
            onClose={() => setEditingListId(null)}
            onSave={() => {
              setEditingListId(null);
              loadLists();
            }}
          />
        </div>
      );
    }
  }

  return (
    <div className="h-full flex flex-col bg-scripture-surface border-l border-scripture-border/30">
      {/* Header */}
      <div className="p-4 border-b border-scripture-border/50 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-ui font-semibold text-scripture-text">Observation Lists</h2>
          <button
            onClick={() => setIsCreating(true)}
            className="px-2 py-1 text-xs bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
            title="Create new list"
          >
            + New
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
        {filteredLists.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-scripture-muted text-sm mb-4">No observation lists yet.</p>
            <p className="text-scripture-muted text-xs mb-4">Create a list to record observations about a specific keyword found in scripture.</p>
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors text-sm"
            >
              Create Your First List
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredLists.map(list => {
              const isExpanded = expandedLists.has(list.id);
              const keywordName = getKeywordName(list.keyWordId);
              const studyName = getStudyName(list.studyId);
              
              return (
                <div
                  key={list.id}
                  className="bg-scripture-surface/50 rounded-lg border border-scripture-muted/20 overflow-hidden"
                >
                  {/* List header */}
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <button
                            onClick={() => toggleList(list.id)}
                            className="text-scripture-text hover:text-scripture-accent transition-colors flex-1 text-left min-w-0"
                          >
                            <h3 className="font-medium text-scripture-text text-sm truncate">{list.title}</h3>
                          </button>
                          <span className="text-xs text-scripture-muted bg-scripture-elevated px-2 py-0.5 rounded flex-shrink-0">
                            {Array.from(groupByVerse(list.items).keys()).length} {Array.from(groupByVerse(list.items).keys()).length === 1 ? 'verse' : 'verses'}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-xs">
                          <span className="bg-scripture-accent/20 text-scripture-accent px-2 py-0.5 rounded font-medium">
                            {keywordName || 'Unknown'}
                          </span>
                          {studyName && (
                            <span className="bg-scripture-elevated px-2 py-0.5 rounded text-scripture-muted">
                              {studyName}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleExport(list)}
                          className="px-1.5 py-1 text-xs text-scripture-muted hover:text-scripture-text transition-colors"
                          title="Export/Copy list"
                        >
                          📋
                        </button>
                        <button
                          onClick={() => setEditingListId(list.id)}
                          className="px-1.5 py-1 text-xs text-scripture-muted hover:text-scripture-text transition-colors"
                          title="Edit list"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(list.id)}
                          className="px-1.5 py-1 text-xs text-highlight-red hover:text-highlight-red/80 transition-colors"
                          title="Delete list"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* List items (collapsible) - grouped by verse */}
                  {isExpanded && (
                    <div className="border-t border-scripture-muted/20 p-3 bg-scripture-bg/50">
                      {list.items.length === 0 ? (
                        <p className="text-xs text-scripture-muted">No observations yet. Add some from the Bible text.</p>
                      ) : (
                        <div className="space-y-3">
                          {Array.from(groupByVerse(list.items).entries()).map(([verseKey, verseItems]) => {
                            const verseRef = verseItems[0].verseRef;
                            const isAddingToThisVerse = addingToVerse?.listId === list.id && 
                              verseKey === (addingToVerse ? getVerseKey(addingToVerse.verseRef) : '');
                            
                            return (
                              <div
                                key={verseKey}
                                className="bg-scripture-surface rounded border border-scripture-border/30 p-2"
                              >
                                {/* Verse header */}
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="text-xs font-medium text-scripture-accent">
                                    {formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse)}
                                  </div>
                                  {!isAddingToThisVerse && (
                                    <button
                                      onClick={() => setAddingToVerse({ listId: list.id, verseRef })}
                                      className="text-xs text-scripture-muted hover:text-scripture-accent transition-colors px-1.5 py-0.5 rounded hover:bg-scripture-elevated"
                                    >
                                      + Add
                                    </button>
                                  )}
                                </div>
                                
                                {/* Observations for this verse */}
                                <ul className="space-y-1 ml-3">
                                  {verseItems.map(item => (
                                    <li key={item.id} className="text-xs text-scripture-text list-disc">
                                      {item.content}
                                    </li>
                                  ))}
                                </ul>
                                
                                {/* Add observation form for this verse */}
                                {isAddingToThisVerse && (
                                  <div className="mt-2 pt-2 border-t border-scripture-border/30">
                                    <textarea
                                      value={newObservationText}
                                      onChange={(e) => setNewObservationText(e.target.value)}
                                      placeholder={`Observation about "${keywordName || 'this keyword'}"...`}
                                      rows={2}
                                      className="w-full px-2 py-1.5 text-xs bg-scripture-bg border border-scripture-border/50 rounded focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted resize-none mb-1.5"
                                      autoFocus
                                    />
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={handleAddObservation}
                                        disabled={!newObservationText.trim()}
                                        className="px-2 py-1 text-xs bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                      >
                                        Add
                                      </button>
                                      <button
                                        onClick={handleCancelAddObservation}
                                        className="px-2 py-1 text-xs bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
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
  );
}
