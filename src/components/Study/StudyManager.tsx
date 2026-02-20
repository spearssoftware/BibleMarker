/**
 * Study Manager Component
 * 
 * Create, edit, and delete studies.
 */

import { useState, useEffect } from 'react';
import { useStudyStore } from '@/stores/studyStore';
import { getBookById, BIBLE_BOOKS } from '@/types';
import { Modal, Button, Input, Select, ConfirmationDialog } from '@/components/shared';

interface StudyManagerProps {
  onClose?: () => void;
}

export function StudyManager({ onClose }: StudyManagerProps = {}) {
  const { studies, activeStudyId, loadStudies, createStudy, updateStudy, deleteStudy, setActiveStudy } = useStudyStore();
  const [isOpen, setIsOpen] = useState(true);
  const [editingStudy, setEditingStudy] = useState<{ id: string; name: string; book?: string } | null>(null);
  const [newStudyName, setNewStudyName] = useState('');
  const [newStudyBook, setNewStudyBook] = useState<string>('');
  const [confirmDeleteStudyId, setConfirmDeleteStudyId] = useState<string | null>(null);

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

  const handleDeleteClick = (studyId: string) => {
    setConfirmDeleteStudyId(studyId);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteStudyId) return;
    const idToDelete = confirmDeleteStudyId;
    setConfirmDeleteStudyId(null);
    await deleteStudy(idToDelete);
  };

  const handleCancelDelete = () => {
    setConfirmDeleteStudyId(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    if (onClose) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <ConfirmationDialog
        isOpen={confirmDeleteStudyId !== null}
        title="Delete Study"
        message="Are you sure you want to delete this study? This will not delete keywords, only the study grouping."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDelete}
        onCancel={handleCancelDelete}
        destructive={true}
      />
      <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Study Manager"
      size="md"
    >
              {/* Create new study */}
              <div className="mb-6 p-4 bg-scripture-elevated rounded-lg border border-scripture-border/30">
                <h3 className="text-sm font-medium text-scripture-text mb-3">Create New Study</h3>
                <div className="space-y-3">
                  <Input
                    type="text"
                    value={newStudyName}
                    onChange={(e) => setNewStudyName(e.target.value)}
                    placeholder="Study name (e.g., 'John - Character Study')"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleCreate();
                      }
                    }}
                  />
                  <Select
                    value={newStudyBook}
                    onChange={(e) => setNewStudyBook(e.target.value)}
                    options={[
                      { value: '', label: 'All books (global study)' },
                      ...BIBLE_BOOKS.map(book => ({ value: book.id, label: book.name }))
                    ]}
                  />
                  <Button
                    onClick={handleCreate}
                    disabled={!newStudyName.trim()}
                    fullWidth
                  >
                    Create Study
                  </Button>
                </div>
              </div>

              {/* Studies list */}
              <div className="space-y-2">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-scripture-text">Your Studies</h3>
                  {activeStudyId && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setActiveStudy(null)}
                    >
                      Clear Active Study
                    </Button>
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
                          <Input
                            type="text"
                            value={editingStudy.name}
                            onChange={(e) => setEditingStudy({ ...editingStudy, name: e.target.value })}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleUpdate();
                              } else if (e.key === 'Escape') {
                                setEditingStudy(null);
                              }
                            }}
                          />
                          <Select
                            value={editingStudy.book || ''}
                            onChange={(e) => setEditingStudy({ ...editingStudy, book: e.target.value || undefined })}
                            options={[
                              { value: '', label: 'All books' },
                              ...BIBLE_BOOKS.map(book => ({ value: book.id, label: book.name }))
                            ]}
                          />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={handleUpdate}>
                              Save
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setEditingStudy(null)}>
                              Cancel
                            </Button>
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
                              <Button size="sm" onClick={() => setActiveStudy(study.id)}>
                                Set Active
                              </Button>
                            )}
                            <button
                              onClick={() => setEditingStudy({ id: study.id, name: study.name, book: study.book })}
                              className="px-3 py-1.5 text-sm text-scripture-muted hover:text-scripture-text transition-colors"
                            >
                              Edit
                            </button>
                            <button
                                  onClick={() => handleDeleteClick(study.id)}
                              className="px-3 py-1.5 text-sm text-scripture-error hover:text-scripture-error/90 transition-colors"
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
    </Modal>
    </>
  );
}
