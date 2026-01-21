/**
 * Study Tools Panel
 * 
 * Combined panel for Observation Lists, Chapter at a Glance, Book Overview, and Theme Tracker
 */

import { useState, useEffect } from 'react';
import { useListStore } from '@/stores/listStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import { getBookById, formatVerseRef, BIBLE_BOOKS } from '@/types/bible';
import type { ObservationList, ObservationItem } from '@/types/list';
import type { VerseRef } from '@/types/bible';
import { ListEditor } from '@/components/Lists/ListEditor';
import { ChapterAtAGlance, BookOverview, ThemeTracker } from './';

type StudyToolTab = 'lists' | 'chapter' | 'book' | 'theme' | 'studies';

interface StudyToolsPanelProps {
  onClose: () => void;
  initialTab?: StudyToolTab;
}

// Helper to create a unique key for a verse reference
const getVerseKey = (ref: VerseRef): string => {
  return `${ref.book}:${ref.chapter}:${ref.verse}`;
};

// Group observations by verse
const groupByVerse = (items: ObservationItem[]): Map<string, ObservationItem[]> => {
  const map = new Map<string, ObservationItem[]>();
  items.forEach(item => {
    const key = getVerseKey(item.verseRef);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)!.push(item);
  });
  return map;
};

// Sort verse groups by canonical order
const sortVerseGroups = (groups: Map<string, ObservationItem[]>): Array<[string, ObservationItem[]]> => {
  return Array.from(groups.entries()).sort(([keyA], [keyB]) => {
    const [bookA, chapterA, verseA] = keyA.split(':').map(Number);
    const [bookB, chapterB, verseB] = keyB.split(':').map(Number);
    
    if (bookA !== bookB) return bookA - bookB;
    if (chapterA !== chapterB) return chapterA - chapterB;
    return verseA - verseB;
  });
};

