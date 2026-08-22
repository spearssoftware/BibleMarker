/**
 * HingesCard — Connector Lens (replaces the old `ConnectorChip` + `ConnectorPrompt`)
 *
 * "{n} hinges in this chapter" with a toggle that lights the connectors in
 * the text, plus a list of every hinge grouped by verse. Tapping a row jumps
 * the reader there and expands the row's Socratic prompt; tapping a lit
 * connector in the text (lens on) sets the same `activePrompt` and opens
 * this panel, so the effect below scrolls the matching row into view. The
 * scroll is delayed to survive MultiTranslationView's layout re-key after
 * the panel opens.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, ToggleSwitch } from '@/components/shared';
import { DiscoveryCard } from './DiscoveryCard';
import { useDiscoveryStore } from '@/stores/discoveryStore';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { useBibleStore } from '@/stores/bibleStore';
import { LAYOUT_REKEY_MS } from '@/components/BibleReader/layoutConstants';
import { toast } from '@/stores/toastStore';
import { track } from '@/lib/telemetry';
import { pluralize } from '@/lib/textUtils';
import { addConnectorToFlow } from '@/lib/discoveryActions';
import { promptFor, type ConnectorHit } from '@/lib/chapterAnalysis';

interface HingesCardProps {
  connectorRangesByVerse: Map<number, ConnectorHit[]>;
  hingeCount: number;
  book: string;
  chapter: number;
}

function rowKey(hit: ConnectorHit): string {
  return `${hit.verse}-${hit.start}`;
}

function pendingKeyFor(hit: ConnectorHit): string {
  return `${hit.verse}:${hit.start}`;
}

export function HingesCard({ connectorRangesByVerse, hingeCount, book, chapter }: HingesCardProps) {
  const lensActive = useDiscoveryStore(s => s.lensActive);
  const toggleLens = useDiscoveryStore(s => s.toggleLens);
  const activePrompt = useDiscoveryStore(s => s.activePrompt);
  const setActivePrompt = useDiscoveryStore(s => s.setActivePrompt);
  const inductiveToolsEnabled = usePreferencesStore(s => s.inductiveToolsEnabled);
  const navigateToVerse = useBibleStore(s => s.navigateToVerse);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pendingKey, setPendingKey] = useState<string | null>(null);

  const verses = useMemo(
    () => Array.from(connectorRangesByVerse.keys()).sort((a, b) => a - b),
    [connectorRangesByVerse]
  );

  useEffect(() => {
    if (!activePrompt) return;
    const key = rowKey(activePrompt);
    // +50ms past MultiTranslationView's layout re-key so the row has settled into its final position before we scroll to it.
    const timer = setTimeout(() => {
      const el = containerRef.current?.querySelector(`[data-hinge-row="${key}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, LAYOUT_REKEY_MS + 50);
    return () => clearTimeout(timer);
  }, [activePrompt]);

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
    const key = pendingKeyFor(hit);
    setPendingKey(key);
    try {
      await addConnectorToFlow(hit, book, chapter);
    } catch (err) {
      console.error('[HingesCard] Failed to add connector to Flow:', err);
      toast.error("Couldn't add to Flow.");
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <DiscoveryCard title={`${pluralize(hingeCount, 'hinge')} in this chapter`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-scripture-text">Show hinges in the text</span>
        <ToggleSwitch checked={lensActive} onChange={handleToggleLens} label="Show hinges in the text" />
      </div>
      <div ref={containerRef} className="space-y-1">
        {verses.map(verseNum =>
          (connectorRangesByVerse.get(verseNum) ?? []).map(hit => {
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
                  <span className="text-xs text-scripture-muted capitalize">{hit.category}</span>
                </button>
                {active && (
                  <div id={promptId} className="px-2 pb-2 space-y-2">
                    <p className="text-sm text-scripture-text">{promptFor(hit)}</p>
                    {inductiveToolsEnabled && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleAddToFlow(hit)}
                        disabled={pendingKey === pendingKeyFor(hit)}
                      >
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
