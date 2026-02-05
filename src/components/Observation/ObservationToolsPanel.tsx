/**
 * Observation Tools Panel
 * 
 * Panel for observation phase tools: Lists, 5W+H, Contrasts, Time, Places, Conclusions, Themes.
 * This panel is for active recording/input tools during the observation phase.
 */

import { useState, useEffect } from 'react';
import { useListStore } from '@/stores/listStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import { useBibleStore } from '@/stores/bibleStore';
import { getBookById, formatVerseRef } from '@/types/bible';
import type { ObservationList, ObservationItem } from '@/types/list';
import type { VerseRef } from '@/types/bible';
import { ListEditor } from '@/components/Lists/ListEditor';
import { FiveWAndH } from './FiveWAndH';
import { ContrastTracker } from './ContrastTracker';
import { TimeTracker } from './TimeTracker';
import { PlaceTracker } from './PlaceTracker';
import { ConclusionTracker } from './ConclusionTracker';
import { ThemeEditor } from './ThemeEditor';
import { ConfirmationDialog } from '@/components/shared';

export type ObservationTab = 'lists' | 'fiveWAndH' | 'contrasts' | 'time' | 'places' | 'conclusions' | 'theme';

interface ObservationToolsPanelProps {
  onClose: () => void;
  initialTab?: ObservationTab;
  selectedText?: string;
  verseRef?: VerseRef;
  initialListId?: string; // For opening to a specific list
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

// Sort verse groups by canonical order (book order, then chapter, then verse)
const sortVerseGroups = (groups: Map<string, ObservationItem[]>): Array<[string, ObservationItem[]]> => {
  return Array.from(groups.entries()).sort(([keyA], [keyB]) => {
    const [bookA, chapterA, verseA] = keyA.split(':');
    const [bookB, chapterB, verseB] = keyB.split(':');
    const orderA = getBookById(bookA)?.order ?? 999;
    const orderB = getBookById(bookB)?.order ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    const chA = parseInt(chapterA, 10);
    const chB = parseInt(chapterB, 10);
    if (chA !== chB) return chA - chB;
    return parseInt(verseA, 10) - parseInt(verseB, 10);
  });
};

// Sort lists by earliest verse in each list (canonical order)
const sortListsByVerse = (lists: ObservationList[]): ObservationList[] => {
  return [...lists].sort((a, b) => {
    const itemsA = a.items.length > 0 ? a.items : [];
    const itemsB = b.items.length > 0 ? b.items : [];
    if (itemsA.length === 0 && itemsB.length === 0) return 0;
    if (itemsA.length === 0) return 1;
    if (itemsB.length === 0) return -1;
    const minKey = (items: ObservationItem[]) => {
      const keys = items.map(item => getVerseKey(item.verseRef));
      keys.sort((keyA, keyB) => {
        const [bookA, chapterA, verseA] = keyA.split(':');
        const [bookB, chapterB, verseB] = keyB.split(':');
        const orderA = getBookById(bookA)?.order ?? 999;
        const orderB = getBookById(bookB)?.order ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        if (parseInt(chapterA, 10) !== parseInt(chapterB, 10)) return parseInt(chapterA, 10) - parseInt(chapterB, 10);
        return parseInt(verseA, 10) - parseInt(verseB, 10);
      });
      return keys[0];
    };
    const keyA = minKey(itemsA);
    const keyB = minKey(itemsB);
    const [bookA, chapterA, verseA] = keyA.split(':');
    const [bookB, chapterB, verseB] = keyB.split(':');
    const orderA = getBookById(bookA)?.order ?? 999;
    const orderB = getBookById(bookB)?.order ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    if (parseInt(chapterA, 10) !== parseInt(chapterB, 10)) return parseInt(chapterA, 10) - parseInt(chapterB, 10);
    return parseInt(verseA, 10) - parseInt(verseB, 10);
  });
};

export function ObservationToolsPanel({ 
  onClose, 
  initialTab = 'lists',
  selectedText,
  verseRef,
  initialListId
}: ObservationToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<ObservationTab>(initialTab);
  const { lists, loadLists, deleteList, addItemToList, updateItem, deleteItem } = useListStore();
  const { presets } = useMarkingPresetStore();
  const { studies, activeStudyId } = useStudyStore();
  const { currentBook, currentChapter, setLocation, setNavSelectedVerse } = useBibleStore();
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
  const [addingToVerse, setAddingToVerse] = useState<{ listId: string; verseRef: VerseRef } | null>(null);
  const [newObservationText, setNewObservationText] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemText, setEditingItemText] = useState('');
  const [editingItemNotes, setEditingItemNotes] = useState('');
  const [addingNotesToItemId, setAddingNotesToItemId] = useState<string | null>(null);
  const [newItemNotes, setNewItemNotes] = useState('');
  const [confirmDeleteListId, setConfirmDeleteListId] = useState<string | null>(null);
  const [confirmDeleteObservation, setConfirmDeleteObservation] = useState<{ listId: string; itemId: string } | null>(null);

