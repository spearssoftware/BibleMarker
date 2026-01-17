/**
 * Annotation Types
 * User-created highlights, symbols, notes, and section headings
 */

import type { VerseRef, VerseRange } from './sword';

/** Available highlight colors */
export const HIGHLIGHT_COLORS = {
  red: '#ef4444',
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  lime: '#84cc16',
  green: '#22c55e',
  teal: '#14b8a6',
  cyan: '#06b6d4',
  blue: '#3b82f6',
  indigo: '#6366f1',
  purple: '#a855f7',
  pink: '#ec4899',
} as const;

export type HighlightColor = keyof typeof HIGHLIGHT_COLORS;

/** Available symbols for marking */
export const SYMBOLS = {
  // Precept-style symbols
  cross: '✝',
  triangle: '△',
  circle: '○',
  square: '□',
  diamond: '◇',
  star: '★',
  starOutline: '☆',
  hexagon: '⬡',
  
  // Concept symbols
  crown: '👑',
  dove: '🕊',
  water: '💧',
  fire: '🔥',
  lightning: '⚡',
  skull: '💀',
  heart: '❤',
  prayer: '🙏',
  book: '📖',
  
  // Time/sequence symbols
  clock: '⏰',
  calendar: '📅',
  hourglass: '⏳',
  arrowRight: '→',
  arrowLeft: '←',
  arrowUp: '↑',
  arrowDown: '↓',
  
  // Numbered markers
  num1: '①',
  num2: '②',
  num3: '③',
  num4: '④',
  num5: '⑤',
  letterA: 'Ⓐ',
  letterB: 'Ⓑ',
  letterC: 'Ⓒ',
  
  // Punctuation markers
  question: '?',
  exclamation: '!',
  check: '✓',
  x: '✗',
} as const;

export type SymbolKey = keyof typeof SYMBOLS;

/** Annotation types */
export type AnnotationType = 
  | 'highlight'      // Background color on text
  | 'textColor'      // Change text color
  | 'symbol'         // Insert symbol before/after text
  | 'underline';     // Underline text

/** Underline styles */
export type UnderlineStyle = 'solid' | 'dashed' | 'dotted' | 'double' | 'wavy';

/** Base annotation interface */
interface BaseAnnotation {
  id: string;
  moduleId: string;          // Which Bible translation
  createdAt: Date;
  updatedAt: Date;
}

/** Text selection annotation (highlight, text color, underline) */
export interface TextAnnotation extends BaseAnnotation {
  type: 'highlight' | 'textColor' | 'underline';
  
  // Location - can span multiple verses
  startRef: VerseRef;
  endRef: VerseRef;
  
  // Word-level precision (optional)
  startWordIndex?: number;   // 0-based word index in start verse
  endWordIndex?: number;     // 0-based word index in end verse
  
  // Character-level precision for exact text selection
  selectedText?: string;      // The exact text that was selected
  startOffset?: number;       // Character offset within start verse
  endOffset?: number;         // Character offset within end verse
  
  // Styling
  color: HighlightColor;
  underlineStyle?: UnderlineStyle;
}

/** Symbol annotation */
export interface SymbolAnnotation extends BaseAnnotation {
  type: 'symbol';
  
  // Location
  ref: VerseRef;
  wordIndex?: number;        // Which word to attach to (0-based)
  position: 'before' | 'after' | 'center'; // Before/after word/verse, or center of selection
  placement?: 'above' | 'overlay'; // For center position: above text or on top of text
  
  // For center positioning on selected text
  selectedText?: string;      // The exact text that was selected
  startWordIndex?: number;    // Start word index (0-based)
  endWordIndex?: number;      // End word index (0-based)
  startOffset?: number;       // Character offset within verse
  endOffset?: number;         // Character offset within verse
  endRef?: VerseRef;         // For multi-verse selections
  
  // Symbol
  symbol: SymbolKey;
  color?: HighlightColor;    // Optional color for the symbol
}

/** Union of all annotation types */
export type Annotation = TextAnnotation | SymbolAnnotation;

/** User-created section heading */
export interface SectionHeading {
  id: string;
  moduleId: string;
  
  // Position - heading appears before this verse
  beforeRef: VerseRef;
  
  // Content
  title: string;
  
  // Optional range this heading covers
  coversUntil?: VerseRef;
  
  createdAt: Date;
  updatedAt: Date;
}

/** Note attached to a verse or range */
export interface Note {
  id: string;
  moduleId: string;
  
  // Location
  ref: VerseRef;
  range?: VerseRange;        // Optional range if note covers multiple verses
  
  // Content
  content: string;           // Markdown supported
  
  createdAt: Date;
  updatedAt: Date;
}

/** User preferences for marking tools */
export interface MarkingPreferences {
  // Favorite colors (shown first in picker)
  favoriteColors: HighlightColor[];
  
  // Favorite symbols (shown first in picker)
  favoriteSymbols: SymbolKey[];
  
  // Recently used (auto-tracked)
  recentColors: HighlightColor[];
  recentSymbols: SymbolKey[];
  
  // Default tool settings
  defaultTool: AnnotationType;
  defaultColor: HighlightColor;
  defaultSymbol: SymbolKey;
  
  // UI preferences
  toolbarPosition: 'top' | 'bottom' | 'floating';
  showToolbarByDefault: boolean;
}

/** Default marking preferences */
export const DEFAULT_MARKING_PREFERENCES: MarkingPreferences = {
  favoriteColors: ['yellow', 'green', 'blue', 'pink'],
  favoriteSymbols: ['cross', 'triangle', 'circle', 'crown'],
  recentColors: [],
  recentSymbols: [],
  defaultTool: 'highlight',
  defaultColor: 'yellow',
  defaultSymbol: 'cross',
  toolbarPosition: 'bottom',
  showToolbarByDefault: true,
};
