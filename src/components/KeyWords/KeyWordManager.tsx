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
import { Input, Textarea, Select, Label } from '@/components/shared';

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
  const { activeStudyId, studies } = useStudyStore();

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

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

  // Filter presets by active study
  const filteredPresets = useMemo(() => {
    const baseFiltered = getFilteredPresets();
    
    // If no study is active, show all keywords (global + study-scoped)
    if (!activeStudyId) {
      return baseFiltered;
    }
    
    // If a study is active, show:
    // - Global keywords (no studyId)
    // - Keywords belonging to the active study
    return baseFiltered.filter(preset => {
      // Global keywords (no studyId) are always visible
      if (!preset.studyId) return true;
      // Show keywords that belong to the active study
      return preset.studyId === activeStudyId;
    });
  }, [getFilteredPresets, activeStudyId, presets, filterCategory, searchQuery]);

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
      {/* Close button - always visible in top-right */}
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-10 text-scripture-muted hover:text-scripture-text transition-colors p-1.5 rounded-lg hover:bg-scripture-elevated"
          aria-label="Close key word manager"
        >
          ✕
        </button>
      )}

      {/* Filters: only when viewing the list (hidden when adding/editing) */}
      {!(isCreating || editingId) && (
        <div className="px-3 py-2 pr-10 border-b border-scripture-border/50 flex-shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleCreate}
              className="px-2.5 py-1 text-xs font-ui bg-scripture-accent text-scripture-bg rounded-lg
                       hover:bg-scripture-accent/90 transition-colors whitespace-nowrap"
            >
              + New
            </button>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search key words..."
              className="flex-1 min-w-0 px-2.5 py-1.5 text-sm bg-scripture-bg border border-scripture-border/50 
                       rounded-lg focus:outline-none focus:border-scripture-accent
                       text-scripture-text placeholder-scripture-muted transition-colors"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
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
        </div>
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
              <button
                type="button"
                onClick={cancelDelete}
                className="px-4 py-2 text-sm font-ui bg-scripture-elevated text-scripture-text rounded-lg hover:bg-scripture-border/50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="px-4 py-2 text-sm font-ui bg-scripture-error text-white rounded-lg hover:bg-scripture-error/90 transition-colors"
              >
                Delete
              </button>
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
                  <button
                    onClick={handleCreate}
                    className="px-4 py-2 bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
                  >
                    Create Your First Key Word
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPresets.filter((p) => p.word).map((preset) => (
                  <KeyWordCard
                    key={preset.id}
                    preset={preset}
                    onEdit={() => handleEdit(preset)}
                    onDelete={(e) => handleDeleteClick(preset.id, e)}
                    isDeleting={deletingId === preset.id}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
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
            {preset.bookScope && (
              <span className="text-xs px-2 py-0.5 bg-scripture-infoBg text-scripture-infoText rounded">
                📖 {preset.bookScope}{preset.chapterScope ? `:${preset.chapterScope}` : ''}
              </span>
            )}
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
                const scope = typeof v === 'object' && v.bookScope 
                  ? ` (${v.bookScope}${v.chapterScope ? `:${v.chapterScope}` : ''})`
                  : '';
                return text + scope;
              }).join(', ')}
            </p>
          )}
          {preset.description && (
            <p className="text-sm text-scripture-text mt-2">{preset.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="px-2 py-1 text-xs font-ui text-scripture-text hover:bg-scripture-border/50 rounded transition-colors"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={isDeleting}
            className="px-2 py-1 text-xs font-ui text-scripture-error hover:bg-scripture-errorBg rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
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
      setWord(initialWord);
    }
  }, [initialWord, preset]);

  // Update symbol and color when initial values change
  useEffect(() => {
    if (initialSymbol !== undefined && !preset) {
      setSymbol(initialSymbol);
    }
  }, [initialSymbol, preset]);

  useEffect(() => {
    if (initialColor !== undefined && !preset) {
      setColor(initialColor);
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
            <button
              type="button"
              onClick={() => setVariants([...variants, { text: '' }])}
              className="w-full px-3 py-2 text-sm bg-scripture-elevated border border-scripture-border/50 
                       rounded-lg hover:bg-scripture-border/50 transition-colors text-scripture-text"
            >
              + Add Variant
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Symbol"
            value={symbol || ''}
            onChange={(e) => {
              const newSymbol = (e.target.value as SymbolKey) || undefined;
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
          />

          <div>
            <Label>Color</Label>
            <ColorSelect
              value={color}
              onChange={setColor}
            />
          </div>
        </div>

        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value as KeyWordCategory)}
          options={Object.entries(KEY_WORD_CATEGORIES).map(([key, info]) => ({
            value: key,
            label: `${info.icon} ${info.label}`
          }))}
        />

        <Textarea
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
        />

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="autoSuggest"
            checked={autoSuggest}
            onChange={(e) => setAutoSuggest(e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="autoSuggest" className="text-sm text-scripture-text">
            Auto-suggest when selecting matching text
          </label>
        </div>

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
                <Input
                  type="text"
                  value={bookScope}
                  onChange={(e) => setBookScope(e.target.value)}
                  placeholder="e.g., John"
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
                <Input
                  type="text"
                  value={bookScope}
                  onChange={(e) => setBookScope(e.target.value)}
                  placeholder="Book (e.g., John)"
                />
                <Input
                  type="number"
                  value={chapterScope}
                  onChange={(e) => setChapterScope(parseInt(e.target.value) || 1)}
                  placeholder="Chapter"
                  min="1"
                />
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-scripture-border/30 mt-4 pt-4">
          <Select
            label="Study (Optional)"
            value={studyId || ''}
            onChange={(e) => setStudyId(e.target.value || undefined)}
            helpText="Assign this keyword to a specific study. Global keywords are visible in all studies."
            options={[
              { value: '', label: 'Global (visible in all studies)' },
              ...studies.map(study => ({
                value: study.id,
                label: `${study.name}${study.book ? ` (${study.book})` : ''}`
              }))
            ]}
          />
        </div>
        
        {/* Extra padding at bottom to ensure last field is scrollable above save button */}
        <div className="h-4"></div>
      </div>

      {/* Sticky Save/Cancel bar — always visible at bottom */}
      <div className="flex-shrink-0 p-4 border-t border-scripture-border/50 flex gap-2 bg-scripture-surface z-10">
        <button
          type="submit"
          className="flex-1 px-4 py-2.5 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                   hover:bg-scripture-accent/90 transition-colors"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2.5 text-sm font-ui bg-scripture-elevated text-scripture-text rounded-lg
                   hover:bg-scripture-border/50 transition-colors"
        >
          Cancel
        </button>
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
            <Input
              type="text"
              value={bookScope}
              onChange={(e) => setBookScope(e.target.value)}
              placeholder="Book name (e.g., John)"
              className="text-xs"
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
            <Input
              type="text"
              value={bookScope}
              onChange={(e) => setBookScope(e.target.value)}
              placeholder="Book"
              className="text-xs"
            />
            <Input
              type="number"
              value={chapterScope}
              onChange={(e) => setChapterScope(parseInt(e.target.value) || 1)}
              placeholder="Chapter"
              min="1"
              className="text-xs"
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
