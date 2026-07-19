/**
 * Studies settings tab — create/rename/scope/delete studies, set the active
 * study, export a single study's observation report as a PDF, and export all
 * study notes as a Markdown document. Loads studies from the store on mount.
 */

import { useState, useEffect } from 'react';
import { BIBLE_BOOKS, getBookById, type Study } from '@/types';
import { saveStudyObservationPdf, openSavedPdf } from '@/lib/observation-pdf';
import { exportStudyData } from '@/lib/export';
import { Button, ConfirmationDialog, Input, DropdownSelect } from '@/components/shared';
import { useStudyStore } from '@/stores/studyStore';

export function StudiesSection() {
  const { studies, activeStudyId, loadStudies, createStudy, updateStudy, deleteStudy, setActiveStudy } = useStudyStore();
  const [newStudyName, setNewStudyName] = useState('');
  const [newStudyBook, setNewStudyBook] = useState<string>('');
  const [editingStudy, setEditingStudy] = useState<{ id: string; name: string; book?: string } | null>(null);
  const [confirmDeleteStudyId, setConfirmDeleteStudyId] = useState<string | null>(null);

  // Study PDF export state (per-study)
  const [exportingStudyPdfId, setExportingStudyPdfId] = useState<string | null>(null);
  const [studyPdfError, setStudyPdfError] = useState<string | null>(null);

  // Study Markdown export state (all studies)
  const [isExportingStudy, setIsExportingStudy] = useState(false);
  const [studyExportError, setStudyExportError] = useState<string | null>(null);
  const [studyExportSuccess, setStudyExportSuccess] = useState<string | boolean>(false);

  useEffect(() => {
    loadStudies();
  }, [loadStudies]);

  // Export a single study's observation report PDF, scoped to that study.
  const handleExportStudyPdf = async (study: Study) => {
    setExportingStudyPdfId(study.id);
    setStudyPdfError(null);
    try {
      const result = await saveStudyObservationPdf(study);
      // On success the saved PDF opens in the system viewer — that's the feedback.
      if ('path' in result) await openSavedPdf(result.path).catch(() => {});
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Failed to export study PDF';
      setStudyPdfError(`${study.name}: ${msg}`);
    } finally {
      setExportingStudyPdfId(null);
    }
  };

  // Export all study notes as a single Markdown document.
  const handleExportStudy = async () => {
    setIsExportingStudy(true);
    setStudyExportError(null);
    setStudyExportSuccess(false);

    try {
      const result = await exportStudyData();
      setStudyExportSuccess(result || true);
      setTimeout(() => {
        setStudyExportSuccess(false);
      }, 3000);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to export study data';
      if (msg !== 'Export cancelled') {
        setStudyExportError(msg);
      }
    } finally {
      setIsExportingStudy(false);
    }
  };

  return (
    <div role="tabpanel" id="settings-tabpanel-studies" aria-labelledby="settings-tab-studies">
      <ConfirmationDialog
        isOpen={confirmDeleteStudyId != null}
        title="Delete Study"
        message="Are you sure you want to delete this study? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={async () => {
          if (!confirmDeleteStudyId) return;
          const id = confirmDeleteStudyId;
          setConfirmDeleteStudyId(null);
          await deleteStudy(id);
        }}
        onCancel={() => setConfirmDeleteStudyId(null)}
        destructive
      />
      <div className="space-y-0">
        <div className="p-4">
          <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Create New Study</h3>
          <div className="space-y-3">
            <Input
              type="text"
              value={newStudyName}
              onChange={(e) => setNewStudyName(e.target.value)}
              placeholder="Study name (e.g., 'John - Character Study')"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newStudyName.trim()) {
                  createStudy(newStudyName.trim(), newStudyBook || undefined).then(() => {
                    setNewStudyName('');
                    setNewStudyBook('');
                  });
                }
              }}
            />
            <DropdownSelect
              value={newStudyBook}
              onChange={(value) => setNewStudyBook(value)}
              options={[
                { value: '', label: 'All books' },
                ...BIBLE_BOOKS.map(book => ({ value: book.id, label: book.name }))
              ]}
            />
            <button
              onClick={() => {
                if (!newStudyName.trim()) return;
                createStudy(newStudyName.trim(), newStudyBook || undefined).then(() => {
                  setNewStudyName('');
                  setNewStudyBook('');
                });
              }}
              disabled={!newStudyName.trim()}
              className="w-full px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                       hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 shadow-md"
            >
              Create Study
            </button>
          </div>
        </div>

        <div className="border-t border-scripture-border/30 my-4"></div>

        <div className="p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-ui font-semibold text-scripture-text">Your Studies</h3>
            {activeStudyId && (
              <button
                onClick={() => setActiveStudy(null)}
                className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50
                         border border-scripture-border/50 text-scripture-text rounded-lg transition-all duration-200"
              >
                Clear Active Study
              </button>
            )}
          </div>
          {studyPdfError && (
            <p className="text-sm text-scripture-error mb-3">{studyPdfError}</p>
          )}
          {studies.length === 0 ? (
            <p className="text-scripture-muted text-sm">No studies yet. Create one above to get started.</p>
          ) : (
            <div className="space-y-2">
              {studies.map(study => (
                <div
                  key={study.id}
                  className="p-4 bg-scripture-surface rounded-xl border border-scripture-border/50 shadow-sm flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
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
                            updateStudy({ ...study, name: editingStudy.name.trim(), book: editingStudy.book }).then(() => setEditingStudy(null));
                          } else if (e.key === 'Escape') {
                            setEditingStudy(null);
                          }
                        }}
                      />
                      <DropdownSelect
                        value={editingStudy.book || ''}
                        onChange={(value) => setEditingStudy({ ...editingStudy, book: value || undefined })}
                        options={[
                          { value: '', label: 'All books' },
                          ...BIBLE_BOOKS.map(book => ({ value: book.id, label: book.name }))
                        ]}
                      />
                      <div className="flex justify-center sm:justify-end gap-2">
                        <Button variant="ghost" onClick={() => setEditingStudy(null)}>Cancel</Button>
                        <Button onClick={() => updateStudy({ ...study, name: editingStudy.name.trim(), book: editingStudy.book }).then(() => setEditingStudy(null))}>Save</Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-scripture-text break-words">{study.name}</div>
                          {activeStudyId === study.id && (
                            <span className="px-2 py-0.5 text-xs bg-scripture-accent text-scripture-bg rounded">Active</span>
                          )}
                        </div>
                        <div className="text-sm text-scripture-muted">
                          {study.book ? `Scoped to: ${getBookById(study.book)?.name || study.book}` : 'All books'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap sm:flex-shrink-0">
                        {activeStudyId !== study.id && (
                          <button
                            onClick={() => setActiveStudy(study.id)}
                            className="px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg
                                     hover:bg-scripture-accent/90 transition-all duration-200 shadow-md"
                          >
                            Set Active
                          </button>
                        )}
                        <button
                          onClick={() => handleExportStudyPdf(study)}
                          disabled={exportingStudyPdfId === study.id}
                          className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50
                                   border border-scripture-border/50 text-scripture-text rounded-lg transition-all duration-200
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Export this study's observations as a PDF"
                        >
                          {exportingStudyPdfId === study.id ? 'Exporting…' : 'Export PDF'}
                        </button>
                        <button
                          onClick={() => setEditingStudy({ id: study.id, name: study.name, book: study.book })}
                          className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50
                                   border border-scripture-border/50 text-scripture-text rounded-lg transition-all duration-200"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setConfirmDeleteStudyId(study.id)}
                          className="px-3 py-2 text-sm font-ui text-scripture-errorText hover:text-scripture-error transition-colors underline"
                        >
                          Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-scripture-border/30 my-4"></div>

        {/* Export study notes (all studies, Markdown) */}
        <div className="p-4">
          <h3 className="text-base font-ui font-semibold text-scripture-text mb-1">Export study notes</h3>
          <p className="text-sm text-scripture-muted mb-4">
            Save all your study notes (observations, interpretations, and applications) as a readable Markdown document, organized by book and chapter. For a single study as a PDF, use Export PDF above.
          </p>

          <button
            onClick={handleExportStudy}
            disabled={isExportingStudy}
            className="w-full px-3 py-2 bg-scripture-accent text-scripture-bg rounded-lg hover:bg-scripture-accent/90
                     disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                     font-ui text-sm shadow-md flex items-center justify-center gap-2"
          >
            {isExportingStudy ? (
              <>
                <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin"></div>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <span>📄</span>
                <span>Export Study Notes (Markdown)</span>
              </>
            )}
          </button>

          {studyExportSuccess && (
            <div className="mt-3 p-3 bg-scripture-successBg border border-scripture-success/30 rounded-lg text-scripture-successText text-sm">
              ✓ Study notes exported successfully!{typeof studyExportSuccess === 'string' && (
                <> Saved to Documents/{studyExportSuccess}</>
              )}
            </div>
          )}

          {studyExportError && (
            <div className="mt-3 p-3 bg-scripture-errorBg border border-scripture-error/30 rounded-lg text-scripture-errorText text-sm">
              ✗ {studyExportError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
