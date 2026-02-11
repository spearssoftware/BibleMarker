/**
 * Annotation Types
 * User-created highlights, symbols, notes, and section headings
 */

import type { VerseRef, VerseRange } from './bible';

/** Available highlight colors - vibrant tones that work well on dark backgrounds */
export const HIGHLIGHT_COLORS = {
  // Reds & Pinks
  red: '#ef4444',
  rose: '#f43f5e',
  coral: '#fb7185',
  crimson: '#dc2626',
  pink: '#ec4899',
  hotPink: '#db2777',
  fuchsia: '#d946ef',
  magenta: '#e879f9',

  // Oranges & Yellows
  orange: '#f97316',
  amber: '#f59e0b',
  yellow: '#eab308',
  gold: '#fbbf24',
  peach: '#fb923c',

  // Greens
  lime: '#84cc16',
  green: '#22c55e',
  emerald: '#10b981',
  teal: '#14b8a6',
  mint: '#2dd4bf',

  // Blues & Cyans
  cyan: '#06b6d4',
  sky: '#0ea5e9',
  blue: '#3b82f6',
  indigo: '#6366f1',
  azure: '#38bdf8',

  // Purples & Violets
  violet: '#8b5cf6',
  purple: '#a855f7',
  lavender: '#a78bfa',
  plum: '#c084fc',

  // Browns & Neutrals
  brown: '#d97706',
  gray: '#94a3b8',
  slate: '#64748b',
  silver: '#cbd5e1',
  bronze: '#b45309',
  tomato: '#f87171',
  jade: '#34d399',
  aqua: '#22d3ee',
  orchid: '#e879f9',
} as const;

export type HighlightColor = keyof typeof HIGHLIGHT_COLORS;

/** Get hex for a color; falls back to gray for legacy annotations that used removed colors */
export function getHighlightColorHex(color: string): string {
  const hex = HIGHLIGHT_COLORS[color as HighlightColor];
  return hex ?? HIGHLIGHT_COLORS.gray;
}

/** Pick a random highlight color (e.g. when assigning a symbol in a preset) */
export function getRandomHighlightColor(): HighlightColor {
  const keys = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[];
  return keys[Math.floor(Math.random() * keys.length)];
}

