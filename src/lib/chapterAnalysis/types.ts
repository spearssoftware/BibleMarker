/**
 * Types for the chapter-analysis module.
 *
 * Pure, deterministic types shared by the tokenizer, repetition finder, and
 * connector lens. Thresholds are injected everywhere rather than hardcoded so
 * they can be tuned remotely without a code change.
 */

import type { VerseRef } from '@/types';

export interface AnalysisVerse {
  ref: VerseRef;
  text: string;
}

export interface TokenOccurrence {
  verse: number;
  start: number;
  end: number;
}

export interface RepetitionResult {
  /** Normalized token (singularized, lowercased). NEVER rendered to the DOM. */
  token: string;
  count: number;
  firstVerse: number;
  lastVerse: number;
  occurrences: TokenOccurrence[];
}

export type ConnectorCategory = 'contrast' | 'conclusion' | 'condition' | 'purpose' | 'cause';

export interface ConnectorHit {
  phrase: string;
  category: ConnectorCategory;
  verse: number;
  start: number;
  end: number;
}

export interface ChapterAnalysis {
  repetition: RepetitionResult | null;
  connectors: ConnectorHit[];
  connectorRangesByVerse: Map<number, ConnectorHit[]>;
}

export interface DiscoveryThresholds {
  repetitionMinCount: number;
  repetitionMinWordLength: number;
  connectorChipMinCount: number;
}

export const DEFAULT_DISCOVERY_THRESHOLDS: DiscoveryThresholds = {
  repetitionMinCount: 5,
  repetitionMinWordLength: 4,
  connectorChipMinCount: 1,
};
