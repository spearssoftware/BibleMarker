/**
 * Key Word Types
 * 
 * Definitions for the Precept method key word tracking system.
 * Allows marking words/phrases consistently throughout study.
 */

import type { HighlightColor, SymbolKey } from './annotation';

/** A key word definition that can be applied consistently */
export interface KeyWordDefinition {
  id: string;
  
  /** The primary word or phrase (e.g., "God", "LORD", "love") */
  word: string;
  
  /** Alternative forms that should also match (e.g., "God's", "Lord") */
  variants: string[];
  
  /** Symbol to mark this key word with */
  symbol?: SymbolKey;
  
  /** Color for highlighting or symbol */
  color?: HighlightColor;
  
  /** Category for organizing key words */
  category?: KeyWordCategory;
  
  /** User notes about this key word */
  description?: string;
  
  /** Whether to auto-suggest when selecting matching text */
  autoSuggest: boolean;
  
  /** Count of how many times this key word has been marked */
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

/** Preset key words based on Precept method */
export const PRESET_KEY_WORDS: Partial<KeyWordDefinition>[] = [
  {
    word: 'God',
    variants: ['God\'s', 'LORD', 'Lord', 'Yahweh', 'YHWH', 'Jehovah'],
    symbol: 'triangle',
    color: 'purple',
    category: 'identity',
    description: 'References to God the Father',
    autoSuggest: true,
  },
  {
    word: 'Jesus',
    variants: ['Christ', 'Jesus Christ', 'Messiah', 'Son of God', 'Son of Man', 'Lamb'],
    symbol: 'cross',
    color: 'red',
    category: 'identity',
    description: 'References to Jesus Christ',
    autoSuggest: true,
  },
  {
    word: 'Spirit',
    variants: ['Holy Spirit', 'Spirit of God', 'Spirit of the Lord'],
    symbol: 'dove',
    color: 'sky',
    category: 'identity',
    description: 'References to the Holy Spirit',
    autoSuggest: true,
  },
  {
    word: 'therefore',
    variants: ['thus', 'so', 'for this reason', 'because of this'],
    symbol: 'arrowRight',
    color: 'orange',
    category: 'conclusions',
    description: 'Conclusion markers',
    autoSuggest: true,
  },
  {
    word: 'love',
    variants: ['loved', 'loves', 'loving'],
    symbol: 'heart',
    color: 'pink',
    category: 'themes',
    description: 'Love-related terms',
    autoSuggest: true,
  },
  {
    word: 'faith',
    variants: ['believe', 'believed', 'believes', 'believing', 'trust'],
    symbol: 'shield',
    color: 'blue',
    category: 'themes',
    description: 'Faith and belief',
    autoSuggest: true,
  },
];

/** Result of searching for key word occurrences */
export interface KeyWordOccurrence {
  book: string;
  chapter: number;
  verse: number;
  text: string;           // The matched text
  context: string;        // Surrounding text for context
  annotationId?: string;  // If already marked, the annotation ID
}

/** Create a new key word definition */
export function createKeyWord(
  word: string,
  options: Partial<Omit<KeyWordDefinition, 'id' | 'word' | 'createdAt' | 'updatedAt'>> = {}
): KeyWordDefinition {
  return {
    id: crypto.randomUUID(),
    word,
    variants: options.variants || [],
    symbol: options.symbol,
    color: options.color,
    category: options.category || 'custom',
    description: options.description || '',
    autoSuggest: options.autoSuggest ?? true,
    usageCount: options.usageCount || 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/** Check if text matches a key word (case-insensitive) */
export function matchesKeyWord(text: string, keyWord: KeyWordDefinition): boolean {
  const lowerText = text.toLowerCase().trim();
  const lowerWord = keyWord.word.toLowerCase();
  
  if (lowerText === lowerWord) return true;
  
  for (const variant of keyWord.variants) {
    if (lowerText === variant.toLowerCase()) return true;
  }
  
  return false;
}

/** Find all key words that match the given text */
export function findMatchingKeyWords(text: string, keyWords: KeyWordDefinition[]): KeyWordDefinition[] {
  return keyWords.filter(kw => matchesKeyWord(text, kw));
}
