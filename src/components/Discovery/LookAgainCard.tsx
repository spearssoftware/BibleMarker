/**
 * LookAgainCard — the Look-Again checklist
 *
 * Renders `useLookAgain`'s 3-5 auto-generated items as read-only checkbox
 * rows (`role="checkbox"`/`aria-checked`, not a real `<input>` — nothing
 * here is directly togglable, the marks themselves check items off).
 * Tapping an undone row jumps the reader to the card that can satisfy it:
 * repetition/person/place/hinge rows scroll the matching card into view via
 * an id anchor passed down from `DiscoveryPanel`; the title row instead
 * dispatches `openChapterTitleCreator` (handled in `MultiTranslationView`,
 * same window-event pattern as `openObservationTools`). Done rows are inert
 * — muted text plus a checkmark, no click handler.
 *
 * When every shown item is done and inductive tools are off, a one-line
 * footer nudges toward the full toolkit (progressive disclosure, brief §5).
 */

import { usePreferencesStore } from '@/stores/preferencesStore';
import { DiscoveryCard } from './DiscoveryCard';
import type { LookAgainItem } from '@/hooks/useLookAgain';

export interface LookAgainAnchors {
  repetition?: string;
  hinge?: string;
  peoplePlaces?: string;
}

interface LookAgainCardProps {
  items: LookAgainItem[];
  anchors: LookAgainAnchors;
}

function anchorIdFor(item: LookAgainItem, anchors: LookAgainAnchors): string | undefined {
  switch (item.id) {
    case 'repetition':
      return anchors.repetition;
    case 'hinge':
      return anchors.hinge;
    case 'person':
    case 'place':
      return anchors.peoplePlaces;
    default:
      return undefined;
  }
}

export function LookAgainCard({ items, anchors }: LookAgainCardProps) {
  const inductiveToolsEnabled = usePreferencesStore(s => s.inductiveToolsEnabled);

  if (items.length === 0) return null;

  const allDone = items.every(i => i.done);

  const activate = (item: LookAgainItem) => {
    if (item.done) return;
    if (item.id === 'title') {
      window.dispatchEvent(new CustomEvent('openChapterTitleCreator'));
      return;
    }
    const id = anchorIdFor(item, anchors);
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <DiscoveryCard title="Look again">
      <div role="group" aria-label="Look-again checklist" className="space-y-0.5">
        {items.map(item => (
          <div
            key={item.id}
            role="checkbox"
            aria-checked={item.done}
            tabIndex={item.done ? -1 : 0}
            onClick={() => activate(item)}
            onKeyDown={e => {
              if (item.done) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                activate(item);
              }
            }}
            className={`flex items-start gap-2 px-2 py-1.5 rounded text-sm ${
              item.done
                ? 'text-scripture-muted'
                : 'text-scripture-text cursor-pointer hover:bg-scripture-elevated'
            }`}
          >
            <span
              aria-hidden="true"
              className="mt-0.5 flex-shrink-0 w-4 h-4 rounded border border-scripture-border flex items-center justify-center text-[10px] leading-none"
            >
              {item.done ? '✓' : ''}
            </span>
            <span>{item.label}</span>
          </div>
        ))}
      </div>
      {allDone && !inductiveToolsEnabled && (
        <p className="text-xs text-scripture-muted pt-1 mt-1 border-t border-scripture-border">
          You&rsquo;ve seen what&rsquo;s here. Want the full toolkit? Settings → Bible → Inductive study tools.
        </p>
      )}
    </DiscoveryCard>
  );
}
