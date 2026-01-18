/**
 * Key Word Manager Component
 * 
 * UI for creating, editing, and managing key word definitions.
 */

import { useState, useEffect } from 'react';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { createMarkingPreset, KEY_WORD_CATEGORIES, getCategoryForSymbol, type KeyWordCategory, type MarkingPreset } from '@/types/keyWord';
import { SYMBOLS, HIGHLIGHT_COLORS, getRandomHighlightColor, type SymbolKey, type HighlightColor } from '@/types/annotation';

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

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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

  const filteredPresets = getFilteredPresets();

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
    variants: string[];
    symbol?: SymbolKey;
    color?: HighlightColor;
    category: KeyWordCategory;
    description: string;
    autoSuggest: boolean;
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

  async function handleDelete(id: string) {
    if (!confirm('Are you sure you want to delete this key word?')) {
      return;
    }
    try {
      await removePreset(id);
    } catch (error) {
      console.error('Failed to delete key word:', error);
      alert('Failed to delete key word. Please try again.');
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-scripture-border/50">
        <h2 className="text-lg font-ui font-semibold text-scripture-text">
          Key Words
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleCreate}
            className="px-3 py-1.5 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                     hover:bg-scripture-accent/90 transition-colors"
          >
            + New
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Filters: only when viewing the list (hidden when adding/editing) */}
      {!(isCreating || editingId) && (
        <div className="p-4 border-b border-scripture-border/50 space-y-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search key words..."
            className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                     rounded-lg focus:outline-none focus:border-scripture-accent
                     text-scripture-text placeholder-scripture-muted"
          />
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1 text-xs font-ui rounded-lg transition-colors
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
                className={`px-3 py-1 text-xs font-ui rounded-lg transition-colors flex items-center gap-1.5
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
            onSave={handleSave}
            onCancel={handleCancel}
          />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
            {filteredPresets.length === 0 ? (
              <div className="text-center py-8 text-scripture-muted text-sm">
                {searchQuery || filterCategory !== 'all'
                  ? 'No key words match your filters'
                  : 'No key words yet. Create one to get started!'}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPresets.filter((p) => p.word).map((preset) => (
                  <KeyWordCard
                    key={preset.id}
                    preset={preset}
                    onEdit={() => handleEdit(preset)}
                    onDelete={() => handleDelete(preset.id)}
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
}: {
  preset: MarkingPreset;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const categoryInfo = KEY_WORD_CATEGORIES[preset.category || 'custom'];
  const symbol = preset.symbol ? SYMBOLS[preset.symbol] : undefined;
  const color = preset.highlight?.color ? HIGHLIGHT_COLORS[preset.highlight.color] : undefined;

  return (
    <div className="p-4 rounded-lg border bg-scripture-elevated border-scripture-border/30 hover:border-scripture-border/50 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-scripture-text">{preset.word}</span>
            {symbol && (
              <span className="text-lg" style={{ color }}>
                {symbol}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 bg-scripture-surface rounded">
              {categoryInfo.label}
            </span>
            {preset.usageCount > 0 && (
              <span className="text-xs text-scripture-muted">
                Used {preset.usageCount} time{preset.usageCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          {(preset.variants?.length ?? 0) > 0 && (
            <p className="text-xs text-scripture-muted mb-1">
              Variants: {preset.variants!.join(', ')}
            </p>
          )}
          {preset.description && (
            <p className="text-sm text-scripture-text mt-2">{preset.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onEdit}
            className="px-2 py-1 text-xs font-ui text-scripture-text hover:bg-scripture-border/50 rounded transition-colors"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            className="px-2 py-1 text-xs font-ui text-red-400 hover:bg-red-500/20 rounded transition-colors"
          >
            Delete
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
  onSave,
  onCancel,
}: {
  preset?: MarkingPreset;
  initialWord?: string;
  initialSymbol?: SymbolKey;
  initialColor?: HighlightColor;
  onSave: (data: {
    word: string;
    variants: string[];
    symbol?: SymbolKey;
    color?: HighlightColor;
    category: KeyWordCategory;
    description: string;
    autoSuggest: boolean;
  }) => void;
  onCancel: () => void;
}) {
  const [word, setWord] = useState(initialWord || preset?.word || '');
  const [variants, setVariants] = useState((preset?.variants || []).join(', '));
  const [symbol, setSymbol] = useState<SymbolKey | undefined>(initialSymbol ?? preset?.symbol);
  const [color, setColor] = useState<HighlightColor | undefined>(initialColor ?? preset?.highlight?.color);
  const [category, setCategory] = useState<KeyWordCategory>(preset?.category || 'custom');
  const [description, setDescription] = useState(preset?.description || '');
  const [autoSuggest, setAutoSuggest] = useState(preset?.autoSuggest ?? true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!word.trim()) {
      alert('Please enter a word or phrase');
      return;
    }

    onSave({
      word: word.trim(),
      variants: variants.split(',').map(v => v.trim()).filter(Boolean),
      symbol,
      color,
      category,
      description: description.trim(),
      autoSuggest,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
      {/* Scrollable fields */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4 custom-scrollbar">
        <div>
          <label className="block text-sm font-ui text-scripture-text mb-1">
            Word or Phrase *
          </label>
          <input
            type="text"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            required
            className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                     rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
          />
        </div>

        <div>
          <label className="block text-sm font-ui text-scripture-text mb-1">
            Variants (comma-separated)
          </label>
          <input
            type="text"
            value={variants}
            onChange={(e) => setVariants(e.target.value)}
            placeholder="e.g., God's, Lord, Yahweh"
            className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                     rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-ui text-scripture-text mb-1">
              Symbol
            </label>
            <select
              value={symbol || ''}
              onChange={(e) => {
                const newSymbol = (e.target.value as SymbolKey) || undefined;
                setSymbol(newSymbol);
                if (newSymbol) {
                  setCategory(getCategoryForSymbol(newSymbol));
                  setColor(getRandomHighlightColor());
                }
              }}
              className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                       rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
            >
              <option value="">None</option>
              {Object.entries(SYMBOLS).map(([key, sym]) => (
                <option key={key} value={key}>
                  {sym} {key}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-ui text-scripture-text mb-1">
              Color
            </label>
            <select
              value={color || ''}
              onChange={(e) => setColor(e.target.value as HighlightColor || undefined)}
              className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                       rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
            >
              <option value="">Default</option>
              {Object.entries(HIGHLIGHT_COLORS).map(([key, hex]) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-ui text-scripture-text mb-1">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as KeyWordCategory)}
            className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                     rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
          >
            {Object.entries(KEY_WORD_CATEGORIES).map(([key, info]) => (
              <option key={key} value={key}>
                {info.icon} {info.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-ui text-scripture-text mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                     rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
          />
        </div>

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
      </div>

      {/* Sticky Save/Cancel bar — always visible at bottom */}
      <div className="flex-shrink-0 p-4 border-t border-scripture-border/50 flex gap-2 bg-scripture-surface">
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