export function StudyToolsPanel({ onClose, initialTab = 'book' }: StudyToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<StudyToolTab>(initialTab);
  const { lists, loadLists, deleteList, addItemToList, updateItem, deleteItem } = useListStore();
  const { presets } = useMarkingPresetStore();
  const { studies, activeStudyId, loadStudies, createStudy, updateStudy, deleteStudy, setActiveStudy } = useStudyStore();
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
  const [addingToVerse, setAddingToVerse] = useState<{ listId: string; verseRef: VerseRef } | null>(null);
  const [newObservationText, setNewObservationText] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemText, setEditingItemText] = useState('');
  
  // Study management state
  const [editingStudy, setEditingStudy] = useState<{ id: string; name: string; book?: string } | null>(null);
  const [newStudyName, setNewStudyName] = useState('');
  const [newStudyBook, setNewStudyBook] = useState<string>('');

  useEffect(() => {
    loadLists();
    loadStudies();
  }, [loadLists, loadStudies]);

  const tabs: { id: StudyToolTab; label: string; icon: string }[] = [
    { id: 'book', label: 'Overview', icon: '📚' },
    { id: 'chapter', label: 'Chapter', icon: '📄' },
    { id: 'theme', label: 'Theme', icon: '🔍' },
    { id: 'lists', label: 'Observation', icon: '📝' },
    { id: 'studies', label: 'Studies', icon: '📖' },
  ];

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

    const verseGroups = groupByVerse(list.items);
    sortVerseGroups(verseGroups).forEach(([verseKey, verseItems]) => {
      const verseRef = verseItems[0].verseRef;
      const ref = formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse);
      lines.push(ref);
      verseItems.forEach((item) => {
        lines.push(`  • ${item.content}`);
      });
      lines.push('');
    });

    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      alert('List copied to clipboard!');
    }).catch(() => {
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
    loadLists();
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
    loadLists();
  };

  const handleDeleteObservation = async (listId: string, itemId: string) => {
    if (!confirm('Are you sure you want to delete this observation?')) {
      return;
    }
    
    await deleteItem(listId, itemId);
    loadLists();
  };

  // Study management handlers
  const handleCreateStudy = async () => {
    if (!newStudyName.trim()) return;
    
    await createStudy(newStudyName.trim(), newStudyBook || undefined);
    setNewStudyName('');
    setNewStudyBook('');
  };

  const handleUpdateStudy = async () => {
    if (!editingStudy || !editingStudy.name.trim()) return;
    
    const study = studies.find(s => s.id === editingStudy.id);
    if (!study) return;
    
    await updateStudy({
      ...study,
      name: editingStudy.name.trim(),
      book: editingStudy.book || undefined,
    });
    setEditingStudy(null);
  };

  const handleDeleteStudy = async (studyId: string) => {
    if (!confirm('Are you sure you want to delete this study? This will not delete keywords, only the study grouping.')) {
      return;
    }
    
    await deleteStudy(studyId);
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative" role="dialog" aria-label="Study Tools" aria-modal="true">
      {/* Close button - floating in top-right */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 z-10 text-scripture-muted hover:text-scripture-text transition-colors p-1.5 rounded-lg hover:bg-scripture-elevated"
        aria-label="Close study tools"
      >
        <span aria-hidden="true">✕</span>
      </button>

      {/* Tabs */}
      <div className="px-4 py-2 flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          {activeTab === 'lists' && !isCreating && !editingListId && (
            <button
              onClick={() => setIsCreating(true)}
              className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
            >
              + New List
            </button>
          )}
          <div className="flex-1"></div>
        </div>
        
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setIsCreating(false);
                setEditingListId(null);
              }}
              className={`
                px-4 py-2 rounded-lg text-sm font-ui font-medium transition-all
                ${activeTab === tab.id
                  ? 'bg-scripture-accent text-scripture-bg shadow-md'
                  : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'
                }
              `}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Show ListEditor inline when creating or editing */}
        {activeTab === 'lists' && (isCreating || editingListId) ? (
          <div className="flex-1 min-h-0 flex flex-col">
            {isCreating ? (
              <ListEditor
                inline
                onClose={() => setIsCreating(false)}
                onSave={async () => {
                  setIsCreating(false);
                  await loadLists();
                }}
              />
            ) : editingListId ? (() => {
              const list = lists.find(l => l.id === editingListId);
              if (!list) return null;
              return (
                <ListEditor
                  inline
                  list={list}
                  onClose={() => setEditingListId(null)}
                  onSave={async () => {
                    setEditingListId(null);
                    await loadLists();
                  }}
                />
              );
            })() : null}
          </div>
        ) : activeTab === 'lists' ? (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
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
                          data-list-id={list.id}
                          className="bg-scripture-surface rounded-xl border border-scripture-border/50 shadow-sm overflow-hidden"
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
        ) : null}
        {activeTab === 'chapter' && (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
                <ChapterAtAGlance onObservationClick={(listId) => {
                  setActiveTab('lists');
                  // Expand the list and scroll to it
                  setExpandedLists(new Set([listId]));
                  // Small delay to ensure the tab switch completes before scrolling
                  setTimeout(() => {
                    const listElement = document.querySelector(`[data-list-id="${listId}"]`);
                    if (listElement) {
                      listElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                    }
                  }, 100);
                }} />
              </div>
            )}
            {activeTab === 'book' && (
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                <BookOverview onChapterClick={() => setActiveTab('chapter')} />
              </div>
            )}
            {activeTab === 'theme' && (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
                <ThemeTracker />
              </div>
            )}
            {activeTab === 'studies' && (
              <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar space-y-0">
                {/* Create new study */}
                <div className="mb-4">
                  <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Create New Study</h3>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={newStudyName}
                      onChange={(e) => setNewStudyName(e.target.value)}
                      placeholder="Study name (e.g., 'John - Character Study')"
                      className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateStudy();
                        }
                      }}
                    />
                    <select
                      value={newStudyBook}
                      onChange={(e) => setNewStudyBook(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                    >
                      <option value="">All books (global study)</option>
                      {BIBLE_BOOKS.map(book => (
                        <option key={book.id} value={book.id}>{book.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleCreateStudy}
                      disabled={!newStudyName.trim()}
                      className="w-full px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg 
                               hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed 
                               transition-all duration-200 shadow-md"
                    >
                      Create Study
                    </button>
                  </div>
                </div>

                <div className="border-t border-scripture-border/30 mb-4"></div>

                {/* Studies list */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-ui font-semibold text-scripture-text">Your Studies</h3>
                    {activeStudyId && (
                      <button
                        onClick={() => setActiveStudy(null)}
                        className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50 
                                 border border-scripture-border/50 text-scripture-text rounded-lg 
                                 transition-all duration-200"
                      >
                        Clear Active Study
                      </button>
                    )}
                  </div>
                  {studies.length === 0 ? (
                    <p className="text-scripture-muted text-sm">No studies yet. Create one above to get started.</p>
                  ) : (
                    <div className="space-y-2">
                      {studies.map(study => (
                        <div
                          key={study.id}
                          className="p-4 bg-scripture-surface/50 rounded-lg border border-scripture-muted/20 flex items-center justify-between"
                        >
                          {editingStudy?.id === study.id ? (
                            <div className="flex-1 space-y-2">
                              <input
                                type="text"
                                value={editingStudy.name}
                                onChange={(e) => setEditingStudy({ ...editingStudy, name: e.target.value })}
                                className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleUpdateStudy();
                                  } else if (e.key === 'Escape') {
                                    setEditingStudy(null);
                                  }
                                }}
                              />
                              <select
                                value={editingStudy.book || ''}
                                onChange={(e) => setEditingStudy({ ...editingStudy, book: e.target.value || undefined })}
                                className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                              >
                                <option value="">All books</option>
                                {BIBLE_BOOKS.map(book => (
                                  <option key={book.id} value={book.id}>{book.name}</option>
                                ))}
                              </select>
                              <div className="flex gap-2">
                                <button
                                  onClick={handleUpdateStudy}
                                  className="px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg 
                                           hover:bg-scripture-accent/90 transition-all duration-200 shadow-md"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingStudy(null)}
                                  className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50 
                                           border border-scripture-border/50 text-scripture-text rounded-lg 
                                           transition-all duration-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <div className="font-medium text-scripture-text">{study.name}</div>
                                  {activeStudyId === study.id && (
                                    <span className="px-2 py-0.5 text-xs bg-scripture-accent text-scripture-bg rounded">Active</span>
                                  )}
                                </div>
                                <div className="text-sm text-scripture-muted">
                                  {study.book ? `Scoped to: ${getBookById(study.book)?.name || study.book}` : 'Global study'}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {activeStudyId !== study.id && (
                                  <button
                                    onClick={() => setActiveStudy(study.id)}
                                    className="px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg 
                                             hover:bg-scripture-accent/90 transition-all duration-200 shadow-md"
                                  >
                                    Set Active
                                  </button>
                                )}
                                <button
                                  onClick={() => setEditingStudy({ id: study.id, name: study.name, book: study.book })}
                                  className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50 
                                           border border-scripture-border/50 text-scripture-text rounded-lg 
                                           transition-all duration-200"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteStudy(study.id)}
                                  className="px-3 py-2 text-sm font-ui text-scripture-errorText hover:text-scripture-error 
                                           transition-colors underline"
                                >
                                  Delete
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
    </div>
  );
}
