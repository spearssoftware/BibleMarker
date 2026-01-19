/**
 * Study Selector Component
 * 
 * Select the active study for keyword filtering.
 */

import { useEffect } from 'react';
import { useStudyStore } from '@/stores/studyStore';
import { getBookById } from '@/types/bible';

export function StudySelector() {
  const { studies, activeStudyId, loadStudies, setActiveStudy, getActiveStudy } = useStudyStore();

  useEffect(() => {
    loadStudies();
  }, [loadStudies]);

  const activeStudy = getActiveStudy();

  const handleChange = async (studyId: string) => {
    if (studyId === 'none') {
      await setActiveStudy(null);
    } else {
      await setActiveStudy(studyId);
    }
  };

  if (studies.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-scripture-muted">Active Study:</label>
      <select
        value={activeStudyId || 'none'}
        onChange={(e) => handleChange(e.target.value)}
        className="px-3 py-1.5 text-sm bg-scripture-background border border-scripture-muted/30 rounded text-scripture-text focus:outline-none focus:ring-2 focus:ring-scripture-accent"
      >
        <option value="none">None (show all keywords)</option>
        {studies.map(study => (
          <option key={study.id} value={study.id}>
            {study.name} {study.book ? `(${getBookById(study.book)?.name || study.book})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
