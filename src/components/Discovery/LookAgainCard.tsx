/**
 * LookAgainCard — the Look-Again checklist
 *
 * Renders `useLookAgain`'s auto-generated items as a list: undone items are
 * either a button that jumps the reader to the card that can satisfy them
 * (repetition/person/place/hinge rows scroll the matching card into view via
 * an id anchor passed down from `DiscoveryPanel`; the title row instead
 * dispatches `openChapterTitleCreator`, handled in `MultiTranslationView`,
 * same window-event pattern as `openObservationTools`) or, for 'heading'
 * (refinement C), a static row — there's no single card to jump to, so it
 * just names the how-to instead. Done rows are static content — muted text
 * plus a checkmark and a visually-hidden "done" for screen readers — and a
 * done person/place row may additionally carry a `followUp` upsell
 * (refinement A) to promote the reader's own hand-marked word to a key word
 * covering the whole chapter.
 *
 * Renders nothing until `useLookAgain` reports `ready` — the pre-load item
 * set would otherwise flash a premature all-done state.
 *
 * When every shown item is done and inductive tools are off, a footer nudges
 * toward the full toolkit (progressive disclosure, brief §5) with a button
 * that opens Settings → Bible directly.
 */

import { useState } from 'react';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { usePanelStore } from '@/stores/panelStore';
import { toast } from '@/stores/toastStore';
import { track } from '@/lib/telemetry';
import { Button } from '@/components/shared';
import { DiscoveryCard } from './DiscoveryCard';
import type { LookAgainFollowUp, LookAgainItem } from '@/hooks/useLookAgain';

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
 * What tapping an undone row does. A `Record` keyed by the full
 * `LookAgainItem['id']` union — rather than a `switch` with a `default` — so
 * adding a new item id fails to compile here until this map says how it
 * behaves: 'scroll' rows jump to an anchor (see `ANCHOR_KEY_FOR_ITEM`),
 * 'title-event' dispatches `openChapterTitleCreator`, and 'none' (currently
 * only 'heading') renders a static row instead of a button — there's no
 * single card a section heading could jump to.
 */
const ACTION_FOR_ITEM: Record<LookAgainItem['id'], 'scroll' | 'title-event' | 'none'> = {
  repetition: 'scroll',
  hinge: 'scroll',
  person: 'scroll',
  place: 'scroll',
  title: 'title-event',
  heading: 'none',
};

/** Which `LookAgainAnchors` key a 'scroll'-action item's undone row targets. */
const ANCHOR_KEY_FOR_ITEM: Record<LookAgainItem['id'], keyof LookAgainAnchors | null> = {
  repetition: 'repetition',
  hinge: 'hinge',
  person: 'peoplePlaces',
  place: 'peoplePlaces',
  title: null,
  heading: null,
};

/**
 * How-to copy for a 'none'-action undone row — an exhaustive `Record` (not a
 * single hardcoded paragraph) so a future 'none' item can't silently inherit
 * 'heading's text just by matching its action type. Must stay in sync with
 * the actual control: `VerseNumberMenu`'s verse-number sheet button reads
 * "Add Section Heading".
 */
const HOW_TO_FOR_ITEM: Record<LookAgainItem['id'], string | null> = {
  repetition: null,
  hinge: null,
  person: null,
  place: null,
  title: null,
  heading: 'Tap a verse number, then Add Section Heading.',
};

function anchorIdFor(item: LookAgainItem, anchors: LookAgainAnchors): string | undefined {
  const key = ANCHOR_KEY_FOR_ITEM[item.id];
  return key ? anchors[key] : undefined;
}

const ROW_CLASSES = 'flex items-start gap-2 px-2 py-1.5 rounded text-sm';
const CHECK_CLASSES =
  'mt-0.5 flex-shrink-0 w-4 h-4 rounded border border-scripture-border flex items-center justify-center text-[10px] leading-none';

/**
 * The person/place key-word upsell (refinement A) rendered under a done row.
 * Owns its own `pending` flag — same shape as `RepetitionCard`'s "Mark it"
 * button — since it's the only piece of local state a follow-up needs: once
 * `followUp.run()` succeeds, the new preset flows back through
 * `useLookAgain`'s own store subscriptions and the derivation hides this row
 * on its own (see `buildFollowUp`'s doc comment).
 */
function FollowUpRow({ followUp }: { followUp: LookAgainFollowUp }) {
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    track('discovery_chip_tapped', { feature: 'upsell' });
    setPending(true);
    try {
      await followUp.run();
      toast.success('Highlighted every mention in this chapter.');
    } catch (err) {
      console.error('[LookAgainCard] Follow-up action failed:', err);
      toast.error("Couldn't highlight it — try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="pl-6 pr-2 pb-1.5">
      <p className="text-xs text-scripture-muted">{followUp.text}</p>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleClick}
        disabled={pending}
        aria-label={`Highlight every mention of ${followUp.word}`}
      >
        {followUp.actionLabel}
      </Button>
    </div>
  );
}

export function LookAgainCard({ items, ready, anchors }: LookAgainCardProps) {
  const inductiveToolsEnabled = usePreferencesStore(s => s.inductiveToolsEnabled);
  const openPanel = usePanelStore(s => s.openPanel);

  // `ready` (see useLookAgain.ts) already implies items.length > 0.
  if (!ready) return null;

  const allDone = items.every(i => i.done);

  const activate = (item: LookAgainItem) => {
    const action = ACTION_FOR_ITEM[item.id];
    if (action === 'title-event') {
      window.dispatchEvent(new CustomEvent('openChapterTitleCreator'));
      return;
    }
    if (action === 'scroll') {
      const id = anchorIdFor(item, anchors);
      if (!id) return;
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  return (
    <DiscoveryCard title="Look again">
      <ul aria-label="Look-again checklist" className="list-none space-y-0.5">
        {items.map(item => (
          <li key={item.id}>
            {item.done ? (
              <>
                <div className={`${ROW_CLASSES} text-scripture-muted`}>
                  <span aria-hidden="true" className={CHECK_CLASSES}>
                    ✓
                  </span>
                  <span>
                    {item.label}
                    <span className="sr-only"> (done)</span>
                  </span>
                </div>
                {item.followUp && <FollowUpRow followUp={item.followUp} />}
              </>
            ) : ACTION_FOR_ITEM[item.id] === 'none' ? (
              <div className={`${ROW_CLASSES} text-scripture-text`}>
                <span aria-hidden="true" className={CHECK_CLASSES} />
                <div>
                  <div>
                    {item.label}
                    <span className="sr-only"> (not done)</span>
                  </div>
                  {HOW_TO_FOR_ITEM[item.id] && (
                    <p className="text-xs text-scripture-muted">{HOW_TO_FOR_ITEM[item.id]}</p>
                  )}
                </div>
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
