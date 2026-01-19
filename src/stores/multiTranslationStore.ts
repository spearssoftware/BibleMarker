/**
 * Multi-Translation State Store
 * 
 * Manages multi-translation view state - active translations, layout, scrolling sync.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MultiTranslationView } from '@/types/multiTranslation';
import { db } from '@/lib/db';

interface MultiTranslationState {
  // Active multi-translation view
  activeView: MultiTranslationView | null;
  
  // Actions
  setActiveView: (view: MultiTranslationView | null) => Promise<void>;
  loadActiveView: () => Promise<void>;
  addTranslation: (translationId: string) => Promise<void>;
  removeTranslation: (translationId: string) => Promise<void>;
  setSyncScrolling: (sync: boolean) => Promise<void>;
  clearView: () => Promise<void>;
}

const DEFAULT_VIEW: MultiTranslationView = {
  id: 'active',
  translationIds: [],
  syncScrolling: true,
};

export const useMultiTranslationStore = create<MultiTranslationState>()(
  persist(
    (set, get) => ({
      activeView: null,
      
      setActiveView: async (view) => {
        if (view) {
          await db.multiTranslationViews.put(view);
        } else {
          await db.multiTranslationViews.delete('active');
        }
        set({ activeView: view });
      },
      
      loadActiveView: async () => {
        const view = await db.multiTranslationViews.get('active');
        set({ activeView: view || null });
      },
      
      addTranslation: async (translationId) => {
        const { activeView } = get();
        const currentView = activeView || { ...DEFAULT_VIEW };
        
        // Max 3 translations
        if (currentView.translationIds.length >= 3) {
          return;
        }
        
        // Don't add duplicates
        if (currentView.translationIds.includes(translationId)) {
          return;
        }
        
        const updatedView: MultiTranslationView = {
          ...currentView,
          translationIds: [...currentView.translationIds, translationId],
        };
        
        await db.multiTranslationViews.put(updatedView);
        set({ activeView: updatedView });
      },
      
      removeTranslation: async (translationId) => {
        const { activeView } = get();
        if (!activeView) return;
        
        const updatedView: MultiTranslationView = {
          ...activeView,
          translationIds: activeView.translationIds.filter(id => id !== translationId),
        };
        
        // If no translations left, clear the view
        if (updatedView.translationIds.length === 0) {
          await db.multiTranslationViews.delete('active');
          set({ activeView: null });
        } else {
          await db.multiTranslationViews.put(updatedView);
          set({ activeView: updatedView });
        }
      },
      
      setSyncScrolling: async (sync) => {
        const { activeView } = get();
        if (!activeView) return;
        
        const updatedView: MultiTranslationView = {
          ...activeView,
          syncScrolling: sync,
        };
        
        await db.multiTranslationViews.put(updatedView);
        set({ activeView: updatedView });
      },
      
      clearView: async () => {
        await db.multiTranslationViews.delete('active');
        set({ activeView: null });
      },
    }),
    {
      name: 'multi-translation-state',
      partialize: (state) => ({
        // Don't persist activeView - load from DB on mount
      }),
    }
  )
);
