/**
 * Annotation State Store
 * 
 * Manages highlighting, symbols, and marking tool state.
 */

import { create } from 'zustand';
import type { 
  Annotation, 
  HighlightColor, 
  SymbolKey, 
  AnnotationType,
  MarkingPreferences,
  SectionHeading,
  Note,
} from '@/types/annotation';
import { DEFAULT_MARKING_PREFERENCES } from '@/types/annotation';

interface TextSelection {
  moduleId: string;
  book: string;
  chapter: number;
  startVerse: number;
  endVerse: number;
  startWordIndex?: number;
  endWordIndex?: number;
  text: string;
  // Character offsets for precise selection
  startOffset?: number;  // Character offset within start verse text
  endOffset?: number;     // Character offset within end verse text
  startVerseText?: string; // Full text of start verse (for finding offset)
  endVerseText?: string;   // Full text of end verse (for finding offset)
}

type FontSize = 'sm' | 'base' | 'lg' | 'xl';

interface AnnotationState {
  // Tool state
  activeTool: AnnotationType | 'symbol' | 'note' | null;
  activeColor: HighlightColor;
  activeSymbol: SymbolKey;
  
  // Selection state
  selection: TextSelection | null;
  isSelecting: boolean;
  
  // Current chapter annotations (loaded from DB)
  annotations: Annotation[];
  sectionHeadings: SectionHeading[];
  chapterTitle: ChapterTitle | null;
  chapterTitle: SectionHeading | null; // Using SectionHeading type for now, will be ChapterTitle
  notes: Note[];
  
  // Preferences
  preferences: MarkingPreferences;
  fontSize: FontSize;
  
  // Toolbar visibility
  toolbarVisible: boolean;
  toolbarExpanded: boolean;
  
  // Actions
  setActiveTool: (tool: AnnotationType | 'symbol' | 'note' | null) => void;
  setActiveColor: (color: HighlightColor) => void;
  setActiveSymbol: (symbol: SymbolKey) => void;
  setSelection: (selection: TextSelection | null) => void;
  setIsSelecting: (selecting: boolean) => void;
  setAnnotations: (annotations: Annotation[]) => void;
  setSectionHeadings: (headings: SectionHeading[]) => void;
  setChapterTitle: (title: ChapterTitle | null) => void;
  setNotes: (notes: Note[]) => void;
  setPreferences: (prefs: MarkingPreferences) => void;
  setFontSize: (size: FontSize) => void;
  setToolbarVisible: (visible: boolean) => void;
  setToolbarExpanded: (expanded: boolean) => void;
  
  // Color/symbol tracking
  addRecentColor: (color: HighlightColor) => void;
  addRecentSymbol: (symbol: SymbolKey) => void;
  
  // Clear selection after applying annotation
  clearSelection: () => void;
}

export const useAnnotationStore = create<AnnotationState>((set, get) => ({
  activeTool: null,
  activeColor: 'yellow',
  activeSymbol: 'cross',
  selection: null,
  isSelecting: false,
  annotations: [],
  sectionHeadings: [],
  chapterTitle: null,
  notes: [],
  preferences: DEFAULT_MARKING_PREFERENCES,
  fontSize: 'base',
  toolbarVisible: true,
  toolbarExpanded: false,
  
  setActiveTool: (tool) => set({ activeTool: tool }),
  
  setActiveColor: (color) => {
    set({ activeColor: color });
    get().addRecentColor(color);
  },
  
  setActiveSymbol: (symbol) => {
    set({ activeSymbol: symbol });
    get().addRecentSymbol(symbol);
  },
  
  setSelection: (selection) => set({ selection }),
  
  setIsSelecting: (isSelecting) => set({ isSelecting }),
  
  setAnnotations: (annotations) => set({ annotations }),
  
  setSectionHeadings: (sectionHeadings) => set({ sectionHeadings }),
  setChapterTitle: (chapterTitle) => set({ chapterTitle }),
  setNotes: (notes) => set({ notes }),
  
  setPreferences: (preferences) => set({ preferences }),
  
  setFontSize: (fontSize) => set({ fontSize }),
  
  setToolbarVisible: (toolbarVisible) => set({ toolbarVisible }),
  
  setToolbarExpanded: (toolbarExpanded) => set({ toolbarExpanded }),
  
  addRecentColor: (color) => {
    const { preferences } = get();
    const recent = [color, ...preferences.recentColors.filter(c => c !== color)].slice(0, 8);
    set({
      preferences: { ...preferences, recentColors: recent }
    });
  },
  
  addRecentSymbol: (symbol) => {
    const { preferences } = get();
    const recent = [symbol, ...preferences.recentSymbols.filter(s => s !== symbol)].slice(0, 8);
    set({
      preferences: { ...preferences, recentSymbols: recent }
    });
  },
  
  
  clearSelection: () => set({ selection: null, isSelecting: false }),
}));
