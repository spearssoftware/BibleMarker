/**
 * People Tracker
 *
 * Component for recording and displaying people and characters.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { usePeopleStore } from '@/stores/peopleStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useStudyStore } from '@/stores/studyStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useMultiTranslationStore } from '@/stores/multiTranslationStore';
import { getCachedChapter } from '@/lib/database';
import type { Person } from '@/types/person';
import type { VerseRef } from '@/types/bible';
import { formatVerseRef, getBookById } from '@/types/bible';
import { ConfirmationDialog, Input, Textarea, Checkbox } from '@/components/shared';

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

interface PeopleTrackerProps {
  selectedText?: string;
  verseRef?: VerseRef;
  filterByChapter?: boolean;
  onFilterByChapterChange?: (value: boolean) => void;
  onNavigate?: (verseRef: VerseRef) => void;
}

const getVerseKey = (ref: VerseRef): string => `${ref.book}:${ref.chapter}:${ref.verse}`;

function groupByVerse(people: Person[]): Map<string, Person[]> {
  const map = new Map<string, Person[]>();
  people.forEach(person => {
    const key = getVerseKey(person.verseRef);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(person);
  });
  return map;
}

function groupByKeyword(
  items: Person[],
  presetMap: Map<string, { word?: string }>
): Array<{ key: string; label: string; items: Person[] }> {
  const byKey = new Map<string, Person[]>();
  for (const item of items) {
    const key = item.presetId || 'manual';
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(item);
  }
  return Array.from(byKey.entries()).map(([key, keywordItems]) => {
    const label = key === 'manual' ? 'Manual' : (presetMap.get(key)?.word ?? 'Unknown');
    return { key, label, items: keywordItems };
  });
}

function sortKeywordGroups(
  groups: Array<{ key: string; label: string; items: Person[] }>
): Array<{ key: string; label: string; items: Person[] }> {
  return [...groups].sort((a, b) => {
    if (a.key === 'manual' && b.key !== 'manual') return 1;
    if (b.key === 'manual' && a.key !== 'manual') return -1;
    const nameCmp = a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    if (nameCmp !== 0) return nameCmp;
    const minVerse = (items: Person[]) => {
      if (items.length === 0) return '';
      const keys = items.map(p => getVerseKey(p.verseRef));
      keys.sort((ka, kb) => {
        const [bookA, chA, vA] = ka.split(':');
        const [bookB, chB, vB] = kb.split(':');
        const ordA = getBookById(bookA)?.order ?? 999;
        const ordB = getBookById(bookB)?.order ?? 999;
        if (ordA !== ordB) return ordA - ordB;
        if (parseInt(chA, 10) !== parseInt(chB, 10)) return parseInt(chA, 10) - parseInt(chB, 10);
        return parseInt(vA, 10) - parseInt(vB, 10);
      });
      return keys[0];
    };
    return minVerse(a.items).localeCompare(minVerse(b.items));
  });
}

const sortVerseGroups = (groups: Map<string, Person[]>): Array<[string, Person[]]> => {
  return Array.from(groups.entries()).sort(([keyA], [keyB]) => {
    const [bookA, chapterA, verseA] = keyA.split(':');
    const [bookB, chapterB, verseB] = keyB.split(':');
    const bookInfoA = getBookById(bookA);
    const bookInfoB = getBookById(bookB);
    if (bookInfoA && bookInfoB && bookInfoA.order !== bookInfoB.order) return bookInfoA.order - bookInfoB.order;
    if (!bookInfoA && !bookInfoB) return 0;
    if (!bookInfoA) return 1;
    if (!bookInfoB) return -1;
    const chapterANum = parseInt(chapterA, 10);
    const chapterBNum = parseInt(chapterB, 10);
    if (chapterANum !== chapterBNum) return chapterANum - chapterBNum;
    return parseInt(verseA, 10) - parseInt(verseB, 10);
  });
};

export function PeopleTracker({
  selectedText,
  verseRef: initialVerseRef,
  filterByChapter = true,
  onFilterByChapterChange,
  onNavigate,
}: PeopleTrackerProps) {
  const { people, loadPeople, createPerson, updatePerson, deletePerson, autoImportFromAnnotations, removeDuplicates, autoPopulateFromChapter } = usePeopleStore();
  const { currentBook, currentChapter } = useBibleStore();
  const { activeStudyId } = useStudyStore();
  const { presets } = useMarkingPresetStore();
  const presetMap = useMemo(() => new Map(presets.map(p => [p.id, { word: p.word }])), [presets]);
  const [expandedKeywords, setExpandedKeywords] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newNotes, setNewNotes] = useState('');
  const [editingName, setEditingName] = useState('');
  const [editingNotes, setEditingNotes] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [addingObservationToId, setAddingObservationToId] = useState<string | null>(null);
  const [newObservation, setNewObservation] = useState('');
  const [verseTexts, setVerseTexts] = useState<Map<string, string>>(new Map());
  const [isPopulating, setIsPopulating] = useState(false);
  const hasInitialized = useRef(false);
  const { activeView } = useMultiTranslationStore();
  const primaryModuleId = activeView?.translationIds[0] || '';

  const getCurrentVerseRef = (): VerseRef | null => {
    if (initialVerseRef) return initialVerseRef;
    if (currentBook && currentChapter) return { book: currentBook, chapter: currentChapter, verse: 1 };
    return null;
  };

  useEffect(() => { loadPeople(); }, [loadPeople]);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      if (!hasInitialized.current) {
        hasInitialized.current = true;
        const removed = await removeDuplicates();
        if (removed > 0 && isMounted) console.log(`[PeopleTracker] Removed ${removed} duplicate people`);
        try {
          const count = await autoImportFromAnnotations();
          if (count > 0 && isMounted) loadPeople();
        } catch (e) {
          if (isMounted) console.error('[PeopleTracker] Auto-import failed:', e);
        }
      }
    };
    init();
    return () => { isMounted = false; };
  }, [autoImportFromAnnotations, loadPeople, removeDuplicates]);

  useEffect(() => {
    if (selectedText && isCreating && !newName) queueMicrotask(() => setNewName(selectedText.trim()));
  }, [selectedText, isCreating, newName]);

  const handleCreate = async () => {
    const verseRef = getCurrentVerseRef();
    if (!verseRef || !newName.trim()) {
      alert('Please fill in the person name and ensure you have a verse reference.');
      return;
    }
    await createPerson(newName.trim(), verseRef, newNotes.trim() || undefined);
    setIsCreating(false);
    setNewName('');
    setNewNotes('');
    loadPeople();
  };

  const handleCancelCreate = () => {
    setIsCreating(false);
    setNewName('');
    setNewNotes('');
  };

  const handleStartEdit = (person: Person) => {
    setEditingId(person.id);
    setEditingName(person.name);
    setEditingNotes(person.notes || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName('');
    setEditingNotes('');
  };

  const handleSaveEdit = async (personId: string) => {
    if (!editingName.trim()) { alert('Person name is required.'); return; }
    const person = people.find(p => p.id === personId);
    if (!person) return;
    await updatePerson({ ...person, name: editingName.trim(), notes: editingNotes.trim() || undefined });
    setEditingId(null);
    setEditingName('');
    setEditingNotes('');
    loadPeople();
  };

  const handleDeleteClick = (id: string) => setConfirmDeleteId(id);
  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    await deletePerson(id);
    loadPeople();
  };
  const handleCancelDelete = () => setConfirmDeleteId(null);

  const handleAddObservation = async (personId: string) => {
    if (!newObservation.trim()) return;
    const p = people.find(x => x.id === personId);
    if (!p) return;
    await updatePerson({ ...p, notes: (p.notes ? p.notes + '\n' : '') + newObservation.trim() });
    setAddingObservationToId(null);
    setNewObservation('');
    loadPeople();
  };

  const handlePopulateFromChapter = async () => {
    if (!currentBook || !currentChapter || !primaryModuleId || isPopulating) return;
    setIsPopulating(true);
    try {
      const count = await autoPopulateFromChapter(currentBook, currentChapter, primaryModuleId);
      await loadPeople();
      if (count > 0) alert(`Added ${count} person(s) from chapter.`);
    } catch (e) {
      console.error('[PeopleTracker] Populate failed:', e);
    } finally {
      setIsPopulating(false);
    }
  };

  const filteredPeople = useMemo(() => {
    let f = people;
    if (activeStudyId) f = f.filter(p => !p.studyId || p.studyId === activeStudyId);
    if (filterByChapter) f = f.filter(p => p.verseRef.book === currentBook && p.verseRef.chapter === currentChapter);
    return f;
  }, [people, filterByChapter, currentBook, currentChapter, activeStudyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!primaryModuleId) return;
      const chapterCache = new Map<string, Record<number, string>>();
      const newTexts = new Map<string, string>();
      for (const p of filteredPeople) {
        const cacheKey = `${p.verseRef.book}:${p.verseRef.chapter}`;
        if (!chapterCache.has(cacheKey)) {
          const cached = await getCachedChapter(primaryModuleId, p.verseRef.book, p.verseRef.chapter);
          if (cached?.verses) chapterCache.set(cacheKey, cached.verses);
        }
        const verses = chapterCache.get(cacheKey);
        if (verses) newTexts.set(getVerseKey(p.verseRef), verses[p.verseRef.verse] || '');
      }
      if (!cancelled) setVerseTexts(newTexts);
    })();
    return () => { cancelled = true; };
  }, [filteredPeople, primaryModuleId]);

  const keywordGroups = useMemo(() => {
    const grouped = groupByKeyword(filteredPeople, presetMap);
    return sortKeywordGroups(grouped);
  }, [filteredPeople, presetMap]);

  const toggleKeyword = (key: string) => {
    setExpandedKeywords(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <>
      <ConfirmationDialog
        isOpen={confirmDeleteId !== null}
        title="Delete Person"
        message="Are you sure you want to delete this person? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        destructive={true}
      />
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
        {!isCreating && (
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsCreating(true)}
              className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
            >
              + New Person
            </button>
            {currentBook && currentChapter && (
              <button
                onClick={handlePopulateFromChapter}
                disabled={isPopulating || !primaryModuleId}
                className="px-3 py-1.5 text-sm bg-scripture-elevated text-scripture-text rounded hover:bg-scripture-border/50 transition-colors disabled:opacity-50"
              >
                {isPopulating ? '...' : 'Populate from Chapter'}
              </button>
            )}
            {onFilterByChapterChange && (
              <Checkbox
                label="Current Chapter Only"
                checked={filterByChapter}
                onChange={(e) => onFilterByChapterChange(e.target.checked)}
              />
            )}
          </div>
        )}

        {isCreating && (
          <div className="mb-4 p-4 bg-scripture-surface rounded-xl border border-scripture-border/50">
            <h3 className="text-sm font-medium text-scripture-text mb-3">New Person</h3>
            <div className="space-y-3">
              <Input
                label="Person Name"
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g., 'Abraham', 'Moses', 'Paul'"
                autoFocus
              />
              <Textarea
                label="Notes (optional)"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Additional notes about this person"
                rows={2}
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim() || !getCurrentVerseRef()}
                  className="px-3 py-1.5 text-xs bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Save
                </button>
                <button
                  onClick={handleCancelCreate}
                  className="px-3 py-1.5 text-xs bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
                >
                  Cancel
                </button>
              </div>
              {!getCurrentVerseRef() && (
                <p className="text-xs text-scripture-muted">Note: Verse reference will use current location or selected verse.</p>
              )}
            </div>
          </div>
        )}

        {people.length === 0 && !isCreating && (
          <div className="text-center py-12">
            <p className="text-scripture-muted text-sm mb-4">No people recorded yet.</p>
            <p className="text-scripture-muted text-xs mb-4">
              Record people and characters you observe in the text. Use the 👤 or 👥 symbols to mark people, then add details here.
            </p>
            <button
              onClick={() => setIsCreating(true)}
              className="px-4 py-2 bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
            >
              Create Your First Person
            </button>
          </div>
        )}

        {filteredPeople.length > 0 && (
          <div className="space-y-4">
            {keywordGroups.map(({ key, label, items: keywordItems }) => {
              const isExpanded = expandedKeywords.has(key);
              const verseGroups = groupByVerse(keywordItems);
              const sortedVerseGroups = sortVerseGroups(verseGroups);
              return (
                <div key={key} className="bg-scripture-surface rounded-xl border border-scripture-border/50 overflow-hidden">
                  <button
                    onClick={() => toggleKeyword(key)}
                    className="w-full p-4 text-left flex items-center gap-2 hover:bg-scripture-elevated/50 transition-colors"
                  >
                    <span className="text-xs text-scripture-muted shrink-0">{isExpanded ? '▼' : '▶'}</span>
                    <h3 className="font-medium text-scripture-text">{label}</h3>
                    <span className="text-xs text-scripture-muted bg-scripture-elevated px-2 py-0.5 rounded">
                      {verseGroups.size} {verseGroups.size === 1 ? 'verse' : 'verses'}
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-scripture-border/30 p-3 space-y-3">
                      {sortedVerseGroups.map(([verseKey, versePeople]) => {
                        const verseRef = versePeople[0].verseRef;
                        const verseSnippet = verseTexts.get(verseKey);
                        return (
                          <div key={verseKey} className="bg-scripture-bg/50 rounded-lg border border-scripture-border/30 p-3">
                            <div className="flex items-center justify-between mb-2">
                              {onNavigate ? (
                                <button
                                  onClick={() => onNavigate(verseRef)}
                                  className="text-sm font-medium text-scripture-accent hover:text-scripture-accent/80 underline cursor-pointer transition-colors"
                                  title="Click to navigate to verse"
                                >
                                  {formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse)}
                                </button>
                              ) : (
                                <span className="text-sm font-medium text-scripture-accent">
                                  {formatVerseRef(verseRef.book, verseRef.chapter, verseRef.verse)}
                                </span>
                              )}
                            </div>
                            {verseSnippet && (
                              <div className="text-xs text-scripture-text italic pl-3 border-l-2 border-scripture-border/30 mb-2">
                                {highlightWords(verseSnippet, versePeople.map(p => p.name))}
                              </div>
                            )}
                            <div className="space-y-2">
                              {versePeople.map(person => {
                                const isEditing = editingId === person.id;
                                const isAddingObs = addingObservationToId === person.id;
                                return (
                                  <div key={person.id} className="group/person">
                                    {isEditing ? (
                                      <div className="space-y-3">
                                        <Input label="Person Name" type="text" value={editingName} onChange={(e) => setEditingName(e.target.value)} autoFocus />
                                        <Textarea label="Notes (optional)" value={editingNotes} onChange={(e) => setEditingNotes(e.target.value)} rows={2} />
                                        <div className="flex items-center gap-2">
                                          <button onClick={() => handleSaveEdit(person.id)} disabled={!editingName.trim()} className="px-3 py-1.5 text-xs bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Save</button>
                                          <button onClick={handleCancelEdit} className="px-3 py-1.5 text-xs bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors">Cancel</button>
                                        </div>
                                      </div>
                                    ) : (
                                      <>
                                        <div className="flex items-start gap-2">
                                          <div className="flex-1"><span className="text-sm font-medium text-scripture-text">👤 {person.name}</span></div>
                                          <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover/person:opacity-100 transition-opacity">
                                            <button onClick={() => handleStartEdit(person)} className="px-2 py-1 text-xs text-scripture-muted hover:text-scripture-accent transition-colors rounded hover:bg-scripture-elevated" title="Edit person">✏️</button>
                                            <button onClick={() => handleDeleteClick(person.id)} className="px-2 py-1 text-xs text-highlight-red hover:text-highlight-red/80 transition-colors rounded hover:bg-scripture-elevated" title="Delete person">🗑️</button>
                                          </div>
                                        </div>
                                        {person.notes && <div className="mt-1 text-sm text-scripture-text">{person.notes}</div>}
                                        {!isAddingObs && (
                                          <button onClick={() => { setAddingObservationToId(person.id); setNewObservation(''); }} className="mt-1 text-xs text-scripture-muted hover:text-scripture-accent transition-colors">+ Add observation</button>
                                        )}
                                        {isAddingObs && (
                                          <div className="mt-2">
                                            <Textarea value={newObservation} onChange={(e) => setNewObservation(e.target.value)} placeholder="What do you observe about this person?" rows={2} autoFocus />
                                            <div className="flex items-center gap-2 mt-1">
                                              <button onClick={() => handleAddObservation(person.id)} disabled={!newObservation.trim()} className="px-3 py-1.5 text-xs bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">Add</button>
                                              <button onClick={() => { setAddingObservationToId(null); setNewObservation(''); }} className="px-3 py-1.5 text-xs bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors">Cancel</button>
                                            </div>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
