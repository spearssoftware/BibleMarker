/**
 * Study Selector Component
 * 
 * Select the active study for keyword filtering.
 */

import { useEffect } from 'react';
import { useStudyStore } from '@/stores/studyStore';
import { getBookById } from '@/types';
import { DropdownSelect } from '@/components/shared';

export function StudySelector() {
  const { studies, activeStudyId, loadStudies, setActiveStudy, getActiveStudy } = useStudyStore();

  useEffect(() => {
    loadStudies();
  }, [loadStudies]);

  getActiveStudy(); // ensure active study is resolved for dropdown

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
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-sm font-medium text-scripture-text whitespace-nowrap">Active Study:</span>
      <DropdownSelect
        value={activeStudyId || 'none'}
        onChange={(value) => handleChange(value)}
        options={[
          { value: 'none', label: 'Standard reading (global only)' },
          ...studies.map(study => ({
            value: study.id,
            label: `${study.name}${study.book ? ` (${getBookById(study.book)?.name || study.book})` : ''}`
          }))
        ]}
        className="min-w-[200px] flex-1 min-w-0 w-auto"
      />
    </div>
  );
}
