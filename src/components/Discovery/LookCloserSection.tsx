/**
 * LookCloserSection — collapsible home for the analytic cards.
 *
 * Children (Repetition, Connectors, Look-Again, with their scroll-anchor
 * divs) render only while open, with no transition so a hydration flip
 * doesn't animate. Open state comes from `useLookCloserState`; a toggle
 * stores the reader's choice on this device, and is disabled while an active
 * prompt or lens holds the section open.
 */

import type { ReactNode } from 'react';
import { useLookCloserState } from '@/hooks/useLookCloserState';
import { useDiscoveryPrefsStore } from '@/stores/discoveryPrefsStore';
import { trackChip } from './discoveryTelemetry';

interface LookCloserSectionProps {
  book: string;
  chapter: number;
  translationId: string;
  children: ReactNode;
}

export function LookCloserSection({ book, chapter, translationId, children }: LookCloserSectionProps) {
  const { open: isOpen, locked } = useLookCloserState();
  const setLookCloserOpen = useDiscoveryPrefsStore(s => s.setLookCloserOpen);

  const handleToggle = () => {
    if (locked) return;
    trackChip('discovery_chip_tapped', 'look_closer', { book, chapter, translationId });
    setLookCloserOpen(!isOpen);
  };

  return (
    <section className="space-y-3">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={handleToggle}
        disabled={locked}
        className="w-full flex items-center justify-between px-1 text-sm font-ui font-semibold text-scripture-text"
      >
        <span>Look closer</span>
        <span aria-hidden="true" className="text-scripture-muted">{isOpen ? '▾' : '▸'}</span>
      </button>
      {isOpen && children}
    </section>
  );
}
