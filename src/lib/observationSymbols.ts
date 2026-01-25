/**
 * Symbol-to-Tracker Mapping Configuration
 * 
 * Maps symbols used in marking to their corresponding observation trackers.
 * When a symbol is applied, users can be prompted to add an observation to the relevant tracker.
 */

import type { SymbolKey } from '@/types/annotation';

export type ObservationTrackerType = 
  | 'contrast'      // Contrasts and Comparisons
  | 'time'          // Time Expressions
  | 'place'         // Geographic Locations
  | 'conclusion'    // Conclusion Terms
  | 'lists';        // Observation Lists (general)

export interface SymbolTrackerMapping {
  symbol: SymbolKey;
  tracker: ObservationTrackerType;
  label: string;
  description: string;
}

/**
 * Mapping of symbols to their observation trackers
 */
export const SYMBOL_TRACKER_MAPPING: SymbolTrackerMapping[] = [
  {
    symbol: 'doubleArrow',
    tracker: 'contrast',
    label: 'Contrasts & Comparisons',
    description: 'Record contrasts and comparisons between ideas, people, or concepts',
  },
  {
    symbol: 'clock',
    tracker: 'time',
    label: 'Time Expressions',
    description: 'Track chronological sequences and time references',
  },
  {
    symbol: 'calendar',
    tracker: 'time',
    label: 'Time Expressions',
    description: 'Track chronological sequences and time references',
  },
  {
    symbol: 'hourglass',
    tracker: 'time',
    label: 'Time Expressions',
    description: 'Track chronological sequences and time references',
  },
  {
    symbol: 'mapPin',
    tracker: 'place',
    label: 'Geographic Locations',
    description: 'Record and track places mentioned in the text',
  },
  {
    symbol: 'mountain',
    tracker: 'place',
    label: 'Geographic Locations',
    description: 'Record and track places mentioned in the text',
  },
  {
    symbol: 'city',
    tracker: 'place',
    label: 'Geographic Locations',
    description: 'Record and track places mentioned in the text',
  },
  {
    symbol: 'arrowRight',
    tracker: 'conclusion',
    label: 'Conclusion Terms',
    description: 'Track logical flow of conclusions and therefore statements',
  },
];

/**
 * Get the tracker mapping for a given symbol
 */
export function getTrackerForSymbol(symbol: SymbolKey): SymbolTrackerMapping | undefined {
  return SYMBOL_TRACKER_MAPPING.find(mapping => mapping.symbol === symbol);
}

/**
 * Get all symbols that map to a specific tracker type
 */
export function getSymbolsForTracker(tracker: ObservationTrackerType): SymbolKey[] {
  return SYMBOL_TRACKER_MAPPING
    .filter(mapping => mapping.tracker === tracker)
    .map(mapping => mapping.symbol);
}

/**
 * Check if a symbol has a tracker mapping
 */
export function hasTrackerMapping(symbol: SymbolKey): boolean {
  return SYMBOL_TRACKER_MAPPING.some(mapping => mapping.symbol === symbol);
}
