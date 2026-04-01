import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VerseRef } from '@/types';
import type { ObservationTab } from '@/components/Observation';
import type { AnalyzeTab } from '@/components/Analyze';

type PanelType = 'keywords' | 'observe' | 'analyze';

interface PanelOpenOptions {
  // Keywords
  keywordInitialWord?: string;
  // Observe
  observeInitialTab?: ObservationTab;
  observeInitialListId?: string;
  observeVerseRef?: VerseRef;
  observeAutoCreate?: boolean;
  // Analyze
  analyzeInitialTab?: AnalyzeTab;
  analyzeThemeSearchTerm?: string;
  // Shared
  selectedText?: string;
  verseRef?: VerseRef;
}

interface PanelState {
  // Core state
  activePanel: PanelType | null;
  isPinned: boolean;
  isCollapsed: boolean;
  splitRatio: number;
  orientation: 'horizontal' | 'vertical';
  isDragging: boolean;

  // Panel-specific init props
  keywordInitialWord: string | undefined;
  observeInitialTab: ObservationTab;
  observeInitialListId: string | undefined;
  observeVerseRef: VerseRef | undefined;
  observeAutoCreate: boolean;
  analyzeInitialTab: AnalyzeTab;
  analyzeThemeSearchTerm: string | undefined;
  panelSelectedText: string | undefined;
  panelVerseRef: VerseRef | undefined;

  // Actions
  openPanel: (panel: PanelType, opts?: PanelOpenOptions) => void;
  closePanel: () => void;
  togglePanel: (panel: PanelType, opts?: PanelOpenOptions) => void;
  setPinned: (pinned: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
  setSplitRatio: (ratio: number) => void;
  setOrientation: (orientation: 'horizontal' | 'vertical') => void;
  setDragging: (dragging: boolean) => void;
  notifyActionComplete: () => void;
}

const DEFAULT_OBSERVE_TAB: ObservationTab = 'lists';
const DEFAULT_ANALYZE_TAB: AnalyzeTab = 'chapter';

export const usePanelStore = create<PanelState>()(
  persist(
    (set, get) => ({
      activePanel: null,
      isPinned: false,
      isCollapsed: false,
      splitRatio: 0.6,
      orientation: 'horizontal',
      isDragging: false,

      keywordInitialWord: undefined,
      observeInitialTab: DEFAULT_OBSERVE_TAB,
      observeInitialListId: undefined,
      observeVerseRef: undefined,
      observeAutoCreate: false,
      analyzeInitialTab: DEFAULT_ANALYZE_TAB,
      analyzeThemeSearchTerm: undefined,
      panelSelectedText: undefined,
      panelVerseRef: undefined,

      openPanel: (panel, opts) => {
        set({
          activePanel: panel,
          isCollapsed: false,
          keywordInitialWord: opts?.keywordInitialWord,
          observeInitialTab: opts?.observeInitialTab ?? DEFAULT_OBSERVE_TAB,
          observeInitialListId: opts?.observeInitialListId,
          observeVerseRef: opts?.observeVerseRef,
          observeAutoCreate: opts?.observeAutoCreate ?? false,
          analyzeInitialTab: opts?.analyzeInitialTab ?? DEFAULT_ANALYZE_TAB,
          analyzeThemeSearchTerm: opts?.analyzeThemeSearchTerm,
          panelSelectedText: opts?.selectedText,
          panelVerseRef: opts?.verseRef,
        });
      },

      closePanel: () => {
        set({
          activePanel: null,
          keywordInitialWord: undefined,
          observeInitialTab: DEFAULT_OBSERVE_TAB,
          observeInitialListId: undefined,
          observeVerseRef: undefined,
          observeAutoCreate: false,
          analyzeInitialTab: DEFAULT_ANALYZE_TAB,
          analyzeThemeSearchTerm: undefined,
          panelSelectedText: undefined,
          panelVerseRef: undefined,
        });
      },

      togglePanel: (panel, opts) => {
        const { activePanel, isCollapsed, openPanel, closePanel } = get();
        if (activePanel === panel) {
          if (isCollapsed) {
            set({ isCollapsed: false });
          } else {
            closePanel();
          }
        } else {
          openPanel(panel, opts);
        }
      },

      setPinned: (pinned) => set({ isPinned: pinned }),

      setCollapsed: (collapsed) => set({ isCollapsed: collapsed }),

      setSplitRatio: (ratio) => set({ splitRatio: ratio }),

      setOrientation: (orientation) => set({ orientation }),

      setDragging: (dragging) => set({ isDragging: dragging }),

      notifyActionComplete: () => {
        if (!get().isPinned) {
          get().closePanel();
        }
      },
    }),
    {
      name: 'panel-state',
      partialize: (state) => ({
        splitRatio: state.splitRatio,
        isPinned: state.isPinned,
        orientation: state.orientation,
      }),
    }
  )
);
