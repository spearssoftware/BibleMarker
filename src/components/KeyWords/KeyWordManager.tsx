/**
 * Key Word Manager Component
 * 
 * UI for creating, editing, and managing key word definitions.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useBibleStore } from '@/stores/bibleStore';
import { useStudyStore } from '@/stores/studyStore';
import { createMarkingPreset, KEY_WORD_CATEGORIES, getCategoryForSymbol, type KeyWordCategory, type MarkingPreset, type Variant } from '@/types/keyWord';
import { SYMBOLS, HIGHLIGHT_COLORS, getRandomHighlightColor, type SymbolKey, type HighlightColor } from '@/types/annotation';
import { Input, Textarea, Label, DropdownSelect, Checkbox, Button } from '@/components/shared';
import { getBookById, BIBLE_BOOKS } from '@/types/bible';

interface KeyWordManagerProps {
  onClose?: () => void;
  /** When set, open in create mode with this word pre-filled (e.g. from "➕ Key Word" on selection) */
  initialWord?: string;
  initialSymbol?: SymbolKey;
  initialColor?: HighlightColor;
  /** When creating from a selection (initialWord), call after save to apply the new preset to that selection */
  onPresetCreated?: (preset: MarkingPreset) => void | Promise<void>;
}

export function KeyWordManager({ onClose, initialWord, initialSymbol, initialColor, onPresetCreated }: KeyWordManagerProps) {
  const {
    presets,
    filterCategory,
    searchQuery,
    isLoading,
    loadPresets,
    addPreset,
    updatePreset,
    removePreset,
    selectPreset,
    setFilterCategory,
    setSearchQuery,
    getFilteredPresets,
  } = useMarkingPresetStore();
  
  const { currentBook, currentChapter } = useBibleStore();
  const { activeStudyId } = useStudyStore();

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [filterScope, setFilterScope] = useState<'all' | 'global' | 'book' | 'chapter'>('all');

  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  // When opened with a selection (e.g. "➕ Key Word"), start in create mode
  useEffect(() => {
    if (initialWord) {
      setIsCreating(true);
      setEditingId(null);
    }
  }, [initialWord]);

  // Filter presets by active study and scope, then sort by scope and alphabetical
  const filteredPresets = useMemo(() => {
    let filtered = getFilteredPresets();
    
    // Filter by active study
    if (activeStudyId) {
      filtered = filtered.filter(preset => {
        // Global keywords (no studyId) are always visible
        if (!preset.studyId) return true;
        // Show keywords that belong to the active study
        return preset.studyId === activeStudyId;
      });
    }
    
    // Filter by scope
    if (filterScope !== 'all') {
      filtered = filtered.filter(preset => {
        if (filterScope === 'global') {
          return !preset.bookScope && !preset.chapterScope;
        } else if (filterScope === 'book') {
          return preset.bookScope && !preset.chapterScope;
        } else if (filterScope === 'chapter') {
          return preset.chapterScope !== undefined;
        }
        return true;
      });
    }
    
    // Sort by scope first (global, then book, then chapter), then alphabetical
    return filtered.sort((a, b) => {
      // Determine scope order: global = 0, book = 1, chapter = 2
      const getScopeOrder = (preset: MarkingPreset) => {
        if (preset.chapterScope !== undefined) return 2;
        if (preset.bookScope) return 1;
        return 0;
      };
      
      const scopeA = getScopeOrder(a);
      const scopeB = getScopeOrder(b);
      
      if (scopeA !== scopeB) {
        return scopeA - scopeB;
      }
      
      // Same scope, sort alphabetically by word
      return (a.word || '').localeCompare(b.word || '');
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- filterCategory, presets, searchQuery are for stability; getFilteredPresets already reflects them
  }, [getFilteredPresets, activeStudyId, filterScope, presets, filterCategory, searchQuery]);

  function handleCreate() {
    setIsCreating(true);
    setEditingId(null);
    selectPreset(null);
  }

  function handleEdit(preset: typeof presets[0]) {
    setEditingId(preset.id);
    setIsCreating(false);
    selectPreset(preset);
  }

  function handleCancel() {
    setIsCreating(false);
    setEditingId(null);
    selectPreset(null);
  }

  async function handleSave(formData: {
    word: string;
    variants: Variant[];
    symbol?: SymbolKey;
    color?: HighlightColor;
    category: KeyWordCategory;
    description: string;
    autoSuggest: boolean;
    bookScope?: string;
    chapterScope?: number;
    studyId?: string;
  }) {
    try {
      const highlight = formData.color ? { style: 'highlight' as const, color: formData.color } : undefined;
      if (editingId) {
        const existing = presets.find((p) => p.id === editingId);
        if (existing) {
            await updatePreset({
            ...existing,
            word: formData.word.trim() || undefined,
            variants: formData.variants,
            symbol: formData.symbol,
            highlight,
            category: formData.category,
            description: formData.description,
            autoSuggest: formData.autoSuggest,
            bookScope: formData.bookScope,
            chapterScope: formData.chapterScope,
            studyId: formData.studyId,
            updatedAt: new Date(),
          });
        }
      } else {
        if (!formData.symbol && !formData.color) {
          alert('Add at least a symbol or a color.');
          return;
        }
        const preset = createMarkingPreset({
          word: formData.word.trim() || undefined,
          variants: formData.variants,
          symbol: formData.symbol,
          highlight,
          category: formData.category,
          description: formData.description,
          autoSuggest: formData.autoSuggest,
          bookScope: formData.bookScope,
          chapterScope: formData.chapterScope,
          studyId: formData.studyId,
        });
        await addPreset(preset);
        if (initialWord && onPresetCreated) {
          await onPresetCreated(preset);
          return;
        }
      }
      handleCancel();
    } catch (error) {
      console.error('Failed to save key word:', error);
      alert('Failed to save key word. Please try again.');
    }
  }

  function handleDeleteClick(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    // Prevent multiple simultaneous deletions
    if (deletingId || confirmDeleteId) {
      return;
    }
    
    setConfirmDeleteId(id);
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    
    const idToDelete = confirmDeleteId;
    setConfirmDeleteId(null);
    setDeletingId(idToDelete);
    
    try {
      await removePreset(idToDelete);
    } catch (error) {
      console.error('Failed to delete key word:', error);
      alert('Failed to delete key word. Please try again.');
    } finally {
      setDeletingId(null);
    }
  }

  function cancelDelete() {
    setConfirmDeleteId(null);
  }

  return (
    <div 
      className="flex flex-col flex-1 min-h-0 relative"
      role="dialog"
      aria-label="Key Word Manager"
      aria-modal="true"
    >
      {/* Search + New button: always visible when viewing the list */}
      {!(isCreating || editingId) && (
        <div className="px-4 py-2 border-b border-scripture-border/50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" onClick={handleCreate}>
              + New
            </Button>
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search key words..."
              className="flex-1 min-w-0"
            />
          </div>
        </div>
      )}

      {/* Collapsible Filters */}
      {!(isCreating || editingId) && (
        <details className="border-b border-scripture-border/30 flex-shrink-0">
          <summary className="px-4 py-2 text-xs font-ui font-medium cursor-pointer text-scripture-muted 
                             hover:text-scripture-text hover:bg-scripture-elevated/50 transition-colors
                             flex items-center gap-2 select-none">
            <svg className="w-3 h-3 transition-transform details-open:rotate-90" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span>Filters</span>
            {(filterCategory !== 'all' || filterScope !== 'all') && (
              <span className="px-1.5 py-0.5 bg-scripture-accent/20 text-scripture-accent rounded text-[10px] font-semibold">
                Active
              </span>
            )}
          </summary>
          <div className="px-4 pb-3 space-y-2">
            {/* Category filters */}
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-scripture-muted font-medium self-center mr-1">Category:</span>
              <button
                onClick={() => setFilterCategory('all')}
                className={`px-2.5 py-1 text-xs font-ui rounded-lg transition-colors
                            ${filterCategory === 'all'
                              ? 'bg-scripture-accent text-scripture-bg'
                              : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'}`}
              >
                All
              </button>
              {Object.entries(KEY_WORD_CATEGORIES).map(([cat, info]) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat as KeyWordCategory)}
                  className={`px-2.5 py-1 text-xs font-ui rounded-lg transition-colors flex items-center gap-1.5
                              ${filterCategory === cat
                                ? 'bg-scripture-accent text-scripture-bg'
                                : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'}`}
                >
                  <span>{info.icon}</span>
                  <span>{info.label}</span>
                </button>
              ))}
            </div>
            {/* Scope filters */}
            <div className="flex flex-wrap gap-1.5">
              <span className="text-xs text-scripture-muted font-medium self-center mr-1">Scope:</span>
              <button
                onClick={() => setFilterScope('all')}
                className={`px-2.5 py-1 text-xs font-ui rounded-lg transition-colors
                            ${filterScope === 'all'
                              ? 'bg-scripture-accent text-scripture-bg'
                              : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'}`}
              >
                All
              </button>
              <button
                onClick={() => setFilterScope('global')}
                className={`px-2.5 py-1 text-xs font-ui rounded-lg transition-colors
                            ${filterScope === 'global'
                              ? 'bg-scripture-accent text-scripture-bg'
                              : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'}`}
              >
                🌍 Global
              </button>
              <button
                onClick={() => setFilterScope('book')}
                className={`px-2.5 py-1 text-xs font-ui rounded-lg transition-colors
                            ${filterScope === 'book'
                              ? 'bg-scripture-accent text-scripture-bg'
                              : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'}`}
              >
                📖 Book
              </button>
              <button
                onClick={() => setFilterScope('chapter')}
                className={`px-2.5 py-1 text-xs font-ui rounded-lg transition-colors
                            ${filterScope === 'chapter'
                              ? 'bg-scripture-accent text-scripture-bg'
                              : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'}`}
              >
                📄 Chapter
              </button>
            </div>
          </div>
        </details>
      )}

      {/* Delete Confirmation Dialog */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-scripture-surface border border-scripture-border rounded-lg p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-scripture-text mb-2">
              Delete Key Word?
            </h3>
            <p className="text-scripture-muted mb-6">
              Are you sure you want to delete this key word? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <Button variant="secondary" onClick={cancelDelete}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center text-scripture-muted text-sm">
            Loading key words...
          </div>
        ) : isCreating || editingId ? (
          <KeyWordEditor
            preset={editingId ? presets.find((p) => p.id === editingId) : undefined}
            initialWord={isCreating ? initialWord : undefined}
            initialSymbol={isCreating ? initialSymbol : undefined}
            initialColor={isCreating ? initialColor : undefined}
            currentBook={currentBook}
            currentChapter={currentChapter}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
            {filteredPresets.length === 0 ? (
              <div className="text-center py-8">
                {searchQuery || filterCategory !== 'all' ? (
                  <p className="text-scripture-muted text-sm">No key words match your filters</p>
                ) : (
                  <Button variant="primary" onClick={handleCreate}>
                    Create Your First Key Word
                  </Button>
                )}
              </div>
            ) : (
              <KeywordListByScope 
                presets={filteredPresets.filter((p) => p.word)}
                onEdit={handleEdit}
                onDelete={handleDeleteClick}
                deletingId={deletingId}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Keyword List Grouped by Scope Component */
function KeywordListByScope({
  presets,
  onEdit,
  onDelete,
  deletingId,
}: {
  presets: MarkingPreset[];
  onEdit: (preset: MarkingPreset) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  deletingId: string | null;
}) {
  // Group presets by scope
  const grouped = useMemo(() => {
    const groups: {
      global: MarkingPreset[];
      book: Record<string, MarkingPreset[]>;
      chapter: Record<string, MarkingPreset[]>;
    } = {
      global: [],
      book: {},
      chapter: {},
    };

    presets.forEach(preset => {
      if (preset.chapterScope !== undefined) {
        const key = `${preset.bookScope}:${preset.chapterScope}`;
        if (!groups.chapter[key]) groups.chapter[key] = [];
        groups.chapter[key].push(preset);
      } else if (preset.bookScope) {
        if (!groups.book[preset.bookScope]) groups.book[preset.bookScope] = [];
        groups.book[preset.bookScope].push(preset);
      } else {
        groups.global.push(preset);
      }
    });

    return groups;
  }, [presets]);

  return (
    <div className="space-y-4">
      {/* Global Keywords Section */}
      {grouped.global.length > 0 && (
        <div className="border border-scripture-border/50 rounded-lg bg-scripture-surface/30 p-3">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-scripture-border/30">
            <span className="text-lg">🌍</span>
            <h3 className="text-sm font-semibold text-scripture-text">Global Keywords</h3>
            <span className="text-xs text-scripture-muted ml-auto">
              {grouped.global.length} {grouped.global.length === 1 ? 'keyword' : 'keywords'}
            </span>
          </div>
          <div className="space-y-2">
            {grouped.global.map((preset) => (
              <KeyWordCard
                key={preset.id}
                preset={preset}
                onEdit={() => onEdit(preset)}
                onDelete={(e) => onDelete(preset.id, e)}
                isDeleting={deletingId === preset.id}
              />
            ))}
          </div>
        </div>
      )}

      {/* Book-scoped Keywords Sections */}
      {Object.entries(grouped.book)
        .sort(([a], [b]) => {
          // Sort by full book name for better readability
          const bookA = getBookById(a)?.name || a;
          const bookB = getBookById(b)?.name || b;
          return bookA.localeCompare(bookB);
        })
        .map(([bookId, bookPresets]) => {
          const bookInfo = getBookById(bookId);
          const bookName = bookInfo?.name || bookId;
          return (
            <div key={`book-${bookId}`} className="border border-scripture-border/50 rounded-lg bg-scripture-surface/30 p-3">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-scripture-border/30">
                <span className="text-lg">📖</span>
                <h3 className="text-sm font-semibold text-scripture-text">{bookName}</h3>
                <span className="text-xs text-scripture-muted ml-auto">
                  {bookPresets.length} {bookPresets.length === 1 ? 'keyword' : 'keywords'}
                </span>
              </div>
              <div className="space-y-2">
                {bookPresets.map((preset) => (
                  <KeyWordCard
                    key={preset.id}
                    preset={preset}
                    onEdit={() => onEdit(preset)}
                    onDelete={(e) => onDelete(preset.id, e)}
                    isDeleting={deletingId === preset.id}
                  />
                ))}
              </div>
            </div>
          );
        })}

      {/* Chapter-scoped Keywords Sections */}
      {Object.entries(grouped.chapter)
        .sort(([a], [b]) => {
          // Sort by full book name, then chapter number
          const [bookA, chapterA] = a.split(':');
          const [bookB, chapterB] = b.split(':');
          const bookNameA = getBookById(bookA)?.name || bookA;
          const bookNameB = getBookById(bookB)?.name || bookB;
          if (bookNameA !== bookNameB) {
            return bookNameA.localeCompare(bookNameB);
          }
          return parseInt(chapterA) - parseInt(chapterB);
        })
        .map(([key, chapterPresets]) => {
          const [bookId, chapter] = key.split(':');
          const bookInfo = getBookById(bookId);
          const bookName = bookInfo?.name || bookId;
          return (
            <div key={`chapter-${key}`} className="border border-scripture-border/50 rounded-lg bg-scripture-surface/30 p-3">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-scripture-border/30">
                <span className="text-lg">📄</span>
                <h3 className="text-sm font-semibold text-scripture-text">{bookName} {chapter}</h3>
                <span className="text-xs text-scripture-muted ml-auto">
                  {chapterPresets.length} {chapterPresets.length === 1 ? 'keyword' : 'keywords'}
                </span>
              </div>
              <div className="space-y-2">
                {chapterPresets.map((preset) => (
                  <KeyWordCard
                    key={preset.id}
                    preset={preset}
                    onEdit={() => onEdit(preset)}
                    onDelete={(e) => onDelete(preset.id, e)}
                    isDeleting={deletingId === preset.id}
                  />
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}

/** Key Word Card Component */
function KeyWordCard({
  preset,
  onEdit,
  onDelete,
  isDeleting,
}: {
  preset: MarkingPreset;
  onEdit: () => void;
  onDelete: (e: React.MouseEvent) => void;
  isDeleting?: boolean;
}) {
  const { studies } = useStudyStore();
  const categoryInfo = KEY_WORD_CATEGORIES[preset.category || 'custom'];
  const symbol = preset.symbol ? SYMBOLS[preset.symbol] : undefined;
  const color = preset.highlight?.color ? HIGHLIGHT_COLORS[preset.highlight.color] : undefined;
  const study = preset.studyId ? studies.find(s => s.id === preset.studyId) : null;

  return (
    <div className="p-4 rounded-xl border bg-scripture-surface border-scripture-border/50 hover:border-scripture-border shadow-sm transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="font-medium text-scripture-text">{preset.word}</span>
            {symbol && (
              <span className="text-lg" style={{ color }}>
                {symbol}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 bg-scripture-surface rounded">
              {categoryInfo.label}
            </span>
            {preset.bookScope && (() => {
              const bookInfo = getBookById(preset.bookScope);
              const bookName = bookInfo?.name || preset.bookScope;
              return (
                <span className="text-xs px-2 py-0.5 bg-scripture-infoBg text-scripture-infoText rounded">
                  📖 {bookName}{preset.chapterScope ? ` ${preset.chapterScope}` : ''}
                </span>
              );
            })()}
            {!preset.bookScope && (
              <span className="text-xs px-2 py-0.5 bg-scripture-elevated text-scripture-muted rounded">
                🌐 Global
              </span>
            )}
            {study && (
              <span className="text-xs px-2 py-0.5 bg-scripture-elevated text-scripture-text rounded border border-scripture-border/50" title={`Study: ${study.name}`}>
                📚 {study.name}
              </span>
            )}
            {preset.usageCount > 0 && (
              <span className="text-xs text-scripture-muted">
                Used {preset.usageCount} time{preset.usageCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {(preset.variants?.length ?? 0) > 0 && (
            <p className="text-xs text-scripture-muted mb-1">
              Variants: {preset.variants!.map(v => {
                const text = typeof v === 'string' ? v : v.text;
                let scope = '';
                if (typeof v === 'object' && v.bookScope) {
                  const bookInfo = getBookById(v.bookScope);
                  const bookName = bookInfo?.name || v.bookScope;
                  scope = ` (${bookName}${v.chapterScope ? ` ${v.chapterScope}` : ''})`;
                }
                return text + scope;
              }).join(', ')}
            </p>
          )}
          {preset.description && (
            <p className="text-sm text-scripture-text mt-2">{preset.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Edit
          </Button>
          <Button variant="destructive" size="sm" onClick={onDelete} disabled={isDeleting}>
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Key Word Editor Component */
function KeyWordEditor({
  preset,
  initialWord,
  initialSymbol,
  initialColor,
  currentBook,
  currentChapter,
  onSave,
  onCancel,
}: {
  preset?: MarkingPreset;
  initialWord?: string;
  initialSymbol?: SymbolKey;
  initialColor?: HighlightColor;
  currentBook?: string;
  currentChapter?: number;
  onSave: (data: {
    word: string;
    variants: Variant[];
    symbol?: SymbolKey;
    color?: HighlightColor;
    category: KeyWordCategory;
    description: string;
    autoSuggest: boolean;
    bookScope?: string;
    chapterScope?: number;
    studyId?: string;
  }) => void;
  onCancel: () => void;
}) {
  const [word, setWord] = useState(initialWord || preset?.word || '');
  const [variants, setVariants] = useState<Variant[]>(() => {
    // Convert preset variants to Variant[] format, handling backwards compatibility
    if (!preset?.variants) return [];
    return preset.variants.map(v => typeof v === 'string' ? { text: v } : v);
  });
  const [symbol, setSymbol] = useState<SymbolKey | undefined>(initialSymbol ?? preset?.symbol);
  const [color, setColor] = useState<HighlightColor | undefined>(initialColor ?? preset?.highlight?.color);

  // Update word when initialWord changes (e.g., new selection made)
  useEffect(() => {
    if (initialWord && !preset) {
      queueMicrotask(() => setWord(initialWord));
    }
  }, [initialWord, preset]);

  // Update symbol and color when initial values change
  useEffect(() => {
    if (initialSymbol !== undefined && !preset) {
      queueMicrotask(() => setSymbol(initialSymbol));
    }
  }, [initialSymbol, preset]);

  useEffect(() => {
    if (initialColor !== undefined && !preset) {
      queueMicrotask(() => setColor(initialColor));
    }
  }, [initialColor, preset]);
  const { studies, activeStudyId, getActiveStudy } = useStudyStore();
  const activeStudy = getActiveStudy();
  
  const [category, setCategory] = useState<KeyWordCategory>(preset?.category || 'custom');
  const [description, setDescription] = useState(preset?.description || '');
  const [autoSuggest, setAutoSuggest] = useState(preset?.autoSuggest ?? true);
  
  // Default to active study if creating new keyword (not editing)
  const [studyId, setStudyId] = useState<string | undefined>(
    preset?.studyId || (preset ? undefined : activeStudyId || undefined)
  );
  
  // If creating new keyword and active study has a book scope, default to that book
  const defaultBookScope = preset?.bookScope || 
    (!preset && activeStudy?.book ? activeStudy.book : currentBook || '');
  const defaultScopeType: 'global' | 'book' | 'chapter' = 
    preset?.chapterScope !== undefined ? 'chapter' :
    preset?.bookScope ? 'book' :
    (!preset && activeStudy?.book ? 'book' : 'global');
  
  const [scopeType, setScopeType] = useState<'global' | 'book' | 'chapter'>(defaultScopeType);
  const [bookScope, setBookScope] = useState(defaultBookScope);
  const [chapterScope, setChapterScope] = useState(preset?.chapterScope || currentChapter || 1);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!word.trim()) {
      alert('Please enter a word or phrase');
      return;
    }

    // Filter out empty variants
    const validVariants = variants.filter(v => v.text.trim().length > 0);

    onSave({
      word: word.trim(),
      variants: validVariants,
      symbol,
      color,
      category,
      description: description.trim(),
      autoSuggest,
      bookScope: scopeType === 'book' || scopeType === 'chapter' ? bookScope : undefined,
      chapterScope: scopeType === 'chapter' ? chapterScope : undefined,
      studyId: studyId || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
      {/* Scrollable fields */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 custom-scrollbar pb-2">
        <Input
          type="text"
          label="Word or Phrase"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          required
        />

        <div>
          <Label>Variants</Label>
          <div className="space-y-2">
            {variants.map((variant, index) => (
              <VariantEditor
                key={index}
                variant={variant}
                currentBook={currentBook}
                currentChapter={currentChapter}
                onChange={(updated) => {
                  const newVariants = [...variants];
                  newVariants[index] = updated;
                  setVariants(newVariants);
                }}
                onRemove={() => {
                  setVariants(variants.filter((_, i) => i !== index));
                }}
              />
            ))}
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setVariants([...variants, { text: '' }])}
            >
              + Add Variant
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <DropdownSelect
            label="Symbol"
            value={symbol || ''}
            onChange={(val) => {
              const newSymbol = (val as SymbolKey) || undefined;
              setSymbol(newSymbol);
              if (newSymbol) {
                setCategory(getCategoryForSymbol(newSymbol));
                setColor(getRandomHighlightColor());
              }
            }}
            options={[
              { value: '', label: 'None' },
              ...Object.entries(SYMBOLS).map(([key, sym]) => ({
                value: key,
                label: `${sym} ${key}`
              }))
            ]}
            placeholder="Select a symbol..."
          />

          <div>
            <Label>Color</Label>
            <ColorSelect
              value={color}
              onChange={setColor}
            />
          </div>
        </div>

        <DropdownSelect
          label="Category"
          value={category}
          onChange={(val) => setCategory(val as KeyWordCategory)}
          options={Object.entries(KEY_WORD_CATEGORIES).map(([key, info]) => ({
            value: key,
            label: `${info.icon} ${info.label}`
          }))}
          placeholder="Select a category..."
        />

        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />

        <Checkbox
          id="autoSuggest"
          label="Auto-suggest when selecting matching text"
          checked={autoSuggest}
          onChange={(e) => setAutoSuggest(e.target.checked)}
        />

        <div className="border-t border-scripture-border/30 mt-4 pt-4">
          <label className="block text-sm font-ui text-scripture-text mb-2">
            Scope
          </label>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="scope-global"
                name="scope"
                value="global"
                checked={scopeType === 'global'}
                onChange={(e) => setScopeType(e.target.value as 'global')}
                className="w-4 h-4"
              />
              <label htmlFor="scope-global" className="text-sm text-scripture-text">
                Global (applies to all books and chapters)
              </label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="scope-book"
                name="scope"
                value="book"
                checked={scopeType === 'book'}
                onChange={(e) => setScopeType(e.target.value as 'book')}
                className="w-4 h-4"
              />
              <label htmlFor="scope-book" className="text-sm text-scripture-text">
                Book (applies to all chapters in a specific book)
              </label>
            </div>
            {scopeType === 'book' && (
              <div className="ml-6">
                <DropdownSelect
                  label="Book"
                  value={bookScope}
                  onChange={(val) => setBookScope(val)}
                  options={[
                    { value: '', label: 'Select a book...' },
                    ...BIBLE_BOOKS.map(book => ({
                      value: book.id,
                      label: book.name
                    }))
                  ]}
                  placeholder="Select a book..."
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <input
                type="radio"
                id="scope-chapter"
                name="scope"
                value="chapter"
                checked={scopeType === 'chapter'}
                onChange={(e) => setScopeType(e.target.value as 'chapter')}
                className="w-4 h-4"
              />
              <label htmlFor="scope-chapter" className="text-sm text-scripture-text">
                Chapter (applies to a specific chapter in a book)
              </label>
            </div>
            {scopeType === 'chapter' && (
              <div className="ml-6 grid grid-cols-2 gap-3">
                <DropdownSelect
                  label="Book"
                  value={bookScope}
                  onChange={(val) => {
                    setBookScope(val);
                    // Reset chapter when book changes
                    if (val) {
                      const bookInfo = getBookById(val);
                      if (bookInfo && chapterScope > bookInfo.chapters) {
                        setChapterScope(1);
                      }
                    }
                  }}
                  options={[
                    { value: '', label: 'Select a book...' },
                    ...BIBLE_BOOKS.map(book => ({
                      value: book.id,
                      label: book.name
                    }))
                  ]}
                  placeholder="Select a book..."
                />
                <Input
                  type="number"
                  label="Chapter"
                  value={chapterScope}
                  onChange={(e) => {
                    const newChapter = parseInt(e.target.value) || 1;
                    if (bookScope) {
                      const bookInfo = getBookById(bookScope);
                      if (bookInfo) {
                        const maxChapter = bookInfo.chapters;
                        setChapterScope(Math.min(Math.max(1, newChapter), maxChapter));
                      } else {
                        setChapterScope(newChapter);
                      }
                    } else {
                      setChapterScope(newChapter);
                    }
                  }}
                  min="1"
                  max={bookScope ? getBookById(bookScope)?.chapters : undefined}
                />
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-scripture-border/30 mt-4 pt-4">
          <DropdownSelect
            label="Study (Optional)"
            value={studyId || ''}
            onChange={(val) => setStudyId(val || undefined)}
            helpText="Assign this keyword to a specific study. Global keywords are visible in all studies."
            options={[
              { value: '', label: 'Global (visible in all studies)' },
              ...studies.map(study => ({
                value: study.id,
                label: `${study.name}${study.book ? ` (${study.book})` : ''}`
              }))
            ]}
            placeholder="Select a study..."
          />
        </div>
        
        {/* Extra padding at bottom to ensure last field is scrollable above save button */}
        <div className="h-4"></div>
      </div>

      {/* Sticky Save/Cancel bar — always visible at bottom */}
      <div className="flex-shrink-0 p-4 border-t border-scripture-border/50 flex gap-2 bg-scripture-surface z-10">
        <Button variant="primary" type="submit" className="flex-1">
          Save
        </Button>
        <Button variant="secondary" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Variant Editor Component - Edit individual variant with optional scope */
function VariantEditor({
  variant,
  currentBook,
  currentChapter,
  onChange,
  onRemove,
}: {
  variant: Variant;
  currentBook?: string;
  currentChapter?: number;
  onChange: (variant: Variant) => void;
  onRemove: () => void;
}) {
  const [text, setText] = useState(variant.text);
  const [scopeType, setScopeType] = useState<'global' | 'book' | 'chapter'>(
    variant.chapterScope !== undefined ? 'chapter' :
    variant.bookScope ? 'book' : 'global'
  );
  const [bookScope, setBookScope] = useState(variant.bookScope || currentBook || '');
  const [chapterScope, setChapterScope] = useState(variant.chapterScope || currentChapter || 1);

  // Update parent when values change
  useEffect(() => {
    const updatedVariant: Variant = {
      text: text.trim(),
      bookScope: scopeType === 'book' || scopeType === 'chapter' ? bookScope : undefined,
      chapterScope: scopeType === 'chapter' ? chapterScope : undefined,
    };
    onChange(updatedVariant);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, scopeType, bookScope, chapterScope]);

  return (
    <div className="p-3 bg-scripture-elevated border border-scripture-border/30 rounded-lg space-y-2">
      <div className="flex items-center gap-2">
        <Input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Variant text"
          className="flex-1"
        />
        <button
          type="button"
          onClick={onRemove}
          className="px-2 py-1.5 text-sm text-scripture-error hover:bg-scripture-errorBg rounded transition-colors"
        >
          ✕
        </button>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            id={`variant-global-${variant.text}`}
            name={`variant-scope-${variant.text}`}
            value="global"
            checked={scopeType === 'global'}
            onChange={() => setScopeType('global')}
            className="w-3 h-3"
          />
          <label htmlFor={`variant-global-${variant.text}`} className="text-scripture-text">
            Global
          </label>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            id={`variant-book-${variant.text}`}
            name={`variant-scope-${variant.text}`}
            value="book"
            checked={scopeType === 'book'}
            onChange={() => setScopeType('book')}
            className="w-3 h-3"
          />
          <label htmlFor={`variant-book-${variant.text}`} className="text-scripture-text">
            Book
          </label>
        </div>
        {scopeType === 'book' && (
          <div className="ml-5">
            <DropdownSelect
              label="Book"
              value={bookScope}
              onChange={(val) => setBookScope(val)}
              options={[
                { value: '', label: 'Select a book...' },
                ...BIBLE_BOOKS.map(book => ({
                  value: book.id,
                  label: book.name
                }))
              ]}
              placeholder="Select a book..."
            />
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <input
            type="radio"
            id={`variant-chapter-${variant.text}`}
            name={`variant-scope-${variant.text}`}
            value="chapter"
            checked={scopeType === 'chapter'}
            onChange={() => setScopeType('chapter')}
            className="w-3 h-3"
          />
          <label htmlFor={`variant-chapter-${variant.text}`} className="text-scripture-text">
            Chapter
          </label>
        </div>
        {scopeType === 'chapter' && (
          <div className="ml-5 grid grid-cols-2 gap-2">
            <DropdownSelect
              label="Book"
              value={bookScope}
              onChange={(val) => {
                setBookScope(val);
                // Reset chapter when book changes
                if (val) {
                  const bookInfo = getBookById(val);
                  if (bookInfo && chapterScope > bookInfo.chapters) {
                    setChapterScope(1);
                  }
                }
              }}
              options={[
                { value: '', label: 'Select a book...' },
                ...BIBLE_BOOKS.map(book => ({
                  value: book.id,
                  label: book.name
                }))
              ]}
              placeholder="Select a book..."
            />
            <Input
              type="number"
              label="Chapter"
              value={chapterScope}
              onChange={(e) => {
                const newChapter = parseInt(e.target.value) || 1;
                if (bookScope) {
                  const bookInfo = getBookById(bookScope);
                  if (bookInfo) {
                    const maxChapter = bookInfo.chapters;
                    setChapterScope(Math.min(Math.max(1, newChapter), maxChapter));
                  } else {
                    setChapterScope(newChapter);
                  }
                } else {
                  setChapterScope(newChapter);
                }
              }}
              min="1"
              max={bookScope ? getBookById(bookScope)?.chapters : undefined}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** Color Select Component - Custom dropdown with color swatches */
function ColorSelect({
  value,
  onChange,
}: {
  value: HighlightColor | undefined;
  onChange: (color: HighlightColor | undefined) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [openAbove, setOpenAbove] = useState(false); // Default to opening below
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const allColors = Object.entries(HIGHLIGHT_COLORS) as [HighlightColor, string][];

  // Determine if dropdown should open above or below based on available space
  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      
      // Find the scrollable container (closest ancestor with overflow-y-auto)
      let container: HTMLElement | null = buttonRef.current.parentElement;
      let scrollableContainer: HTMLElement | null = null;
      
      while (container && container !== document.body) {
        const style = window.getComputedStyle(container);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          scrollableContainer = container;
          break;
        }
        container = container.parentElement;
      }
      
      if (scrollableContainer) {
        const containerRect = scrollableContainer.getBoundingClientRect();
        const spaceAbove = rect.top - containerRect.top;
        const spaceBelow = containerRect.bottom - rect.bottom;
        // Estimate dropdown height (max-h-60 = ~240px)
        const estimatedDropdownHeight = 240;
        // Only open above if there's clearly enough space (with buffer)
        // Be conservative - prefer opening below to avoid overflow
        setOpenAbove(spaceAbove >= estimatedDropdownHeight + 50 && spaceAbove > spaceBelow + 150);
      } else {
        // No scrollable container found - check window bounds
        const spaceAbove = rect.top;
        const spaceBelow = window.innerHeight - rect.bottom;
        const estimatedDropdownHeight = 240;
        // Be conservative - prefer opening below
        setOpenAbove(spaceAbove >= estimatedDropdownHeight + 50 && spaceAbove > spaceBelow + 150);
      }
    }
    setIsOpen(!isOpen);
  };

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        dropdownRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text
                 flex items-center gap-2 justify-between hover:bg-scripture-elevated transition-colors"
      >
        <div className="flex items-center gap-2">
          {value ? (
            <>
              <span
                className="w-4 h-4 rounded border border-scripture-border/30"
                style={{ backgroundColor: HIGHLIGHT_COLORS[value] }}
              />
              <span>{value}</span>
            </>
          ) : (
            <span className="text-scripture-muted">Default</span>
          )}
        </div>
        <span className="text-scripture-muted">{isOpen ? '▲' : '▼'}</span>
      </button>
      
      {isOpen && (
        <div
          ref={dropdownRef}
          className={`absolute z-50 w-full bg-scripture-elevated border border-scripture-border/50 
                      rounded-lg shadow-lg max-h-60 overflow-y-auto custom-scrollbar
                      ${openAbove ? 'bottom-full mb-1' : 'top-full mt-1'}`}
        >
          <button
            type="button"
            onClick={() => {
              onChange(undefined);
              setIsOpen(false);
            }}
            className={`w-full px-3 py-2 text-sm text-left hover:bg-scripture-border/30 transition-colors
                       ${!value ? 'bg-scripture-border/20' : ''}`}
          >
            Default
          </button>
          {allColors.map(([key, hex]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                onChange(key);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-2 text-sm text-left hover:bg-scripture-border/30 transition-colors
                         flex items-center gap-2 ${value === key ? 'bg-scripture-border/20' : ''}`}
            >
              <span
                className="w-4 h-4 rounded border border-scripture-border/30 flex-shrink-0"
                style={{ backgroundColor: hex }}
              />
              <span>{key}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
