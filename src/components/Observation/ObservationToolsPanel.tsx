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
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { fetchChapter } from '@/lib/bible-api';
import { getBookById, formatVerseRef } from '@/types';
import type { ObservationList, ObservationItem } from '@/types';
import type { VerseRef } from '@/types';
import { ListEditor } from '@/components/Lists/ListEditor';
import { TimeTracker } from './TimeTracker';
import { PlaceTracker } from './PlaceTracker';
import { PeopleTracker } from './PeopleTracker';
import { Button, Checkbox, ConfirmationDialog, Textarea } from '@/components/shared';

export type ObservationTab = 'lists' | 'time' | 'places' | 'people';

interface ObservationToolsPanelProps {
  onClose: () => void;
  initialTab?: ObservationTab;
  selectedText?: string;
  verseRef?: VerseRef;
  initialListId?: string;
  autoCreate?: boolean;
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

// Sort lists: favorites first, then alphabetical within each group
const sortLists = (lists: ObservationList[], favoriteIds: string[]): ObservationList[] => {
  const favSet = new Set(favoriteIds);
  return [...lists].sort((a, b) => {
    const aFav = favSet.has(a.id);
    const bFav = favSet.has(b.id);
    if (aFav !== bFav) return aFav ? -1 : 1;
    return a.title.localeCompare(b.title);
  });
};

function highlightWords(text: string, words: string[]): React.ReactNode {
  const filtered = words.filter(w => w.trim());
  if (!filtered.length || !text) return text;
  const escaped = filtered.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  escaped.sort((a, b) => b.length - a.length);
  const pattern = new RegExp(escaped.join('|'), 'gi');
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    const idx = match.index!;
    if (idx > lastIndex) result.push(text.slice(lastIndex, idx));
    result.push(
      <mark key={idx} className="bg-scripture-accent/25 text-scripture-text rounded-sm px-0.5 not-italic font-medium">{match[0]}</mark>
    );
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < text.length) result.push(text.slice(lastIndex));
  return result.length > 0 ? <>{result}</> : text;
}

