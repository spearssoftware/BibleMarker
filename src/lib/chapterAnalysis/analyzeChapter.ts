/**
 * Chapter analysis - runs Repetition Radar and Connector Lens once over a
 * chapter's raw verse text. Pure and deterministic; no store imports.
 */

import { findRepetition } from './repetition';
import { findConnectors, groupConnectorsByVerse } from './connectors';
import { DEFAULT_DISCOVERY_THRESHOLDS } from './types';
import type { AnalysisVerse, ChapterAnalysis, DiscoveryThresholds } from './types';

export function analyzeChapter(verses: AnalysisVerse[], thresholds: DiscoveryThresholds = DEFAULT_DISCOVERY_THRESHOLDS): ChapterAnalysis {
  const repetition = findRepetition(verses, thresholds);
  const connectors = findConnectors(verses);
  const connectorRangesByVerse = groupConnectorsByVerse(connectors);

  return { repetition, connectors, connectorRangesByVerse };
}