  // Show lists scoped to current study and book (no chapter filter)
  const displayLists = lists.filter(l => {
    const studyMatch = l.studyId == null || l.studyId === activeStudyId;
    const bookMatch = l.scope?.book == null || l.scope.book === currentBook;
    return studyMatch && bookMatch;
  });

  // Update activeTab when initialTab changes (e.g., when opened from quick action)
  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Load lists on mount
  useEffect(() => {
    loadLists();
  }, [loadLists]);

  // If initialListId is provided, expand that list and scroll to it
  useEffect(() => {
    if (initialListId && lists.length > 0) {
      setExpandedLists(new Set([initialListId]));
      setActiveTab('lists');
      // Small delay to ensure the tab switch completes before scrolling
      setTimeout(() => {
        const listElement = document.querySelector(`[data-list-id="${initialListId}"]`);
        if (listElement) {
          listElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  }, [initialListId, lists]);

  // Tab definitions - Phase 1 agents will add their tabs here
  const tabs: { id: ObservationTab; label: string; icon: string }[] = [
    { id: 'lists', label: 'Lists', icon: '📝' },
    { id: 'fiveWAndH', label: '5 W\'s & H', icon: '❓' },
    { id: 'contrasts', label: 'Contrasts', icon: '⇔' },
    { id: 'time', label: 'Time', icon: '🕐' },
    { id: 'places', label: 'Places', icon: '📍' },
    { id: 'conclusions', label: 'Conclusions', icon: '→' },
    { id: 'theme', label: 'Theme', icon: '🎯' },
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

  const handleDeleteClick = (listId: string) => {
    setConfirmDeleteListId(listId);
  };

  const handleConfirmDeleteList = async () => {
    if (!confirmDeleteListId) return;
    const idToDelete = confirmDeleteListId;
    setConfirmDeleteListId(null);
    await deleteList(idToDelete);
  };

  const handleCancelDeleteList = () => {
    setConfirmDeleteListId(null);
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
    sortVerseGroups(verseGroups).forEach(([, verseItems]) => {
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
    setEditingItemNotes(item.notes || '');
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditingItemText('');
    setEditingItemNotes('');
  };

  const handleSaveEdit = async (listId: string, itemId: string) => {
    if (!editingItemText.trim()) {
      alert('Observation cannot be empty');
      return;
    }
    
    await updateItem(listId, itemId, {
      content: editingItemText.trim(),
      notes: editingItemNotes.trim() || undefined,
    });
    
    setEditingItemId(null);
    setEditingItemText('');
    setEditingItemNotes('');
    loadLists();
  };

  const handleDeleteObservationClick = (listId: string, itemId: string) => {
    setConfirmDeleteObservation({ listId, itemId });
  };

  const handleConfirmDeleteObservation = async () => {
    if (!confirmDeleteObservation) return;
    const { listId, itemId } = confirmDeleteObservation;
    setConfirmDeleteObservation(null);
    await deleteItem(listId, itemId);
    loadLists();
  };

  const handleCancelDeleteObservation = () => {
    setConfirmDeleteObservation(null);
  };

  // Navigation handler for verse references
  const handleNavigateToVerse = (verseRef: VerseRef) => {
    // Navigate to the book/chapter if different from current
    if (verseRef.book !== currentBook || verseRef.chapter !== currentChapter) {
      setLocation(verseRef.book, verseRef.chapter);
      // Wait for navigation to complete before scrolling
      setTimeout(() => {
        setNavSelectedVerse(verseRef.verse);
        const verseElement = document.querySelector(`[data-verse="${verseRef.verse}"]`);
        if (verseElement) {
          verseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Clear highlight after 3 seconds
        setTimeout(() => {
          setNavSelectedVerse(null);
        }, 3000);
      }, 100);
    } else {
      // Same chapter, just scroll to verse
      setNavSelectedVerse(verseRef.verse);
      const verseElement = document.querySelector(`[data-verse="${verseRef.verse}"]`);
      if (verseElement) {
        verseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      // Clear highlight after 3 seconds
      setTimeout(() => {
        setNavSelectedVerse(null);
      }, 3000);
    }
  };

  return (
    <>
      <ConfirmationDialog
        isOpen={confirmDeleteListId !== null}
        title="Delete List"
        message="Are you sure you want to delete this list? All observations will be lost."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDeleteList}
        onCancel={handleCancelDeleteList}
        destructive={true}
      />
      <ConfirmationDialog
        isOpen={confirmDeleteObservation !== null}
        title="Delete Observation"
        message="Are you sure you want to delete this observation?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDeleteObservation}
        onCancel={handleCancelDeleteObservation}
        destructive={true}
      />
      <div className="flex-1 min-h-0 flex flex-col relative" role="dialog" aria-label="Observation Tools" aria-modal="true">
      {/* Close button - compact floating in top-right */}
      <button
        onClick={onClose}
        className="absolute top-1 right-1 z-10 w-6 h-6 flex items-center justify-center
                   bg-scripture-surface rounded-full shadow-sm border border-scripture-border/50
                   text-scripture-muted hover:text-scripture-text hover:bg-scripture-elevated transition-colors"
        aria-label="Close observation tools"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Tabs and Filter - pr-12 reserves space for the close X button */}
      <div className="pl-4 pr-12 py-2 flex-shrink-0" role="tablist" aria-label="Observation tools sections">
        <div className="flex items-center justify-between gap-2 sm:gap-4 mb-2">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto flex-1">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                id={`observation-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`observation-tabpanel-${tab.id}`}
                title={tab.label}
                className={`
                  px-2 sm:px-3 py-1.5 rounded-lg text-sm font-ui font-medium transition-all whitespace-nowrap
                  flex items-center justify-center gap-1
                  ${activeTab === tab.id
                    ? 'bg-scripture-accent text-scripture-bg shadow-md'
                    : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'
                  }
                `}
              >
                <span className="text-base" aria-hidden="true">{tab.icon}</span>
                <span className={`text-xs ${activeTab === tab.id ? 'inline' : 'hidden sm:inline'}`}>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
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
          <div role="tabpanel" id="observation-tabpanel-lists" aria-labelledby="observation-tab-lists">
            {!isCreating && !editingListId && (
              <div className="mb-4">
                <button
                  onClick={() => setIsCreating(true)}
                  className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
                >
                  + New List
                </button>
              </div>
            )}

            {displayLists.length === 0 ? (
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
                {sortListsByVerse(displayLists).map(list => {
                  const isExpanded = expandedLists.has(list.id);
                  const keywordName = getKeywordName(list.keyWordId);
                  const studyName = getStudyName(list.studyId);
                  const itemsToShow = list.items;
                  const verseGroups = groupByVerse(itemsToShow);
                  
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
                                className="text-scripture-text hover:text-scripture-accent transition-colors flex-1 text-left flex items-center gap-2"
                              >
                                <span className="text-xs text-scripture-muted shrink-0" aria-hidden="true">
                                  {isExpanded ? '▼' : '▶'}
                                </span>
                                <h3 className="font-medium text-scripture-text">{list.title}</h3>
                                <span className="text-xs text-scripture-muted bg-scripture-elevated px-2 py-0.5 rounded">
                                  {verseGroups.size} {verseGroups.size === 1 ? 'verse' : 'verses'}
                                </span>
                              </button>
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
                              onClick={() => handleDeleteClick(list.id)}
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
                          {itemsToShow.length === 0 ? (
                            <p className="text-sm text-scripture-muted">
                              No observations yet. Add some from the Bible text.
                            </p>
                          ) : (
                            <div className="space-y-4">
                              {sortVerseGroups(verseGroups).map(([verseKey, verseItems]) => {
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
                                                <div>
                                                  <label className="block text-xs text-scripture-muted mb-1">Notes (optional)</label>
                                                  <textarea
                                                    value={editingItemNotes}
                                                    onChange={(e) => setEditingItemNotes(e.target.value)}
                                                    placeholder="Add additional notes about this observation..."
                                                    rows={2}
                                                    className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted resize-none"
                                                  />
                                                </div>
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
                                              <div className="flex flex-col gap-1.5 -ml-4">
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
                                                      onClick={() => handleDeleteObservationClick(list.id, item.id)}
                                                      className="px-2 py-1 text-xs text-highlight-red hover:text-highlight-red/80 transition-colors rounded hover:bg-scripture-elevated"
                                                      title="Delete observation"
                                                    >
                                                      🗑️
                                                    </button>
                                                  </div>
                                                </div>
                                                {item.notes && (
                                                  <div className="text-xs text-scripture-muted italic pl-2 border-l-2 border-scripture-border/30">
                                                    {item.notes}
                                                  </div>
                                                )}
                                                {!item.notes && (
                                                  <button
                                                    onClick={() => {
                                                      setAddingNotesToItemId(item.id);
                                                      setNewItemNotes('');
                                                    }}
                                                    className="text-xs text-scripture-muted hover:text-scripture-accent transition-colors text-left pl-2 opacity-0 group-hover/item:opacity-100"
                                                  >
                                                    + Add notes
                                                  </button>
                                                )}
                                                {addingNotesToItemId === item.id && (
                                                  <div className="pl-2 border-l-2 border-scripture-border/30 mt-1">
                                                    <textarea
                                                      value={newItemNotes}
                                                      onChange={(e) => setNewItemNotes(e.target.value)}
                                                      placeholder="Add notes..."
                                                      rows={2}
                                                      className="w-full px-2 py-1.5 text-xs bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted resize-none"
                                                      autoFocus
                                                    />
                                                    <div className="flex items-center gap-2 mt-1">
                                                      <button
                                                        onClick={async () => {
                                                          await updateItem(list.id, item.id, {
                                                            notes: newItemNotes.trim() || undefined,
                                                          });
                                                          setAddingNotesToItemId(null);
                                                          setNewItemNotes('');
                                                          loadLists();
                                                        }}
                                                        className="px-2 py-1 text-xs bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
                                                      >
                                                        Save
                                                      </button>
                                                      <button
                                                        onClick={() => {
                                                          setAddingNotesToItemId(null);
                                                          setNewItemNotes('');
                                                        }}
                                                        className="px-2 py-1 text-xs bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
                                                      >
                                                        Cancel
                                                      </button>
                                                    </div>
                                                  </div>
                                                )}
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
        ) : activeTab === 'fiveWAndH' ? (
          <div role="tabpanel" id="observation-tabpanel-fiveWAndH" aria-labelledby="observation-tab-fiveWAndH">
            <FiveWAndH 
              selectedText={selectedText} 
              verseRef={verseRef}
              onNavigate={handleNavigateToVerse}
            />
          </div>
        ) : activeTab === 'contrasts' ? (
          <div role="tabpanel" id="observation-tabpanel-contrasts" aria-labelledby="observation-tab-contrasts">
            <ContrastTracker 
              selectedText={selectedText} 
              verseRef={verseRef}
              onNavigate={handleNavigateToVerse}
            />
          </div>
        ) : activeTab === 'time' ? (
          <div role="tabpanel" id="observation-tabpanel-time" aria-labelledby="observation-tab-time">
            <TimeTracker 
              selectedText={selectedText} 
              verseRef={verseRef}
              onNavigate={handleNavigateToVerse}
            />
          </div>
        ) : activeTab === 'places' ? (
          <div role="tabpanel" id="observation-tabpanel-places" aria-labelledby="observation-tab-places">
            <PlaceTracker 
              selectedText={selectedText} 
              verseRef={verseRef}
              onNavigate={handleNavigateToVerse}
            />
          </div>
        ) : activeTab === 'conclusions' ? (
          <div role="tabpanel" id="observation-tabpanel-conclusions" aria-labelledby="observation-tab-conclusions">
            <ConclusionTracker 
              selectedText={selectedText} 
              verseRef={verseRef}
              onNavigate={handleNavigateToVerse}
            />
          </div>
        ) : activeTab === 'theme' ? (
          <div role="tabpanel" id="observation-tabpanel-theme" aria-labelledby="observation-tab-theme">
            <ThemeEditor selectedText={selectedText} verseRef={verseRef} />
          </div>
        ) : null}
      </div>
      </div>
    </>
  );
}
