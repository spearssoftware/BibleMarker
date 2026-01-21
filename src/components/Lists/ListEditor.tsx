/**
 * Observation List Editor Component
 * 
 * Create or edit an observation list.
 */

import { useState, useEffect } from 'react';
import { useListStore } from '@/stores/listStore';
import { useMarkingPresetStore } from '@/stores/markingPresetStore';
import { useStudyStore } from '@/stores/studyStore';
import { useBibleStore } from '@/stores/bibleStore';
import type { ObservationList } from '@/types/list';
import { BIBLE_BOOKS, getBookById } from '@/types/bible';
import { Modal } from '@/components/shared';

interface ListEditorProps {
  list?: ObservationList;
  onClose: () => void;
  onSave: () => void;
  inline?: boolean; // If true, render inline instead of as modal overlay
}

export function ListEditor({ list, onClose, onSave, inline = false }: ListEditorProps) {
  const { createList, updateList, autoPopulateFromKeyword } = useListStore();
  const { presets } = useMarkingPresetStore();
  const { studies } = useStudyStore();
  const { currentBook, currentChapter } = useBibleStore();
  
  const [title, setTitle] = useState(list?.title || '');
  const [selectedKeywordId, setSelectedKeywordId] = useState<string>(list?.keyWordId || '');
  const [selectedStudyId, setSelectedStudyId] = useState<string>(list?.studyId || '');
  const [scopeBook, setScopeBook] = useState<string>(list?.scope?.book || '');
  const [scopeChapters, setScopeChapters] = useState<string>(list?.scope?.chapters?.join(', ') || '');
  const [autoPopulate, setAutoPopulate] = useState(false);

  useEffect(() => {
    // If creating new list and we're in a book, suggest that book as scope
    if (!list && currentBook) {
      setScopeBook(currentBook);
    }
  }, [list, currentBook]);

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a title for the list');
      return;
    }

    if (!selectedKeywordId) {
      alert('Please select a keyword. Observation lists are about specific keywords.');
      return;
    }

    const scope = scopeBook ? {
      book: scopeBook,
      chapters: scopeChapters.trim() 
        ? scopeChapters.split(',').map(c => parseInt(c.trim(), 10)).filter(n => !isNaN(n))
        : undefined,
    } : undefined;

    let finalList: ObservationList;
    
    if (list) {
      // Update existing list
      const updated = {
        ...list,
        title: title.trim(),
        scope,
        keyWordId: selectedKeywordId,
        studyId: selectedStudyId || undefined,
      };
      await updateList(updated);
      finalList = updated;
    } else {
      // Create new list (keyWordId is now required)
      finalList = await createList(
        title.trim(),
        selectedKeywordId,
        scope,
        selectedStudyId || undefined
      );
    }

    // If auto-populate is enabled, populate from annotations
    if (autoPopulate) {
      const count = await autoPopulateFromKeyword(finalList.id, selectedKeywordId);
      if (count > 0) {
        alert(`Added ${count} observation${count === 1 ? '' : 's'} from marked instances.`);
      }
    }

    onSave();
  };

  // Get keyword presets (only those with words)
  const keywordPresets = presets.filter(p => p.word);

  const formContent = (
    <>
      {inline && (
        <div className="flex-shrink-0 mb-4">
          <h2 className="text-lg font-ui font-semibold text-scripture-text">
            {list ? 'Edit List' : 'Create Observation List'}
          </h2>
        </div>
      )}

      <div className={`${inline ? 'flex-1 min-h-0 overflow-y-auto p-4 space-y-4 custom-scrollbar pb-2' : 'space-y-4'}`}>
        <div className="space-y-4">
              {/* Title */}
              <div>
                <label htmlFor="list-title-input" className="block text-sm font-medium text-scripture-text mb-2">
                  List Title
                </label>
                <input
                  id="list-title-input"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., 'What I learn about God in John 1'"
                  className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted"
                  autoFocus
                  aria-required="false"
                />
              </div>

              {/* Keyword (required) - List is about this keyword */}
              <div>
                <label htmlFor="list-keyword-select" className="block text-sm font-medium text-scripture-text mb-2">
                  Keyword <span className="text-highlight-red" aria-label="required">*</span>
                  <span className="text-xs text-scripture-muted ml-2">(This list is about observations of this keyword)</span>
                </label>
                <select
                  id="list-keyword-select"
                  value={selectedKeywordId}
                  onChange={(e) => setSelectedKeywordId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                  required
                  aria-required="true"
                >
                  <option value="">Select a keyword...</option>
                  {keywordPresets.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {preset.word} {preset.symbol && `(${preset.symbol})`}
                    </option>
                  ))}
                </select>
                {keywordPresets.length === 0 && (
                  <p className="mt-2 text-xs text-scripture-muted">
                    No keywords yet. Create a keyword first from the toolbar.
                  </p>
                )}
                {selectedKeywordId && !list && (
                  <div className="mt-2">
                    <label className="flex items-center gap-2 text-sm text-scripture-text">
                      <input
                        type="checkbox"
                        checked={autoPopulate}
                        onChange={(e) => setAutoPopulate(e.target.checked)}
                        className="rounded"
                      />
                      <span>Auto-populate from marked instances</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Link to Study (optional) */}
              <div>
                <label className="block text-sm font-medium text-scripture-text mb-2">
                  Link to Study (optional)
                </label>
                <select
                  value={selectedStudyId}
                  onChange={(e) => setSelectedStudyId(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                >
                  <option value="">No study</option>
                  {studies.map(study => (
                    <option key={study.id} value={study.id}>
                      {study.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scope */}
              <div>
                <label className="block text-sm font-medium text-scripture-text mb-2">
                  Scope (optional)
                </label>
                <div className="space-y-2">
                  <select
                    value={scopeBook}
                    onChange={(e) => setScopeBook(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                  >
                    <option value="">All books</option>
                    {BIBLE_BOOKS.map(book => (
                      <option key={book.id} value={book.id}>{book.name}</option>
                    ))}
                  </select>
                  {scopeBook && (
                    <input
                      type="text"
                      value={scopeChapters}
                      onChange={(e) => setScopeChapters(e.target.value)}
                      placeholder="Chapters (e.g., '1, 2, 3' or leave empty for all)"
                      className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted"
                    />
                  )}
                </div>
              </div>
        </div>
        
        {/* Extra padding at bottom to ensure last field is scrollable above save button */}
        {inline && <div className="h-4"></div>}
      </div>

      {/* Sticky Save/Cancel bar */}
      {inline ? (
        <div className="flex-shrink-0 p-4 border-t border-scripture-border/50 flex gap-2 bg-scripture-surface z-10">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !selectedKeywordId}
            className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {list ? 'Save' : 'Create'}
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !selectedKeywordId}
            className="px-4 py-2 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {list ? 'Save' : 'Create'}
          </button>
        </div>
      )}
    </>
  );

  if (inline) {
    return (
      <div className="flex flex-col flex-1 min-h-0">
        {formContent}
      </div>
    );
  }

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={list ? 'Edit List' : 'Create Observation List'}
      size="md"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || !selectedKeywordId}
            className="px-4 py-2 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {list ? 'Save' : 'Create'}
          </button>
        </div>
      }
    >
      {formContent}
    </Modal>
  );
}
