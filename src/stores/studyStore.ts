/**
 * Study State Store
 * 
 * Manages study state - active study, creating/editing studies.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Study } from '@/types/study';
import { getAllStudies as dbGetAllStudies, saveStudy as dbSaveStudy, deleteStudy as dbDeleteStudy } from '@/lib/db';

interface StudyState {
  // Active study
  activeStudyId: string | null;
  
  // Studies list (cached)
  studies: Study[];
  
  // Actions
  setActiveStudy: (studyId: string | null) => Promise<void>;
  loadStudies: () => Promise<void>;
  createStudy: (name: string, book?: string) => Promise<Study>;
  updateStudy: (study: Study) => Promise<void>;
  deleteStudy: (studyId: string) => Promise<void>;
  getActiveStudy: () => Study | null;
}

export const useStudyStore = create<StudyState>()(
  persist(
    (set, get) => ({
      activeStudyId: null,
      studies: [],
      
      setActiveStudy: async (studyId) => {
        // Ensure only one study is active at a time
        const { studies } = get();
        const updatedStudies = studies.map(s => ({
          ...s,
          isActive: s.id === studyId,
        }));
        
        // Update in database
        await Promise.all(updatedStudies.map(s => dbSaveStudy(s)));
        
        set({ activeStudyId: studyId, studies: updatedStudies });
      },
      
      loadStudies: async () => {
        const studies = await dbGetAllStudies();
        const activeStudy = studies.find(s => s.isActive);
        set({ 
          studies,
          activeStudyId: activeStudy?.id || null,
        });
      },
      
      createStudy: async (name, book) => {
        const newStudy: Study = {
          id: crypto.randomUUID(),
          name,
          book,
          isActive: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        
        await dbSaveStudy(newStudy);
        
        const { studies } = get();
        set({ studies: [...studies, newStudy] });
        
        return newStudy;
      },
      
      updateStudy: async (study) => {
        const updated = {
          ...study,
          updatedAt: new Date(),
        };
        
        await dbSaveStudy(updated);
        
        const { studies } = get();
        set({ 
          studies: studies.map(s => s.id === study.id ? updated : s),
          activeStudyId: updated.isActive ? updated.id : get().activeStudyId,
        });
      },
      
      deleteStudy: async (studyId) => {
        await dbDeleteStudy(studyId);
        
        const { studies, activeStudyId } = get();
        const filtered = studies.filter(s => s.id !== studyId);
        
        set({ 
          studies: filtered,
          activeStudyId: activeStudyId === studyId ? null : activeStudyId,
        });
      },
      
      getActiveStudy: () => {
        const { studies, activeStudyId } = get();
        if (!activeStudyId) return null;
        return studies.find(s => s.id === activeStudyId) || null;
      },
    }),
    {
      name: 'study-state',
      partialize: (state) => ({
        activeStudyId: state.activeStudyId,
      }),
    }
  )
);
