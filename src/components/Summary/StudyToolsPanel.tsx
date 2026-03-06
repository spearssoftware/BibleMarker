/**
 * Study Tools Panel
 * 
 * Combined panel for Observation Lists, Chapter at a Glance, Book Overview, and Theme Tracker
 */

import { useState, useEffect } from 'react';
import { useStudyStore } from '@/stores/studyStore';
import { getBookById, BIBLE_BOOKS } from '@/types';
import { Button, ConfirmationDialog, DropdownSelect, Input } from '@/components/shared';
import { InterpretationWorksheet } from '@/components/Interpretation';
import { ApplicationWorksheet } from '@/components/Application';
import { getPreferences } from '@/lib/database';

type StudyToolTab = 'interpretation' | 'application' | 'studies';

interface StudyToolsPanelProps {
  onClose: () => void;
  initialTab?: StudyToolTab;
}

const VALID_TABS: StudyToolTab[] = ['interpretation', 'application', 'studies'];

export function StudyToolsPanel({ onClose: _onClose, initialTab = 'interpretation' }: StudyToolsPanelProps) {
  const resolvedInitial = VALID_TABS.includes(initialTab) ? initialTab : 'interpretation';
  const [activeTab, setActiveTabRaw] = useState<StudyToolTab>(resolvedInitial);
  const { studies, activeStudyId, loadStudies, createStudy, updateStudy, deleteStudy, setActiveStudy } = useStudyStore();
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const setActiveTab = (tab: StudyToolTab) => {
    setIsCreating(false);
    setIsEditing(false);
    setActiveTabRaw(tab);
  };

  // Study management state
  const [editingStudy, setEditingStudy] = useState<{ id: string; name: string; book?: string } | null>(null);
  const [newStudyName, setNewStudyName] = useState('');
  const [newStudyBook, setNewStudyBook] = useState<string>('');
  const [confirmDeleteStudyId, setConfirmDeleteStudyId] = useState<string | null>(null);

  useEffect(() => {
    loadStudies();
  }, [loadStudies]);

  useEffect(() => {
    getPreferences().then(prefs => {
      setDisabledTools(prefs.disabledTools || []);
    });
  }, []);

  const allTabs: { id: StudyToolTab; label: string; icon: string }[] = [
    { id: 'interpretation', label: 'Interpretation', icon: '💭' },
    { id: 'application', label: 'Application', icon: '✍️' },
    { id: 'studies', label: 'Studies', icon: '📖' },
  ];

  const tabs = allTabs.filter(tab => !disabledTools.includes(tab.id));

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
    <>
      <ConfirmationDialog
        isOpen={confirmDeleteStudyId != null}
        title="Delete Study"
        message="Are you sure you want to delete this study? This cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleConfirmDeleteStudy}
        onCancel={handleCancelDeleteStudy}
        destructive
      />
    <div 
      className="flex-1 min-h-0 flex flex-col overflow-hidden relative" 
      role="dialog" 
      aria-label="Study Tools" 
      aria-modal="true"
    >
      {/* Header with tabs and close button */}
      <div className="flex items-center justify-between px-4 py-2 flex-shrink-0 border-b border-scripture-border/30">
        {/* Tabs */}
        <div role="tablist" aria-label="Study tools sections">
          <div className="flex gap-1 sm:gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                role="tab"
                id={`study-tab-${tab.id}`}
                aria-selected={activeTab === tab.id}
                aria-controls={`study-tabpanel-${tab.id}`}
                title={tab.label}
                className={`
                  px-2 sm:px-3 py-1.5 rounded-lg text-sm font-ui font-medium transition-all whitespace-nowrap
                  flex items-center justify-center gap-1
                  ${activeTab === tab.id
                    ? 'bg-scripture-accent text-scripture-bg shadow-md'
                    : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'
                  }
                `}
              >
                <span className="text-base" aria-hidden="true">{tab.icon}</span>
                <span className={`text-xs ${activeTab === tab.id ? 'inline' : 'hidden sm:inline'}`}>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

      </div>

      {/* Action bar */}
      {(activeTab === 'interpretation' || activeTab === 'application') && (
        <div className="flex items-center gap-3 px-4 py-2 flex-shrink-0 border-b border-scripture-border/30">
          <button
            onClick={() => setIsCreating(true)}
            disabled={isCreating || isEditing}
            className="px-3 py-1.5 text-sm bg-scripture-accent text-white rounded hover:bg-scripture-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {activeTab === 'interpretation' ? '+ New Interpretation' : '+ New Entry'}
          </button>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 custom-scrollbar">
            {activeTab === 'interpretation' && (
              <div role="tabpanel" id="study-tabpanel-interpretation" aria-labelledby="study-tab-interpretation">
                <InterpretationWorksheet
                  isCreating={isCreating}
                  setIsCreating={setIsCreating}
                  onEditingChange={setIsEditing}
                />
              </div>
            )}
            {activeTab === 'application' && (
              <div role="tabpanel" id="study-tabpanel-application" aria-labelledby="study-tab-application">
                <ApplicationWorksheet
                  isCreating={isCreating}
                  setIsCreating={setIsCreating}
                  onEditingChange={setIsEditing}
                />
              </div>
            )}
            {activeTab === 'studies' && (
              <div role="tabpanel" id="study-tabpanel-studies" aria-labelledby="study-tab-studies" className="space-y-0">
                {/* Create new study */}
                <div className="mb-4">
                  <h3 className="text-base font-ui font-semibold text-scripture-text mb-4">Create New Study</h3>
                  <div className="space-y-3">
                    <Input
                      type="text"
                      value={newStudyName}
                      onChange={(e) => setNewStudyName(e.target.value)}
                      placeholder="Study name (e.g., 'John - Character Study')"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          handleCreateStudy();
                        }
                      }}
                    />
                    <DropdownSelect
                      value={newStudyBook}
                      onChange={(value) => setNewStudyBook(value)}
                      options={[
                        { value: '', label: 'All books (global study)' },
                        ...BIBLE_BOOKS.map(book => ({
                          value: book.id,
                          label: book.name
                        }))
                      ]}
                    />
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
                              <Input
                                type="text"
                                value={editingStudy.name}
                                onChange={(e) => setEditingStudy({ ...editingStudy, name: e.target.value })}
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleUpdateStudy();
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
                                  ...BIBLE_BOOKS.map(book => ({
                                    value: book.id,
                                    label: book.name
                                  }))
                                ]}
                              />
                              <div className="flex justify-end gap-2">
                                <Button variant="ghost" onClick={() => setEditingStudy(null)}>Cancel</Button>
                                <Button onClick={handleUpdateStudy}>Save</Button>
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
    </>
  );
}
