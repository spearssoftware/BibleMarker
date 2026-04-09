/**
 * Key Word & Marking Preset Types
 *
 * Unified model: MarkingPreset is the main type. Key words = presets with `word` set.
 * KeyWordDefinition is kept for DB migration only (keyWords → markingPresets).
 */

import type { HighlightColor, SymbolKey } from './annotation';

/** Variant with optional scope - allows variants to be scoped to specific books/chapters */
export interface Variant {
  text: string;
  /** Optional: scope to a specific book (if null/undefined, applies globally to all books) */
  bookScope?: string;
  /** Optional: scope to a specific chapter within a book (requires bookScope) */
  chapterScope?: number;
}

/** Unified marking preset: symbol and/or highlight/textColor/underline. Key words = presets with `word`. */
export interface MarkingPreset {
  id: string;
  /** Symbol (optional). At least one of symbol or highlight required. */
  symbol?: SymbolKey;
  /** Highlight style + color (optional). When set, applied as TextAnnotation. */
  highlight?: { style: 'highlight' | 'textColor' | 'underline'; color: HighlightColor };
  /** Optional: when set, this preset is a "key word" (word match, auto-suggest, find). */
  word?: string;
  /** Variants can be scoped to specific books/chapters independent of the keyword scope */
  variants: Variant[];
  category?: KeyWordCategory;
  description?: string;
  autoSuggest: boolean;
  usageCount: number;
  /** Optional: scope to a specific book (if null/undefined, applies globally to all books) */
  bookScope?: string;
  /** Optional: scope to a specific chapter within a book (requires bookScope) */
  chapterScope?: number;
  /** Optional: scope to a single translation (moduleId). When set, keyword only applies to that translation. */
  moduleScope?: string;
  /** Optional: link to a study (if null/undefined, keyword is global and always visible) */
  studyId?: string;
  /** When true, matching respects case (e.g., "God" won't match "god") */
  caseSensitive?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * @deprecated Use MarkingPreset. Kept for DB migration (keyWords → markingPresets).
 */
export interface KeyWordDefinition {
  id: string;
  word: string;
  variants: string[];
  symbol?: SymbolKey;
  color?: HighlightColor;
  category?: KeyWordCategory;
  description?: string;
  autoSuggest: boolean;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Predefined categories based on Precept method */
export type KeyWordCategory = 
  | 'identity'      // God, Jesus, Holy Spirit
  | 'people'        // Characters, groups
  | 'places'        // Geographic locations
  | 'time'          // Time expressions, sequences
  | 'actions'       // Verbs, commands
  | 'themes'        // Recurring themes
  | 'contrasts'     // Contrasts and comparisons
  | 'conclusions'   // Therefore, thus, etc.
  | 'custom';       // User-defined

/** Map from symbol to KeyWordCategory for pre-setting category when a symbol is chosen */
export const SYMBOL_CATEGORY_MAP: Record<SymbolKey, KeyWordCategory> = {
  triangle: 'identity', cross: 'identity', dove: 'identity', flame: 'identity', angel: 'identity', lamb: 'identity', anchor: 'identity', cloud: 'identity',
  person: 'people', peopleGroup: 'people', crown: 'people', prayer: 'people',
  obey: 'actions', chains: 'themes', liberty: 'themes', nationLand: 'places',
  star: 'themes', starOutline: 'themes', heart: 'themes', heartSparkle: 'themes', lightning: 'themes', skull: 'themes', shield: 'themes', scales: 'themes', key: 'themes', sun: 'themes', moon: 'themes', cup: 'themes', sword: 'themes',
  scroll: 'themes', book: 'themes', tablet: 'themes', lamp: 'themes',
  clock: 'time', calendar: 'time', hourglass: 'time', arrowRight: 'conclusions', arrowLeft: 'time', doubleArrow: 'contrasts',
  mapPin: 'places', mountain: 'places', globe: 'places', tree: 'places', river: 'places', house: 'places', temple: 'places', city: 'places',
  water: 'actions', fire: 'actions', check: 'actions', x: 'actions', hand: 'actions', eye: 'actions', mouth: 'actions', foot: 'actions',
  ear: 'actions', megaphone: 'actions',
  circle: 'custom', square: 'custom', diamond: 'custom', hexagon: 'custom', plus: 'custom', minus: 'custom',
  sin: 'themes', vine: 'themes', bread: 'themes', trumpet: 'themes', rock: 'themes', door: 'themes', olive: 'themes', harvest: 'themes', fruit: 'themes',
  question: 'custom', exclamation: 'custom', asterisk: 'custom',
  letterA: 'custom', letterB: 'custom', letterC: 'custom', letterD: 'custom', letterE: 'custom', letterF: 'custom', letterG: 'custom', letterH: 'custom', letterI: 'custom', letterJ: 'custom', letterK: 'custom', letterL: 'custom', letterM: 'custom', letterN: 'custom', letterO: 'custom', letterP: 'custom', letterQ: 'custom', letterR: 'custom', letterS: 'custom', letterT: 'custom', letterU: 'custom', letterV: 'custom', letterW: 'custom', letterX: 'custom', letterY: 'custom', letterZ: 'custom',
  number0: 'custom', number1: 'custom', number2: 'custom', number3: 'custom', number4: 'custom', number5: 'custom', number6: 'custom', number7: 'custom', number8: 'custom', number9: 'custom',
};

/** Get KeyWordCategory for a symbol; use when pre-setting category from symbol selection */
export function getCategoryForSymbol(symbol: SymbolKey): KeyWordCategory {
  return SYMBOL_CATEGORY_MAP[symbol] ?? 'custom';
}

/** Common pronouns we avoid adding as variants (they’d match everywhere). Use "Apply key word" for that occurrence instead. */
const COMMON_PRONOUNS = new Set([
  'i', 'me', 'my', 'we', 'us', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'hers',
  'it', 'its', 'they', 'them', 'their', 'who', 'whom', 'whose', 'myself', 'yourself', 'himself',
  'herself', 'itself', 'ourselves', 'yourselves', 'themselves',
]);

/** True if the trimmed, lowercased text is a common pronoun. Used to hide "Add as variant" for pronouns. */
export function isCommonPronoun(text: string): boolean {
  const t = text.trim().toLowerCase();
  return t.length > 0 && COMMON_PRONOUNS.has(t);
}

/** Category display info */
export const KEY_WORD_CATEGORIES: Record<KeyWordCategory, { label: string; icon: string; description: string }> = {
  identity: {
    label: 'Identity',
    icon: '▲',
    description: 'God, Jesus Christ, Holy Spirit',
  },
  people: {
    label: 'People',
    icon: '👤',
    description: 'Characters, groups, nations',
  },
  places: {
    label: 'Places',
    icon: '📍',
    description: 'Geographic locations',
  },
  time: {
    label: 'Time',
    icon: '🕐',
    description: 'Time expressions, sequences',
  },
  actions: {
    label: 'Actions',
    icon: '→',
    description: 'Verbs, commands, instructions',
  },
  themes: {
    label: 'Themes',
    icon: '★',
    description: 'Recurring themes and concepts',
  },
  contrasts: {
    label: 'Contrasts',
    icon: '⇔',
    description: 'Contrasts and comparisons',
  },
  conclusions: {
    label: 'Conclusions',
    icon: '∴',
    description: 'Therefore, thus, for this reason',
  },
  custom: {
    label: 'Custom',
    icon: '◇',
    description: 'User-defined categories',
  },
};

/** Helper: Convert string array to Variant array (for backwards compatibility) */
export function normalizeVariants(variants: string[] | Variant[]): Variant[] {
  return variants.map(v => 
    typeof v === 'string' ? { text: v } : v
  );
}

/** Helper: Get variant text strings from Variant array */
export function getVariantTexts(variants: Variant[]): string[] {
  return variants.map(v => v.text);
}

/** Preset key words based on Precept method (use as partials for createMarkingPreset) */
export const PRESET_KEY_WORDS: Partial<MarkingPreset>[] = [
  { word: 'God', variants: normalizeVariants(['God\'s', 'LORD', 'Lord', 'Yahweh', 'YHWH', 'Jehovah']), symbol: 'triangle', highlight: { style: 'highlight', color: 'purple' }, category: 'identity', description: 'References to God the Father', autoSuggest: true },
  { word: 'Jesus', variants: normalizeVariants(['Christ', 'Jesus Christ', 'Messiah', 'Son of God', 'Son of Man', 'Lamb']), symbol: 'cross', highlight: { style: 'highlight', color: 'red' }, category: 'identity', description: 'References to Jesus Christ', autoSuggest: true },
  { word: 'Spirit', variants: normalizeVariants(['Holy Spirit', 'Spirit of God', 'Spirit of the Lord']), symbol: 'dove', highlight: { style: 'highlight', color: 'sky' }, category: 'identity', description: 'References to the Holy Spirit', autoSuggest: true },
  { word: 'therefore', variants: normalizeVariants(['thus', 'so', 'for this reason', 'because of this']), symbol: 'arrowRight', highlight: { style: 'highlight', color: 'orange' }, category: 'conclusions', description: 'Conclusion markers', autoSuggest: true },
  { word: 'love', variants: normalizeVariants(['loved', 'loves', 'loving']), symbol: 'heart', highlight: { style: 'highlight', color: 'pink' }, category: 'themes', description: 'Love-related terms', autoSuggest: true },
  { word: 'faith', variants: normalizeVariants(['believe', 'believed', 'believes', 'believing', 'trust']), symbol: 'shield', highlight: { style: 'highlight', color: 'blue' }, category: 'themes', description: 'Faith and belief', autoSuggest: true },
];

/** An exclusion record that suppresses a specific auto-matched keyword in a verse */
export interface KeywordExclusion {
  id: string;
  presetId: string;
  book: string;
  chapter: number;
  verse: number;
  /** Lowercase matched text for comparison */
  matchedText: string;
  studyId?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Result of searching for key word occurrences */
export interface KeyWordOccurrence {
  book: string;
  chapter: number;
  verse: number;
  text: string;           // The matched text
  context: string;        // Surrounding text for context
  annotationId?: string;  // If already marked, the annotation ID
}

/** Create a new marking preset (or key word when `word` is set) */
export function createMarkingPreset(
  options: { word?: string; variants?: string[] | Variant[]; symbol?: SymbolKey; highlight?: { style: 'highlight' | 'textColor' | 'underline'; color: HighlightColor }; category?: KeyWordCategory; description?: string; autoSuggest?: boolean; usageCount?: number; bookScope?: string; chapterScope?: number; moduleScope?: string; studyId?: string; caseSensitive?: boolean }
): MarkingPreset {
  const { word, variants = [], symbol, highlight, category = 'custom', description = '', autoSuggest = true, usageCount = 0, bookScope, chapterScope, moduleScope, studyId, caseSensitive } = options;
  if (!symbol && !highlight) throw new Error('MarkingPreset must have at least one of symbol or highlight');
  if (chapterScope !== undefined && !bookScope) throw new Error('chapterScope requires bookScope');
  return {
    id: crypto.randomUUID(),
    word,
    variants: normalizeVariants(variants),
    symbol,
    highlight,
    category,
    description,
    autoSuggest,
    usageCount,
    bookScope,
    chapterScope,
    moduleScope,
    studyId,
    caseSensitive,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Check if text matches a preset's word/variants (case-insensitive). Presets without word never match. */
export function matchesPreset(text: string, preset: MarkingPreset, verseRef?: { book: string; chapter: number }): boolean {
  const w = preset.word;
  if (!w) return false;
  const lowerText = text.toLowerCase().trim();
  if (lowerText === w.toLowerCase()) return true;
  return (preset.variants || []).some(v => {
    const variantText = typeof v === 'string' ? v : v.text;
    if (lowerText !== variantText.toLowerCase()) return false;
    
    // If variant has scope, check if it applies to the current verse
    if (typeof v === 'object' && verseRef) {
      // Global variant (no scope) - applies everywhere
      if (!v.bookScope) return true;
      
      // Book-scoped - check if book matches
      if (v.bookScope !== verseRef.book) return false;
      
      // If chapter-scoped, check chapter matches
      if (v.chapterScope !== undefined) {
        return v.chapterScope === verseRef.chapter;
      }
      
      // Book-scoped but not chapter-scoped - applies to all chapters in that book
      return true;
    }
    
    // No verseRef provided or old string variant - match anyway
    return true;
  });
}

/** Find presets whose word/variants match the given text (for auto-suggest) */
export function findMatchingPresets(text: string, presets: MarkingPreset[]): MarkingPreset[] {
  return presets.filter(p => matchesPreset(text, p));
}

/**
 * Migrate a legacy KeyWordDefinition to MarkingPreset.
 * symbol+color → symbol + highlight:{ style:'highlight', color }; symbol-only or color-only preserved.
 * Converts string[] variants to Variant[].
 */
export function keyWordToMarkingPreset(kw: KeyWordDefinition): MarkingPreset {
  const highlight = kw.color ? { style: 'highlight' as const, color: kw.color } : undefined;
  return {
    id: kw.id,
    word: kw.word,
    variants: (kw.variants || []).map(v => typeof v === 'string' ? { text: v } : v),
    symbol: kw.symbol,
    highlight,
    category: kw.category,
    description: kw.description,
    autoSuggest: kw.autoSuggest ?? true,
    usageCount: kw.usageCount || 0,
    createdAt: kw.createdAt,
    updatedAt: kw.updatedAt,
  };
}