/** Available symbols for marking - Based on Precept Bible Study Method */
export const SYMBOLS = {
  // Identity - God, Jesus, Holy Spirit (Key words from Precept method)
  triangle: '▲',      // God / LORD / Jehovah
  cross: '✝',        // Jesus / Christ / Messiah
  dove: '🕊',        // Holy Spirit / Spirit
  flame: '🔥',       // Holy Spirit (alternative)
  angel: '👼',       // Angels / Heavenly beings
  lamb: '🐑',        // Lamb of God / Sacrifice
  anchor: '⚓',       // Hope / Steadfast
  cloud: '☁',        // God's presence / Glory / Heaven

  // People & Characters
  person: '👤',      // Person / Character
  peopleGroup: '👥', // People group / Nation (as people)
  crown: '👑',       // King / Authority / Title
  prayer: '🙏',      // Prayer / Worship

  // Obedience & Freedom
  obey: '🙇',        // Obey / Submit / Bow
  liberty: '🔓',     // Liberty / Freedom / Unshackled

  // Nation & Land
  nationLand: '🗺',  // Nation / Land / Territory / Map

  // Concepts & Themes
  star: '★',         // Promise / Covenant
  starOutline: '☆',  // Promise (lighter)
  heart: '❤',        // Love / Compassion
  heartRed: '❤️',    // Love / Compassion (filled)
  heartSparkle: '💖', // Love / Devotion (sparkling)
  lightning: '⚡',   // Judgment / Power / Conflict
  skull: '💀',       // Death
  sin: '↓',         // Sin / Falling short / Missing the mark
  shield: '🛡',      // Protection / Faith
  scales: '⚖',      // Justice / Judgment
  key: '🔑',         // Authority / Kingdom / Access
  sun: '☀',          // Glory / Light / Presence
  moon: '☽',         // Times / Seasons / Night
  lamp: '🪔',        // Word / Truth / Light
  cup: '🍷',         // Cup / Suffering / Covenant
  sword: '⚔',        // Word of God / Battle / Judgment

  // Scripture & Teaching
  scroll: '📜',      // Law / Commandment / Scripture
  book: '📖',        // Gospel / Word / Teaching
  tablet: '⛰',      // Commandments (alternative to scroll)

  // Time & Sequence
  clock: '🕐',       // Time / When / Chronology
  calendar: '📅',    // Date / Season
  hourglass: '⏳',   // Duration / Waiting
  arrowRight: '→',   // Therefore / Conclusion
  arrowLeft: '←',    // Because / Cause
  doubleArrow: '⇔',  // Comparison / Contrast

  // Geography & Place
  mapPin: '📍',      // Place / Location / Geography
  mountain: '⛰',     // Mountain / Place (alternative)
  globe: '🌍',       // World / Earth
  tree: '🌳',        // Tree / Growth / Life
  river: '〰',       // River / Stream / Water source
  house: '🏠',       // House / Dwelling
  temple: '⛪',      // Church / Temple / Sanctuary / Holy Place
  city: '🏙️',       // City / Urban / Civilization

  // Actions & States
  water: '💧',       // Baptism / Cleansing
  fire: '🔥',        // Refining / Testing
  check: '✓',        // Fulfilled / Completed
  x: '✗',            // Rejected / Removed
  hand: '✋',        // Action / Deed / Service
  eye: '👁',         // See / Witness / Revelation
  mouth: '👄',       // Speak / Testify / Proclaim
  foot: '🦶',        // Walk / Path / Way

  // Shapes for general marking (Precept-style)
  circle: '○',       // General marker
  square: '□',       // General marker
  diamond: '◇',      // General marker
  hexagon: '⬡',     // General marker
  plus: '➕',        // Add / Include / Also
  minus: '➖',       // Remove / Exclude

  // Punctuation markers
  question: '?',
  exclamation: '!',
  asterisk: '✱',    // Emphasis / Footnote
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
  endOffset?: number;        // Character offset within end verse
  
  // Styling
  color: HighlightColor;
  underlineStyle?: UnderlineStyle;
  
  /** Optional link to a MarkingPreset; enables find-by-preset and "marked" in Key Word Finder */
  presetId?: string;
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
  
  /** Optional link to a MarkingPreset; enables find-by-preset and "marked" in Key Word Finder */
  presetId?: string;
}

/** Union of all annotation types */
export type Annotation = TextAnnotation | SymbolAnnotation;

/** User-created section heading */
export interface SectionHeading {
  id: string;
  /** @deprecated moduleId is no longer used - section headings are translation-agnostic */
  moduleId?: string; // Optional for backward compatibility
  
  // Position - heading appears before this verse
  beforeRef: VerseRef;
  
  // Content
  title: string;
  
  // Optional range this heading covers
  coversUntil?: VerseRef;
  
  createdAt: Date;
  updatedAt: Date;
}

/** User-created chapter title */
export interface ChapterTitle {
  id: string;
  /** @deprecated moduleId is no longer used - chapter titles are translation-agnostic */
  moduleId?: string; // Optional for backward compatibility
  
  // Position - chapter this title belongs to
  book: string;
  chapter: number;
  
  // Content
  title: string;
  
  // Theme (optional) - statement about the chapter's theme
  theme?: string;
  
  // Supporting keyword preset IDs that support this theme
  supportingPresetIds?: string[];
  
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
  recentColors: [],
  recentSymbols: [],
  defaultTool: 'highlight',
  defaultColor: 'yellow',
  defaultSymbol: 'cross',
  toolbarPosition: 'bottom',
  showToolbarByDefault: true,
};
