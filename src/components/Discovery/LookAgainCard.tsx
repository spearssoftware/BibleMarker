/**
 * LookAgainCard — the Look-Again checklist
 *
 * Renders `useLookAgain`'s 3-5 auto-generated items as a list: undone items
 * are real buttons that jump the reader to the card that can satisfy them
 * (repetition/person/place/hinge rows scroll the matching card into view via
 * an id anchor passed down from `DiscoveryPanel`; the title row instead
 * dispatches `openChapterTitleCreator`, handled in `MultiTranslationView`,
 * same window-event pattern as `openObservationTools`). Done rows are static
 * content — muted text plus a checkmark and a visually-hidden "done" for
 * screen readers.
 *
 * Renders nothing until `useLookAgain` reports `ready` — the pre-load item
 * set would otherwise flash a premature all-done state.
 *
 * When every shown item is done and inductive tools are off, a footer nudges
 * toward the full toolkit (progressive disclosure, brief §5) with a button
 * that opens Settings → Bible directly.
 */

import { usePreferencesStore } from '@/stores/preferencesStore';
import { usePanelStore } from '@/stores/panelStore';
import { Button } from '@/components/shared';
import { DiscoveryCard } from './DiscoveryCard';
import type { LookAgainItem } from '@/hooks/useLookAgain';

export interface LookAgainAnchors {
  repetition?: string;
  hinge?: string;
  peoplePlaces?: string;
}

interface LookAgainCardProps {
  items: LookAgainItem[];
  ready: boolean;
  anchors: LookAgainAnchors;
}

/**
 * Which `LookAgainAnchors` key (if any) an item's undone row should scroll
 * to. A `Record` keyed by the full `LookAgainItem['id']` union — rather than
 * a `switch` with a `default` — so adding a new item id fails to compile
 * here until this map says where it scrolls (`null` for 'title', which
 * dispatches `openChapterTitleCreator` instead of scrolling).
 */
const ANCHOR_KEY_FOR_ITEM: Record<LookAgainItem['id'], keyof LookAgainAnchors | null> = {
  repetition: 'repetition',
  hinge: 'hinge',
  person: 'peoplePlaces',
  place: 'peoplePlaces',
  title: null,
};

function anchorIdFor(item: LookAgainItem, anchors: LookAgainAnchors): string | undefined {
  const key = ANCHOR_KEY_FOR_ITEM[item.id];
  return key ? anchors[key] : undefined;
}

const ROW_CLASSES = 'flex items-start gap-2 px-2 py-1.5 rounded text-sm';
const CHECK_CLASSES =
  'mt-0.5 flex-shrink-0 w-4 h-4 rounded border border-scripture-border flex items-center justify-center text-[10px] leading-none';

export function LookAgainCard({ items, ready, anchors }: LookAgainCardProps) {
  const inductiveToolsEnabled = usePreferencesStore(s => s.inductiveToolsEnabled);
  const openPanel = usePanelStore(s => s.openPanel);

  // `ready` (see useLookAgain.ts) already implies items.length > 0.
  if (!ready) return null;

  const allDone = items.every(i => i.done);

  const activate = (item: LookAgainItem) => {
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
      <ul aria-label="Look-again checklist" className="list-none space-y-0.5">
        {items.map(item => (
          <li key={item.id}>
            {item.done ? (
              <div className={`${ROW_CLASSES} text-scripture-muted`}>
                <span aria-hidden="true" className={CHECK_CLASSES}>
                  ✓
                </span>
                <span>
                  {item.label}
                  <span className="sr-only"> (done)</span>
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => activate(item)}
                className={`${ROW_CLASSES} w-full text-left text-scripture-text cursor-pointer hover:bg-scripture-elevated`}
              >
                <span aria-hidden="true" className={CHECK_CLASSES} />
                <span>{item.label}</span>
              </button>
            )}
          </li>
        ))}
      </ul>
      {allDone && !inductiveToolsEnabled && (
        <div className="pt-1 mt-1 border-t border-scripture-border">
          <p className="text-xs text-scripture-muted">You&rsquo;ve seen what&rsquo;s here. Want the full toolkit?</p>
          <Button
            variant="ghost"
            size="sm"
            className="mt-1"
            onClick={() => openPanel('settings', { settingsInitialTab: 'bible' })}
          >
            Turn on inductive tools
          </Button>
        </div>
      )}
    </DiscoveryCard>
  );
}