export function ObservationToolsPanel({ 
  onClose: _onClose, 
  initialTab = 'lists',
  selectedText,
  verseRef,
  initialListId,
  autoCreate
}: ObservationToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<ObservationTab>(initialTab);
  const { lists, loadLists, deleteList, addItemToList, updateItem, deleteItem, toggleFavorite, favoriteListIds } = useListStore();
  const { presets } = useMarkingPresetStore();
  const { studies, activeStudyId } = useStudyStore();
  const { currentBook, currentChapter, navSelectedVerse, setLocation, setNavSelectedVerse } = useBibleStore();
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [expandedLists, setExpandedLists] = useState<Set<string>>(new Set());
  const [addingToVerse, setAddingToVerse] = useState<{ listId: string; verseRef: VerseRef } | null>(null);
  const [newObservationText, setNewObservationText] = useState('');
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemText, setEditingItemText] = useState('');
  const [editingItemNotes, setEditingItemNotes] = useState('');
  const [confirmDeleteListId, setConfirmDeleteListId] = useState<string | null>(null);
  const [confirmDeleteObservation, setConfirmDeleteObservation] = useState<{ listId: string; itemId: string } | null>(null);
  const [verseTexts, setVerseTexts] = useState<Map<string, string>>(new Map());
  const { activeView } = useMultiTranslationStore();
  const primaryModuleId = activeView?.translationIds[0] || '';
  const [filterByChapter, setFilterByChapter] = useState(true);
  const [trackerIsCreating, setTrackerIsCreating] = useState(false);
  const [trackerIsEditing, setTrackerIsEditing] = useState(false);
  const [showCustomVerse, setShowCustomVerse] = useState<string | null>(null); // listId when open
  const [customChapter, setCustomChapter] = useState('');
  const [customVerse, setCustomVerse] = useState('');

  // Show lists scoped to current study and book (no chapter filter)
  const displayLists = lists.filter(l => {
    const studyMatch = l.studyId == null || l.studyId === activeStudyId;
    const bookMatch = l.scope?.book == null || l.scope.book === currentBook;
    return studyMatch && bookMatch;
  });

  // Update activeTab when initialTab changes (e.g., when opened from quick action)
  useEffect(() => {
    queueMicrotask(() => {
      setActiveTab(initialTab);
      setTrackerIsCreating(false);
      setTrackerIsEditing(false);
    });
  }, [initialTab]);

  // Load lists on mount
  useEffect(() => {
    loadLists();
  }, [loadLists]);

  // If initialListId is provided, expand that list and scroll to it
  useEffect(() => {
    if (initialListId && lists.length > 0) {
      queueMicrotask(() => {
        setExpandedLists(new Set([initialListId]));
        setActiveTab('lists');
      });
      // Small delay to ensure the tab switch completes before scrolling
      setTimeout(() => {
        const listElement = document.querySelector(`[data-list-id="${initialListId}"]`);
        if (listElement) {
          listElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }
  }, [initialListId, lists]);

  // Auto-open the add-observation form when launched from Observe action
  useEffect(() => {
    if (autoCreate && initialListId && verseRef && lists.length > 0) {
      queueMicrotask(() => {
        setAddingToVerse({ listId: initialListId, verseRef });
      });
    }
  }, [autoCreate, initialListId, verseRef, lists]);

  // Load full verse texts for list items
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!primaryModuleId) return;
      const chapterCache = new Map<string, Map<number, string>>();
      const newTexts = new Map<string, string>();
      for (const list of displayLists) {
        for (const item of list.items) {
          const verseKey = getVerseKey(item.verseRef);
          if (newTexts.has(verseKey)) continue;
          const cacheKey = `${item.verseRef.book}:${item.verseRef.chapter}`;
          if (!chapterCache.has(cacheKey)) {
            try {
              const ch = await fetchChapter(primaryModuleId, item.verseRef.book, item.verseRef.chapter);
              const verseMap = new Map<number, string>();
              for (const v of ch.verses) verseMap.set(v.ref.verse, v.text);
              chapterCache.set(cacheKey, verseMap);
            } catch { /* skip */ }
          }
          const verses = chapterCache.get(cacheKey);
          if (verses) {
            newTexts.set(verseKey, verses.get(item.verseRef.verse) || '');
          }
        }
      }
      // Also fetch verse text for addingToVerse if it's a new verse not yet in any list
      if (addingToVerse) {
        const addKey = getVerseKey(addingToVerse.verseRef);
        if (!newTexts.has(addKey)) {
          const cacheKey = `${addingToVerse.verseRef.book}:${addingToVerse.verseRef.chapter}`;
          if (!chapterCache.has(cacheKey)) {
            try {
              const ch = await fetchChapter(primaryModuleId, addingToVerse.verseRef.book, addingToVerse.verseRef.chapter);
              const verseMap = new Map<number, string>();
              for (const v of ch.verses) verseMap.set(v.ref.verse, v.text);
              chapterCache.set(cacheKey, verseMap);
            } catch { /* skip */ }
          }
          const verses = chapterCache.get(cacheKey);
          if (verses) {
            newTexts.set(addKey, verses.get(addingToVerse.verseRef.verse) || '');
          }
        }
      }
      if (!cancelled) setVerseTexts(newTexts);
    })();
    return () => { cancelled = true; };
  }, [displayLists, primaryModuleId, addingToVerse]);

  const allTabs: { id: ObservationTab; label: string; icon: string }[] = [
    { id: 'lists', label: 'Lists', icon: '📝' },
    { id: 'time', label: 'Time', icon: '🕐' },
    { id: 'places', label: 'Places', icon: '📍' },
    { id: 'people', label: 'People', icon: '👤' },
  ];

  const tabs = allTabs;

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

  const newButtonLabels: Record<ObservationTab, string> = {
    lists: '+ New List',
    time: '+ New Time Expression',
    places: '+ New Place',
    people: '+ New Person',
  };

  const isAnyCreatingOrEditing = activeTab === 'lists'
    ? (isCreating || !!editingListId)
    : (trackerIsCreating || trackerIsEditing);

  const handleNewClick = () => {
    if (activeTab === 'lists') {
      setIsCreating(true);
    } else {
      setTrackerIsCreating(true);
    }
  };

  const handleTabChange = (tab: ObservationTab) => {
    setTrackerIsCreating(false);
    setTrackerIsEditing(false);
    setActiveTab(tab);
  };

  const chapFilteredLists = filterByChapter && currentBook && currentChapter
    ? displayLists.map(l => ({
        ...l,
        items: l.items.filter(item => item.verseRef.book === currentBook && item.verseRef.chapter === currentChapter)
      }))
    : displayLists;

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
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden relative" role="dialog" aria-label="Observation Tools" aria-modal="true">
      {/* Header with tabs */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 border-b border-scripture-border/30">
        <div role="tablist" aria-label="Observation tools sections" className="min-w-0">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
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
                <span className={`text-xs ${activeTab === tab.id ? 'inline' : 'hidden'}`}>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0 border-b border-scripture-border/30">
        <button
          onClick={handleNewClick}
          disabled={isAnyCreatingOrEditing}
          className="px-3 py-1.5 text-sm bg-scripture-accent text-scripture-bg rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {newButtonLabels[activeTab]}
        </button>
        <Checkbox
          label="Current Chapter Only"
          checked={filterByChapter}
          onChange={(e) => setFilterByChapter(e.target.checked)}
        />
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
            {displayLists.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-scripture-muted text-sm mb-4">No observation lists yet.</p>
                <p className="text-scripture-muted text-xs mb-4">Create a list to record observations about a specific keyword found in scripture.</p>
                <button
                  onClick={() => setIsCreating(true)}
                  className="px-4 py-2 bg-scripture-accent text-scripture-bg rounded-lg hover:bg-scripture-accent/90 transition-colors"
                >
                  Create Your First List
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {sortLists(chapFilteredLists, favoriteListIds).map(list => {
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
                              onClick={() => toggleFavorite(list.id)}
                              className="px-2 py-1 text-xs transition-colors"
                              title={favoriteListIds.includes(list.id) ? 'Remove from favorites' : 'Add to favorites'}
                            >
                              {favoriteListIds.includes(list.id) ? '⭐' : '☆'}
                            </button>
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
                          {/* Quick add buttons */}
                          {currentBook && currentChapter && (!addingToVerse || addingToVerse.listId !== list.id) && (() => {
                            const targetRef = verseRef ?? { book: currentBook, chapter: currentChapter, verse: navSelectedVerse ?? 1 };
                            return (
                            <div className="mb-3 flex flex-wrap gap-2">
                              <button
                                onClick={() => {
                                  setShowCustomVerse(null);
                                  setAddingToVerse({ listId: list.id, verseRef: targetRef });
                                }}
                                className="text-xs text-scripture-accent hover:text-scripture-accent/80 transition-colors px-2 py-1 rounded hover:bg-scripture-elevated border border-scripture-accent/30"
                              >
                                + Add for {formatVerseRef(targetRef.book, targetRef.chapter, targetRef.verse)}
                              </button>
                              <button
                                onClick={() => {
                                  setShowCustomVerse(showCustomVerse === list.id ? null : list.id);
                                  setCustomChapter(String(currentChapter));
                                  setCustomVerse('');
                                }}
                                className="text-xs text-scripture-muted hover:text-scripture-text transition-colors px-2 py-1 rounded hover:bg-scripture-elevated border border-scripture-border/30"
                              >
                                + Other verse...
                              </button>
                            </div>
                            );
                          })()}
                          {/* Custom verse input */}
                          {showCustomVerse === list.id && currentBook && (
                            <div className="mb-3 flex items-center gap-2">
                              <span className="text-xs text-scripture-muted">{getBookById(currentBook)?.name ?? currentBook}</span>
                              <input
                                type="number"
                                value={customChapter}
                                onChange={(e) => setCustomChapter(e.target.value)}
                                placeholder="Ch"
                                className="w-14 px-2 py-1 text-xs bg-scripture-elevated border border-scripture-border/50 rounded text-scripture-text"
                                min={1}
                              />
                              <span className="text-xs text-scripture-muted">:</span>
                              <input
                                type="number"
                                value={customVerse}
                                onChange={(e) => setCustomVerse(e.target.value)}
                                placeholder="Vs"
                                className="w-14 px-2 py-1 text-xs bg-scripture-elevated border border-scripture-border/50 rounded text-scripture-text"
                                min={1}
                                autoFocus
                              />
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={!customChapter || !customVerse}
                                onClick={() => {
                                  const ch = parseInt(customChapter, 10);
                                  const vs = parseInt(customVerse, 10);
                                  if (ch > 0 && vs > 0) {
                                    setAddingToVerse({
                                      listId: list.id,
                                      verseRef: { book: currentBook, chapter: ch, verse: vs }
                                    });
                                    setShowCustomVerse(null);
                                  }
                                }}
                              >
                                Add
                              </Button>
                              <button
                                onClick={() => setShowCustomVerse(null)}
                                className="text-xs text-scripture-muted hover:text-scripture-text px-1"
                              >
                                ✕
                              </button>
                            </div>
                          )}
                          {itemsToShow.length === 0 ? (
                            <p className="text-sm text-scripture-muted">
                              No observations yet.
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
                                      <button
                                        onClick={() => handleNavigateToVerse(verseRef)}
                                        className="text-sm font-medium text-scripture-accent hover:text-scripture-accent/80 underline cursor-pointer transition-colors"
                                        title="Click to navigate to verse"
                                      >
                                        {formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse)}
                                      </button>
                                      {!isAddingToThisVerse && (
                                        <button
                                          onClick={() => setAddingToVerse({ listId: list.id, verseRef })}
                                          className="text-xs text-scripture-muted hover:text-scripture-accent transition-colors px-2 py-1 rounded hover:bg-scripture-elevated"
                                        >
                                          + Add observation
                                        </button>
                                      )}
                                    </div>

                                    {/* Full verse context with keyword highlighted */}
                                    {verseTexts.get(verseKey) && (
                                      <div className="text-xs text-scripture-text italic pl-3 border-l-2 border-scripture-border/30 mb-2">
                                        {highlightWords(verseTexts.get(verseKey)!, [keywordName || ''])}
                                      </div>
                                    )}
                                    
                                    {/* Observations for this verse */}
                                    <div className="space-y-2">
                                      {verseItems.map(item => {
                                        const isEditing = editingItemId === item.id;
                                        const isVerseSnippet = item.content.includes('...');
                                        
                                        return (
                                          <div key={item.id} className="group/item">
                                            {isEditing ? (
                                              <div className="flex flex-col gap-2">
                                                <Textarea
                                                  value={editingItemText}
                                                  onChange={(e) => setEditingItemText(e.target.value)}
                                                  placeholder={`What do you observe about "${keywordName || 'this keyword'}" in this verse?`}
                                                  rows={3}
                                                  autoFocus
                                                />
                                                <Textarea
                                                  label="Notes (optional)"
                                                  value={editingItemNotes}
                                                  onChange={(e) => setEditingItemNotes(e.target.value)}
                                                  placeholder="Add additional notes about this observation..."
                                                  rows={2}
                                                />
                                                <div className="flex items-center justify-center sm:justify-end gap-2">
                                                  <Button variant="ghost" onClick={handleCancelEdit}>Cancel</Button>
                                                  <Button onClick={() => handleSaveEdit(list.id, item.id)} disabled={!editingItemText.trim()}>Save</Button>
                                                </div>
                                              </div>
                                            ) : isVerseSnippet ? (
                                              /* Verse snippet — muted quote style with keyword highlighted */
                                              <div className="flex items-start gap-2">
                                                <div className="flex-1 text-xs text-scripture-text italic pl-3 border-l-2 border-scripture-border/30">
                                                  {highlightWords(item.content, [keywordName || ''])}
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                  <button
                                                    onClick={() => handleStartEdit(item)}
                                                    className="px-2 py-1 text-xs text-scripture-muted hover:text-scripture-accent transition-colors rounded hover:bg-scripture-elevated"
                                                    title="Edit"
                                                  >
                                                    ✏️
                                                  </button>
                                                  <button
                                                    onClick={() => handleDeleteObservationClick(list.id, item.id)}
                                                    className="px-2 py-1 text-xs text-highlight-red hover:text-highlight-red/80 transition-colors rounded hover:bg-scripture-elevated"
                                                    title="Delete"
                                                  >
                                                    🗑️
                                                  </button>
                                                </div>
                                              </div>
                                            ) : (
                                              /* User observation — prominent style with accent border */
                                              <div className="flex flex-col gap-1">
                                                <div className="flex items-start gap-2">
                                                  <span className="flex-1 text-sm text-scripture-text">{item.content}</span>
                                                  <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/item:opacity-100 transition-opacity">
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
                                                  <div className="text-xs text-scripture-muted italic pl-3 border-l-2 border-scripture-border/30">
                                                    {item.notes}
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })}
                                    </div>
                                    
                                    {/* Add observation form for this verse */}
                                    {isAddingToThisVerse && (
                                      <div className="mt-3 pt-3 border-t border-scripture-border/30">
                                        <Textarea
                                          value={newObservationText}
                                          onChange={(e) => setNewObservationText(e.target.value)}
                                          placeholder={`What do you observe about "${keywordName || 'this keyword'}" in this verse?`}
                                          rows={3}
                                          className="mb-2"
                                          autoFocus
                                        />
                                        <div className="flex items-center justify-center sm:justify-end gap-2">
                                          <Button variant="ghost" onClick={handleCancelAddObservation}>Cancel</Button>
                                          <Button onClick={handleAddObservation} disabled={!newObservationText.trim()}>Add</Button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          {/* Inline add form for a new verse (quick-add from current verse button) */}
                          {addingToVerse?.listId === list.id && !verseGroups.has(getVerseKey(addingToVerse.verseRef)) && (
                            <div className="mt-3 pt-3 border-t border-scripture-border/30">
                              <p className="text-xs text-scripture-muted mb-2">
                                Adding to {formatVerseRef(addingToVerse.verseRef.book, addingToVerse.verseRef.chapter, addingToVerse.verseRef.verse)}
                              </p>
                              {verseTexts.get(getVerseKey(addingToVerse.verseRef)) && (
                                <div className="text-xs text-scripture-text italic pl-3 border-l-2 border-scripture-border/30 mb-2">
                                  {highlightWords(verseTexts.get(getVerseKey(addingToVerse.verseRef))!, [getKeywordName(list.keyWordId) || ''])}
                                </div>
                              )}
                              <Textarea
                                value={newObservationText}
                                onChange={(e) => setNewObservationText(e.target.value)}
                                placeholder={`What do you observe about "${getKeywordName(list.keyWordId) || 'this keyword'}" in this verse?`}
                                rows={3}
                                className="mb-2"
                                autoFocus
                              />
                              <div className="flex items-center justify-center sm:justify-end gap-2">
                                <Button variant="ghost" onClick={handleCancelAddObservation}>Cancel</Button>
                                <Button onClick={handleAddObservation} disabled={!newObservationText.trim()}>Add</Button>
                              </div>
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
        ) : activeTab === 'time' ? (
          <div role="tabpanel" id="observation-tabpanel-time" aria-labelledby="observation-tab-time">
            <TimeTracker
              selectedText={selectedText}
              verseRef={verseRef}
              autoCreate={autoCreate && initialTab === 'time'}
              filterByChapter={filterByChapter}
              isCreating={trackerIsCreating}
              setIsCreating={setTrackerIsCreating}
              onNavigate={handleNavigateToVerse}
            />
          </div>
        ) : activeTab === 'places' ? (
          <div role="tabpanel" id="observation-tabpanel-places" aria-labelledby="observation-tab-places">
            <PlaceTracker
              selectedText={selectedText}
              verseRef={verseRef}
              filterByChapter={filterByChapter}
              isCreating={trackerIsCreating}
              setIsCreating={setTrackerIsCreating}
              onNavigate={handleNavigateToVerse}
            />
          </div>
        ) : activeTab === 'people' ? (
          <div role="tabpanel" id="observation-tabpanel-people" aria-labelledby="observation-tab-people">
            <PeopleTracker
              selectedText={selectedText}
              verseRef={verseRef}
              filterByChapter={filterByChapter}
              isCreating={trackerIsCreating}
              setIsCreating={setTrackerIsCreating}
              onNavigate={handleNavigateToVerse}
            />
          </div>
        ) : null}
      </div>
      </div>
    </>
  );
}
