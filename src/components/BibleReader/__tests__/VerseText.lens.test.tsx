/**
 * @vitest-environment jsdom
 *
 * Connector Lens render pass: every text segment in the verse must end up
 * wrapped in either `.lens-connector` (a hinge word, carrying its data
 * attrs back out for the click handler) or `.lens-dim` (everything else) —
 * including a segment that already carries a real annotation. A missed push
 * site would leave an undimmed island of plain text.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { VerseText } from '../VerseText';
import type { Verse, TextAnnotation, SymbolAnnotation } from '@/types';
import type { ConnectorHit } from '@/lib/chapterAnalysis';

vi.mock('@/lib/database', () => ({
  getPreferences: vi.fn(async () => ({})),
  getAllMarkingPresets: vi.fn(async () => []),
  saveMarkingPreset: vi.fn(async () => {}),
  deleteMarkingPreset: vi.fn(async () => {}),
  searchMarkingPresets: vi.fn(async () => []),
  incrementMarkingPresetUsage: vi.fn(async () => {}),
  pruneTrackersForPreset: vi.fn(async () => {}),
  getAllStudies: vi.fn(async () => []),
  saveStudy: vi.fn(async () => {}),
  deleteStudy: vi.fn(async () => {}),
  getAllKeywordExclusions: vi.fn(async () => []),
  saveKeywordExclusion: vi.fn(async () => {}),
  deleteKeywordExclusion: vi.fn(async () => {}),
  deleteKeywordExclusionsByPreset: vi.fn(async () => {}),
}));

afterEach(() => {
  cleanup();
});

describe('VerseText — Connector Lens', () => {
  it('wraps every segment in .lens-dim or .lens-connector, including an already-annotated one', () => {
    const text = 'Therefore we love because God first loved us.';
    const thereforeEnd = 'Therefore'.length;
    const loveStart = text.indexOf('love');
    const loveEnd = loveStart + 'love'.length;
    const godStart = text.indexOf('God');
    const godEnd = godStart + 'God'.length;

    const verse: Verse = { ref: { book: 'Rom', chapter: 5, verse: 1 }, text };

    const annotation: TextAnnotation = {
      id: 'ann-1',
      moduleId: 'sword-NASB',
      type: 'highlight',
      startRef: verse.ref,
      endRef: verse.ref,
      startOffset: loveStart,
      endOffset: loveEnd,
      color: 'yellow',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const symbol: SymbolAnnotation = {
      id: 'sym-1',
      moduleId: 'sword-NASB',
      type: 'symbol',
      ref: verse.ref,
      position: 'center',
      symbol: 'triangle',
      startOffset: godStart,
      endOffset: godEnd,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const hit: ConnectorHit = { phrase: 'Therefore', category: 'conclusion', verse: 1, start: 0, end: thereforeEnd };

    const { container } = render(
      <VerseText
        verse={verse}
        annotations={[annotation, symbol]}
        moduleId="sword-NASB"
        lens={{ ranges: [hit], onConnectorTap: vi.fn() }}
      />
    );

    const verseContent = container.querySelector('.verse-content');
    expect(verseContent).toBeTruthy();

    // No bare, unwrapped text should have leaked directly under .verse-content.
    const strayText = Array.from(verseContent!.childNodes).filter(
      (n) => n.nodeType === Node.TEXT_NODE && !!n.textContent?.trim()
    );
    expect(strayText.length).toBe(0);

    const topLevelSpans = Array.from(verseContent!.children);
    expect(topLevelSpans.length).toBeGreaterThan(0);
    for (const span of topLevelSpans) {
      expect(span.classList.contains('lens-dim') || span.classList.contains('lens-connector')).toBe(true);
    }

    const connectorEl = verseContent!.querySelector('.lens-connector');
    expect(connectorEl).toBeTruthy();
    expect(connectorEl!.textContent).toBe('Therefore');
    expect(connectorEl!.getAttribute('data-connector-verse')).toBe('1');
    expect(connectorEl!.getAttribute('data-connector-start')).toBe('0');
    expect(connectorEl!.getAttribute('data-connector-end')).toBe(String(thereforeEnd));
    expect(connectorEl!.getAttribute('data-connector-phrase')).toBe('Therefore');
    expect(connectorEl!.getAttribute('data-connector-category')).toBe('conclusion');

    // The pre-existing highlight on "love" is not a connector, so it must
    // still be dimmed — wrapped in .lens-dim rather than skipped.
    const dimmedAnnotation = verseContent!.querySelector('.lens-dim .annotation-group');
    expect(dimmedAnnotation).toBeTruthy();

    // The symbol on "God" (the third `htmlSegments.push` site) isn't a
    // connector either, so it must also be dimmed rather than left bright
    // or dropped.
    const dimmedSymbol = verseContent!.querySelector('.lens-dim .symbol-inline');
    expect(dimmedSymbol).toBeTruthy();
  });
});
