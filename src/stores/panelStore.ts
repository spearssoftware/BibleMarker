import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { VerseRef } from '@/types';
import type { ObservationTab } from '@/components/Observation';
import type { AnalyzeTab } from '@/components/Analyze';
import type { SettingsTab } from '@/components/Settings';

export type PanelType = 'keywords' | 'observe' | 'analyze' | 'reference' | 'settings' | 'discovery';

export type ReferenceEntityType = 'person' | 'place' | 'event' | 'topic';
export type ReferenceTab = 'chapter' | 'search' | 'cross-refs' | 'original-lang' | 'strongs';

interface PanelOpenOptions {
  // Keywords
  keywordInitialWord?: string;
  /** Open the Key Words panel straight to editing this preset. */
  keywordInitialPresetId?: string;
  // Observe
  observeInitialTab?: ObservationTab;
  observeInitialListId?: string;
  observeVerseRef?: VerseRef;
  observeAutoCreate?: boolean;
  // Analyze
  analyzeInitialTab?: AnalyzeTab;
  analyzeThemeSearchTerm?: string;
  // Reference
  referenceInitialTab?: ReferenceTab;
  referenceEntitySlug?: string;
  referenceEntityType?: ReferenceEntityType;
  referenceSearchQuery?: string;
  referenceStrongsNumber?: string;
  referenceVerse?: number;
  // Settings
  settingsInitialTab?: SettingsTab;
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
  /** Set when a panel replaces Discover, so closing it can return there. Not persisted. */
  returnPanel: PanelType | null;

  // Panel-specific init props
  keywordInitialWord: string | undefined;
  keywordInitialPresetId: string | undefined;
  /** Bumped on every openPanel so the Key Words panel re-reads its initial props, even for the same preset. */
  keywordRequestId: number;
  observeInitialTab: ObservationTab;
  observeInitialListId: string | undefined;
  observeVerseRef: VerseRef | undefined;
  observeAutoCreate: boolean;
  analyzeInitialTab: AnalyzeTab;
  analyzeThemeSearchTerm: string | undefined;
  referenceInitialTab: ReferenceTab;
  referenceEntitySlug: string | undefined;
  referenceEntityType: ReferenceEntityType | undefined;
  referenceSearchQuery: string | undefined;
  referenceStrongsNumber: string | undefined;
  referenceVerse: number | undefined;
  settingsInitialTab: SettingsTab;
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
}

const DEFAULT_OBSERVE_TAB: ObservationTab = 'lists';
const DEFAULT_ANALYZE_TAB: AnalyzeTab = 'chapter';
const DEFAULT_REFERENCE_TAB: ReferenceTab = 'chapter';
const DEFAULT_SETTINGS_TAB: SettingsTab = 'appearance';

export const usePanelStore = create<PanelState>()(
  persist(
    (set, get) => ({
      activePanel: null,
      isPinned: false,
      isCollapsed: false,
      splitRatio: 0.6,
      orientation: 'horizontal',
      isDragging: false,
      returnPanel: null,

      keywordInitialWord: undefined,
      keywordInitialPresetId: undefined,
      keywordRequestId: 0,
      observeInitialTab: DEFAULT_OBSERVE_TAB,
      observeInitialListId: undefined,
      observeVerseRef: undefined,
      observeAutoCreate: false,
      analyzeInitialTab: DEFAULT_ANALYZE_TAB,
      analyzeThemeSearchTerm: undefined,
      referenceInitialTab: DEFAULT_REFERENCE_TAB,
      referenceEntitySlug: undefined,
      referenceEntityType: undefined,
      referenceSearchQuery: undefined,
      referenceStrongsNumber: undefined,
      referenceVerse: undefined,
      settingsInitialTab: DEFAULT_SETTINGS_TAB,
      panelSelectedText: undefined,
      panelVerseRef: undefined,

      openPanel: (panel, opts) => {
        const { activePanel, returnPanel } = get();
        set({
          returnPanel:
            panel === 'discovery' ? null : activePanel === 'discovery' ? 'discovery' : returnPanel,
          activePanel: panel,
          isCollapsed: false,
          keywordInitialWord: opts?.keywordInitialWord,
          keywordInitialPresetId: opts?.keywordInitialPresetId,
          keywordRequestId: get().keywordRequestId + 1,
          observeInitialTab: opts?.observeInitialTab ?? DEFAULT_OBSERVE_TAB,
          observeInitialListId: opts?.observeInitialListId,
          observeVerseRef: opts?.observeVerseRef,
          observeAutoCreate: opts?.observeAutoCreate ?? false,
          analyzeInitialTab: opts?.analyzeInitialTab ?? DEFAULT_ANALYZE_TAB,
          analyzeThemeSearchTerm: opts?.analyzeThemeSearchTerm,
          referenceInitialTab: opts?.referenceInitialTab ?? DEFAULT_REFERENCE_TAB,
          referenceEntitySlug: opts?.referenceEntitySlug,
          referenceEntityType: opts?.referenceEntityType,
          referenceSearchQuery: opts?.referenceSearchQuery,
          referenceStrongsNumber: opts?.referenceStrongsNumber,
          referenceVerse: opts?.referenceVerse,
          settingsInitialTab: opts?.settingsInitialTab ?? DEFAULT_SETTINGS_TAB,
          panelSelectedText: opts?.selectedText,
          panelVerseRef: opts?.verseRef,
        });
      },

      closePanel: () => {
        set({
          activePanel: null,
          returnPanel: null,
          keywordInitialWord: undefined,
          keywordInitialPresetId: undefined,
          observeInitialTab: DEFAULT_OBSERVE_TAB,
          observeInitialListId: undefined,
          observeVerseRef: undefined,
          observeAutoCreate: false,
          analyzeInitialTab: DEFAULT_ANALYZE_TAB,
          analyzeThemeSearchTerm: undefined,
          referenceInitialTab: DEFAULT_REFERENCE_TAB,
          referenceEntitySlug: undefined,
          referenceEntityType: undefined,
          referenceSearchQuery: undefined,
          referenceStrongsNumber: undefined,
          referenceVerse: undefined,
          settingsInitialTab: DEFAULT_SETTINGS_TAB,
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
