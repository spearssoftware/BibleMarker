/**
 * Key Word Manager Component
 * 
 * UI for creating, editing, and managing key word definitions.
 */

import { useState, useEffect } from 'react';
import { useKeyWordStore } from '@/stores/keyWordStore';
import { createKeyWord, KEY_WORD_CATEGORIES, type KeyWordCategory } from '@/types/keyWord';
import { SYMBOLS, HIGHLIGHT_COLORS, type SymbolKey, type HighlightColor } from '@/types/annotation';

interface KeyWordManagerProps {
  onClose?: () => void;
}

export function KeyWordManager({ onClose }: KeyWordManagerProps) {
  const {
    keyWords,
    selectedKeyWord,
    filterCategory,
    searchQuery,
    isLoading,
    loadKeyWords,
    addKeyWord,
    updateKeyWord,
    removeKeyWord,
    selectKeyWord,
    setFilterCategory,
    setSearchQuery,
    getFilteredKeyWords,
  } = useKeyWordStore();

  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    loadKeyWords();
  }, [loadKeyWords]);

  const filteredKeyWords = getFilteredKeyWords();

  function handleCreate() {
    setIsCreating(true);
    setEditingId(null);
    selectKeyWord(null);
  }

  function handleEdit(keyWord: typeof keyWords[0]) {
    setEditingId(keyWord.id);
    setIsCreating(false);
    selectKeyWord(keyWord);
  }

  function handleCancel() {
    setIsCreating(false);
    setEditingId(null);
    selectKeyWord(null);
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
      if (editingId) {
        const existing = keyWords.find(kw => kw.id === editingId);
        if (existing) {
          await updateKeyWord({
            ...existing,
            ...formData,
            updatedAt: new Date(),
          });
        }
      } else {
        const newKeyWord = createKeyWord(formData.word, formData);
        await addKeyWord(newKeyWord);
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
      await removeKeyWord(id);
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

      {/* Filters */}
      <div className="p-4 border-b border-scripture-border/50 space-y-3">
        {/* Search */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search key words..."
          className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                   rounded-lg focus:outline-none focus:border-scripture-accent
                   text-scripture-text placeholder-scripture-muted"
        />

        {/* Category filter */}
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {isLoading ? (
          <div className="text-center py-8 text-scripture-muted text-sm">
            Loading key words...
          </div>
        ) : isCreating || editingId ? (
          <KeyWordEditor
            keyWord={editingId ? keyWords.find(kw => kw.id === editingId) : undefined}
            onSave={handleSave}
            onCancel={handleCancel}
          />
        ) : filteredKeyWords.length === 0 ? (
          <div className="text-center py-8 text-scripture-muted text-sm">
            {searchQuery || filterCategory !== 'all'
              ? 'No key words match your filters'
              : 'No key words yet. Create one to get started!'}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredKeyWords.map((keyWord) => (
              <KeyWordCard
                key={keyWord.id}
                keyWord={keyWord}
                onEdit={() => handleEdit(keyWord)}
                onDelete={() => handleDelete(keyWord.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Key Word Card Component */
function KeyWordCard({
  keyWord,
  onEdit,
  onDelete,
}: {
  keyWord: ReturnType<typeof useKeyWordStore.getState>['keyWords'][0];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const categoryInfo = KEY_WORD_CATEGORIES[keyWord.category || 'custom'];
  const symbol = keyWord.symbol ? SYMBOLS[keyWord.symbol] : undefined;
  const color = keyWord.color ? HIGHLIGHT_COLORS[keyWord.color] : undefined;

  return (
    <div className="p-4 rounded-lg border bg-scripture-elevated border-scripture-border/30 hover:border-scripture-border/50 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-scripture-text">{keyWord.word}</span>
            {symbol && (
              <span
                className="text-lg"
                style={{ color: color }}
              >
                {symbol}
              </span>
            )}
            <span className="text-xs px-2 py-0.5 bg-scripture-surface rounded">
              {categoryInfo.label}
            </span>
            {keyWord.usageCount > 0 && (
              <span className="text-xs text-scripture-muted">
                Used {keyWord.usageCount} time{keyWord.usageCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          
          {keyWord.variants.length > 0 && (
            <p className="text-xs text-scripture-muted mb-1">
              Variants: {keyWord.variants.join(', ')}
            </p>
          )}
          
          {keyWord.description && (
            <p className="text-sm text-scripture-text mt-2">{keyWord.description}</p>
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
  keyWord,
  onSave,
  onCancel,
}: {
  keyWord?: ReturnType<typeof useKeyWordStore.getState>['keyWords'][0];
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
  const [word, setWord] = useState(keyWord?.word || '');
  const [variants, setVariants] = useState(keyWord?.variants.join(', ') || '');
  const [symbol, setSymbol] = useState<SymbolKey | undefined>(keyWord?.symbol);
  const [color, setColor] = useState<HighlightColor | undefined>(keyWord?.color);
  const [category, setCategory] = useState<KeyWordCategory>(keyWord?.category || 'custom');
  const [description, setDescription] = useState(keyWord?.description || '');
  const [autoSuggest, setAutoSuggest] = useState(keyWord?.autoSuggest ?? true);

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
    <form onSubmit={handleSubmit} className="space-y-4">
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
            onChange={(e) => setSymbol(e.target.value as SymbolKey || undefined)}
            className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 
                     rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
          >
            <option value="">None</option>
            {Object.entries(SYMBOLS).map(([key, symbol]) => (
              <option key={key} value={key}>
                {symbol} {key}
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
          rows={3}
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

      <div className="flex items-center gap-2 pt-2">
        <button
          type="submit"
          className="flex-1 px-4 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                   hover:bg-scripture-accent/90 transition-colors"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 text-sm font-ui bg-scripture-elevated text-scripture-text rounded-lg
                   hover:bg-scripture-border/50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
