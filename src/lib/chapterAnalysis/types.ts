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
  /** Normalized token (singularized, lowercased) — the matching key, not display text. */
  token: string;
  /**
   * The word for display: the first occurrence of its base form (original
   * casing, punctuation trimmed), or the first occurrence of any form when
   * the chapter only uses plurals or possessives.
   */
  display: string;
  count: number;
  firstVerse: number;
  lastVerse: number;
  occurrences: TokenOccurrence[];
  /**
   * Distinct raw surface forms (lowercased, punctuation-trimmed via
   * `normalizeForMatching`, pre-singularization) that tallied into this
   * token, in order of first appearance - e.g. ["word", "words"].
   */
  forms: string[];
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
  /** Part of the remote-config shape (see `feature-flags.ts`); no longer read by the app. */
  headingMinVerses: number;
  /** Minimum cross-reference votes for a verse to surface a cross-reference hint. */
  crossRefMinVotes: number;
}

export const DEFAULT_DISCOVERY_THRESHOLDS: DiscoveryThresholds = {
  repetitionMinCount: 5,
  repetitionMinWordLength: 3,
  connectorChipMinCount: 1,
  headingMinVerses: 10,
  crossRefMinVotes: 20,
};
