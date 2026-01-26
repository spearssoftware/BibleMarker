/**
 * Study Tools Panel
 * 
 * Combined panel for Observation Lists, Chapter at a Glance, Book Overview, and Theme Tracker
 */

import { useState, useEffect } from 'react';
import { useStudyStore } from '@/stores/studyStore';
import { getBookById, BIBLE_BOOKS } from '@/types/bible';
import { ChapterAtAGlance, BookOverview, ThemeTracker } from './';
import { ConfirmationDialog } from '@/components/shared';
import { InterpretationWorksheet } from '@/components/Interpretation';
import { ApplicationWorksheet } from '@/components/Application';

type StudyToolTab = 'chapter' | 'book' | 'theme' | 'studies' | 'interpretation' | 'application';

interface StudyToolsPanelProps {
  onClose: () => void;
  initialTab?: StudyToolTab;
}

export function StudyToolsPanel({ onClose, initialTab = 'book' }: StudyToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<StudyToolTab>(initialTab);
  const { studies, activeStudyId, loadStudies, createStudy, updateStudy, deleteStudy, setActiveStudy } = useStudyStore();
  
  // Study management state
  const [editingStudy, setEditingStudy] = useState<{ id: string; name: string; book?: string } | null>(null);
  const [newStudyName, setNewStudyName] = useState('');
  const [newStudyBook, setNewStudyBook] = useState<string>('');
  const [confirmDeleteStudyId, setConfirmDeleteStudyId] = useState<string | null>(null);

  useEffect(() => {
    loadStudies();
  }, [loadStudies]);

  const tabs: { id: StudyToolTab; label: string; icon: string }[] = [
    { id: 'book', label: 'Overview', icon: '📚' },
    { id: 'chapter', label: 'Chapter', icon: '📄' },
    { id: 'theme', label: 'Theme', icon: '🔍' },
    { id: 'interpretation', label: 'Interpretation', icon: '💭' },
    { id: 'application', label: 'Application', icon: '✍️' },
    { id: 'studies', label: 'Studies', icon: '📖' },
  ];

  // Study management handlers
  const handleCreateStudy = async () => {
    if (!newStudyName.trim()) return;
    
    await createStudy(newStudyName.trim(), newStudyBook || undefined);
    setNewStudyName('');
    setNewStudyBook('');
  };

  const handleUpdateStudy = async () => {
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

  const handleDeleteStudyClick = (studyId: string) => {
    setConfirmDeleteStudyId(studyId);
  };

  const handleConfirmDeleteStudy = async () => {
    if (!confirmDeleteStudyId) return;
    const idToDelete = confirmDeleteStudyId;
    setConfirmDeleteStudyId(null);
    await deleteStudy(idToDelete);
  };

  const handleCancelDeleteStudy = () => {
    setConfirmDeleteStudyId(null);
  };

  return (
    <div 
      className="flex-1 min-h-0 flex flex-col overflow-hidden relative" 
      role="dialog" 
      aria-label="Study Tools" 
      aria-modal="true"
    >
      {/* Close button - floating in top-right */}
      <button
        onClick={onClose}
        className="absolute top-2 right-2 z-10 text-scripture-muted hover:text-scripture-text transition-colors p-1.5 rounded-lg hover:bg-scripture-elevated"
        aria-label="Close study tools"
      >
        <span aria-hidden="true">✕</span>
      </button>

      {/* Tabs */}
      <div className="px-4 py-2 flex-shrink-0" role="tablist" aria-label="Study tools sections">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              role="tab"
              id={`study-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`study-tabpanel-${tab.id}`}
              className={`
                px-4 py-2 rounded-lg text-sm font-ui font-medium transition-all
                ${activeTab === tab.id
                  ? 'bg-scripture-accent text-scripture-bg shadow-md'
                  : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'
                }
              `}
            >
              <span className="mr-2" aria-hidden="true">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
        {activeTab === 'chapter' && (
          <div role="tabpanel" id="study-tabpanel-chapter" aria-labelledby="study-tab-chapter">
            <ChapterAtAGlance />
          </div>
        )}
            {activeTab === 'book' && (
              <div role="tabpanel" id="study-tabpanel-book" aria-labelledby="study-tab-book">
                <BookOverview onChapterClick={() => setActiveTab('chapter')} />
              </div>
            )}
            {activeTab === 'theme' && (
              <div role="tabpanel" id="study-tabpanel-theme" aria-labelledby="study-tab-theme">
                <ThemeTracker />
              </div>
            )}
            {activeTab === 'interpretation' && (
              <div role="tabpanel" id="study-tabpanel-interpretation" aria-labelledby="study-tab-interpretation">
                <InterpretationWorksheet />
              </div>
            )}
            {activeTab === 'application' && (
              <div role="tabpanel" id="study-tabpanel-application" aria-labelledby="study-tab-application">
                <ApplicationWorksheet />
              </div>
            )}
            {activeTab === 'studies' && (
              <div role="tabpanel" id="study-tabpanel-studies" aria-labelledby="study-tab-studies" className="space-y-0">
                {/* Create new study */}
                <div className="mb-4">
                  <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Create New Study</h3>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={newStudyName}
                      onChange={(e) => setNewStudyName(e.target.value)}
                      placeholder="Study name (e.g., 'John - Character Study')"
                      className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text placeholder-scripture-muted"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateStudy();
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
                      onClick={handleCreateStudy}
                      disabled={!newStudyName.trim()}
                      className="w-full px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg 
                               hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed 
                               transition-all duration-200 shadow-md"
                    >
                      Create Study
                    </button>
                  </div>
                </div>

                <div className="border-t border-scripture-border/30 mb-4"></div>

                {/* Studies list */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-ui font-semibold text-scripture-text">Your Studies</h3>
                    {activeStudyId && (
                      <button
                        onClick={() => setActiveStudy(null)}
                        className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50 
                                 border border-scripture-border/50 text-scripture-text rounded-lg 
                                 transition-all duration-200"
                      >
                        Clear Active Study
                      </button>
                    )}
                  </div>
                  {studies.length === 0 ? (
                    <p className="text-scripture-muted text-sm">No studies yet. Create one above to get started.</p>
                  ) : (
                    <div className="space-y-2">
                      {studies.map(study => (
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
                                    handleUpdateStudy();
                                  } else if (e.key === 'Escape') {
                                    setEditingStudy(null);
                                  }
                                }}
                              />
                              <select
                                value={editingStudy.book || ''}
                                onChange={(e) => setEditingStudy({ ...editingStudy, book: e.target.value || undefined })}
                                className="w-full px-3 py-2 text-sm bg-scripture-bg border border-scripture-border/50 rounded-lg focus:outline-none focus:border-scripture-accent text-scripture-text"
                              >
                                <option value="">All books</option>
                                {BIBLE_BOOKS.map(book => (
                                  <option key={book.id} value={book.id}>{book.name}</option>
                                ))}
                              </select>
                              <div className="flex gap-2">
                                <button
                                  onClick={handleUpdateStudy}
                                  className="px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg 
                                           hover:bg-scripture-accent/90 transition-all duration-200 shadow-md"
                                >
                                  Save
                                </button>
                                <button
                                  onClick={() => setEditingStudy(null)}
                                  className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50 
                                           border border-scripture-border/50 text-scripture-text rounded-lg 
                                           transition-all duration-200"
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
                                    className="px-3 py-2 text-sm font-ui bg-scripture-accent text-scripture-bg rounded-lg 
                                             hover:bg-scripture-accent/90 transition-all duration-200 shadow-md"
                                  >
                                    Set Active
                                  </button>
                                )}
                                <button
                                  onClick={() => setEditingStudy({ id: study.id, name: study.name, book: study.book })}
                                  className="px-3 py-2 text-sm font-ui bg-scripture-elevated hover:bg-scripture-border/50 
                                           border border-scripture-border/50 text-scripture-text rounded-lg 
                                           transition-all duration-200"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteStudyClick(study.id)}
                                  className="px-3 py-2 text-sm font-ui text-scripture-errorText hover:text-scripture-error 
                                           transition-colors underline"
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
              </div>
            )}
          </div>
    </div>
  );
}
