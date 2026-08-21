/**
 * HingesCard — Connector Lens (replaces the old `ConnectorChip` + `ConnectorPrompt`)
 *
 * "{n} hinges in this chapter" with a toggle that lights the connectors in
 * the text, plus a list of every hinge grouped by verse. Tapping a row jumps
 * the reader there and expands the row's Socratic prompt; tapping a lit
 * connector in the text (lens on) sets the same `activePrompt` and opens
 * this panel, so the effect below scrolls the matching row into view. The
 * scroll is delayed to survive MultiTranslationView's ~350ms layout re-key
 * after the panel opens.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ToggleSwitch } from '@/components/shared';
import { DiscoveryCard } from './DiscoveryCard';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useBibleStore } from '@/stores/bibleStore';
import { track } from '@/lib/telemetry';
import { pluralize } from '@/lib/textUtils';
import { addConnectorToFlow } from '@/lib/discoveryActions';
import { groupConnectorsByVerse, promptFor, type ConnectorHit } from '@/lib/chapterAnalysis';

interface HingesCardProps {
  connectors: ConnectorHit[];
  minCount: number;
  book: string;
  chapter: number;
}

const SCROLL_DELAY_MS = 400;

function rowKey(hit: ConnectorHit): string {
  return `${hit.verse}-${hit.start}`;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

export function HingesCard({ connectors, minCount, book, chapter }: HingesCardProps) {
  const lensActive = useDiscoveryStore(s => s.lensActive);
  const toggleLens = useDiscoveryStore(s => s.toggleLens);
  const activePrompt = useDiscoveryStore(s => s.activePrompt);
  const setActivePrompt = useDiscoveryStore(s => s.setActivePrompt);
  const inductiveToolsEnabled = usePreferencesStore(s => s.inductiveToolsEnabled);
  const navigateToVerse = useBibleStore(s => s.navigateToVerse);
  const containerRef = useRef<HTMLDivElement>(null);
  const [addingToFlow, setAddingToFlow] = useState(false);

  const grouped = useMemo(() => groupConnectorsByVerse(connectors), [connectors]);
  const verses = useMemo(() => Array.from(grouped.keys()).sort((a, b) => a - b), [grouped]);

  useEffect(() => {
    if (!activePrompt) return;
    const key = rowKey(activePrompt);
    const timer = setTimeout(() => {
      const el = containerRef.current?.querySelector(`[data-hinge-row="${key}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, SCROLL_DELAY_MS);
    return () => clearTimeout(timer);
  }, [activePrompt]);

  if (connectors.length < minCount) return null;

  const handleToggleLens = () => {
    track('lens_toggled', { feature: 'connector' });
    toggleLens();
  };

  const isRowActive = (hit: ConnectorHit) =>
    activePrompt?.verse === hit.verse && activePrompt?.start === hit.start;

  const handleRowTap = (hit: ConnectorHit) => {
    if (isRowActive(hit)) {
      setActivePrompt(null);
      return;
    }
    navigateToVerse(book, chapter, hit.verse);
    setActivePrompt(hit);
  };

  const handleAddToFlow = async (hit: ConnectorHit) => {
    setAddingToFlow(true);
    try {
      await addConnectorToFlow(hit, book, chapter);
    } catch (err) {
      console.error('[HingesCard] Failed to add connector to Flow:', err);
    } finally {
      setAddingToFlow(false);
    }
  };

  return (
    <DiscoveryCard title={`${pluralize(connectors.length, 'hinge')} in this chapter`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-scripture-text">Show hinges in the text</span>
        <ToggleSwitch checked={lensActive} onChange={handleToggleLens} label="Show hinges in the text" />
      </div>
      <div ref={containerRef} className="space-y-1">
        {verses.map(verseNum =>
          (grouped.get(verseNum) ?? []).map(hit => {
            const active = isRowActive(hit);
            const promptId = `hinge-prompt-${rowKey(hit)}`;
            return (
              <div key={rowKey(hit)} data-hinge-row={rowKey(hit)}>
                <button
                  type="button"
                  onClick={() => handleRowTap(hit)}
                  aria-expanded={active}
                  aria-controls={promptId}
                  className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded hover:bg-scripture-elevated text-sm"
                >
                  <span className="text-scripture-muted">v.{hit.verse}</span>
                  <span className="text-scripture-text font-medium">&ldquo;{hit.phrase}&rdquo;</span>
                  <span className="text-xs text-scripture-muted">{capitalize(hit.category)}</span>
                </button>
                {active && (
                  <div id={promptId} className="px-2 pb-2 space-y-2">
                    <p className="text-sm text-scripture-text">{promptFor(hit)}</p>
                    {inductiveToolsEnabled && (
                      <Button variant="primary" size="sm" onClick={() => handleAddToFlow(hit)} disabled={addingToFlow}>
                        Add to Flow
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </DiscoveryCard>
  );
}
