/**
 * Study Manager Component
 * 
 * Create, edit, and delete studies.
 */

import { useState, useEffect } from 'react';
import { useStudyStore } from '@/stores/studyStore';
import { getBookById, BIBLE_BOOKS } from '@/types/bible';

interface StudyManagerProps {
  onClose?: () => void;
}

export function StudyManager({ onClose }: StudyManagerProps = {}) {
  const { studies, activeStudyId, loadStudies, createStudy, updateStudy, deleteStudy, setActiveStudy } = useStudyStore();
  const [isOpen, setIsOpen] = useState(true);
  const [editingStudy, setEditingStudy] = useState<{ id: string; name: string; book?: string } | null>(null);
  const [newStudyName, setNewStudyName] = useState('');
  const [newStudyBook, setNewStudyBook] = useState<string>('');

  useEffect(() => {
    loadStudies();
  }, [loadStudies]);

  const handleCreate = async () => {
    if (!newStudyName.trim()) return;
    
    await createStudy(newStudyName.trim(), newStudyBook || undefined);
    setNewStudyName('');
    setNewStudyBook('');
  };

  const handleUpdate = async () => {
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

  const handleDelete = async (studyId: string) => {
    if (!confirm('Are you sure you want to delete this study? This will not delete keywords, only the study grouping.')) {
      return;
    }
    
    await deleteStudy(studyId);
  };

  const handleClose = () => {
    setIsOpen(false);
    if (onClose) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 backdrop-overlay backdrop-blur-sm z-[200] overflow-y-auto" onClick={handleClose}>
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="bg-scripture-surface border border-scripture-border/50 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[calc(100vh-2rem)] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-scripture-border/50">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-ui font-semibold text-scripture-text">Study Manager</h2>
            <button
              onClick={handleClose}
              className="text-scripture-muted hover:text-scripture-text transition-colors p-1"
              aria-label="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          {/* Create new study */}
          <div className="mb-6 p-4 bg-scripture-surface/50 rounded-lg border border-scripture-muted/20">
            <h3 className="text-sm font-medium text-scripture-text mb-3">Create New Study</h3>
            <div className="space-y-3">
              <input
                type="text"
                value={newStudyName}
                onChange={(e) => setNewStudyName(e.target.value)}
                placeholder="Study name (e.g., 'John - Character Study')"
                className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleCreate();
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
                onClick={handleCreate}
                disabled={!newStudyName.trim()}
                className="w-full px-4 py-2 bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create Study
              </button>
            </div>
          </div>

          {/* Studies list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium text-scripture-text">Your Studies</h3>
              {activeStudyId && (
                <button
                  onClick={() => setActiveStudy(null)}
                  className="px-3 py-1.5 text-sm bg-scripture-elevated text-scripture-text border border-scripture-border/50 rounded hover:bg-scripture-border/50 transition-colors"
                >
                  Clear Active Study
                </button>
              )}
            </div>
            {studies.length === 0 ? (
              <p className="text-scripture-muted text-sm">No studies yet. Create one above to get started.</p>
            ) : (
              studies.map(study => (
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
                            handleUpdate();
                          } else if (e.key === 'Escape') {
                            setEditingStudy(null);
                          }
                        }}
                      />
                      <select
                        value={editingStudy.book || ''}
                        onChange={(e) => setEditingStudy({ ...editingStudy, book: e.target.value || undefined })}
                        className="w-full px-3 py-2 bg-scripture-background border border-scripture-muted/30 rounded text-scripture-text focus:outline-none focus:ring-2 focus:ring-scripture-accent"
                      >
                        <option value="">All books</option>
                        {BIBLE_BOOKS.map(book => (
                          <option key={book.id} value={book.id}>{book.name}</option>
                        ))}
                      </select>
                      <div className="flex gap-2">
                        <button
                          onClick={handleUpdate}
                          className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 transition-colors"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingStudy(null)}
                          className="px-3 py-1.5 text-sm bg-scripture-muted/20 text-scripture-text rounded hover:bg-scripture-muted/30 transition-colors"
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
                            className="px-3 py-1.5 text-sm bg-scripture-accent text-scripture-bg rounded hover:bg-scripture-accent/90 transition-colors"
                          >
                            Set Active
                          </button>
                        )}
                        <button
                          onClick={() => setEditingStudy({ id: study.id, name: study.name, book: study.book })}
                          className="px-3 py-1.5 text-sm text-scripture-muted hover:text-scripture-text transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(study.id)}
                          className="px-3 py-1.5 text-sm text-highlight-red hover:text-highlight-red/80 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
        </div>
      </div>
    </div>
  );
}
