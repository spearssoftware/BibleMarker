/**
 * PeoplePlacesCard — quiet entity-count teaser (replaces the old `EntityChips`)
 *
 * "{n} people · {n} places" from Gnosis, shown only once loaded, error-free,
 * and non-zero. With the full inductive toolkit on, "See in Study Tools"
 * opens Study Tools → Chapter, where the full detail already lives. Names
 * stay hidden — verse-level "greyed until found" gating is a Phase 2
 * Look-Again Card concern; this is the plain-count version.
 */

import { Button } from '@/components/shared';
import { DiscoveryCard } from './DiscoveryCard';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { usePanelStore } from '@/stores/panelStore';
import { track } from '@/lib/telemetry';
import { pluralize } from '@/lib/textUtils';
import type { ChapterEntities } from '@/types';

interface PeoplePlacesCardProps {
  entities: ChapterEntities | null;
  isLoading: boolean;
  error: string | null;
}

export function PeoplePlacesCard({ entities, isLoading, error }: PeoplePlacesCardProps) {
  const inductiveToolsEnabled = usePreferencesStore(s => s.inductiveToolsEnabled);
  const openPanel = usePanelStore(s => s.openPanel);

  if (isLoading || error || !entities) return null;

  const peopleCount = entities.people.length;
  const placesCount = entities.places.length;
  if (peopleCount === 0 && placesCount === 0) return null;

  const parts: string[] = [];
  if (peopleCount > 0) parts.push(pluralize(peopleCount, 'person', 'people'));
  if (placesCount > 0) parts.push(pluralize(placesCount, 'place'));

  return (
    <DiscoveryCard title={parts.join(' · ')}>
      <p className="text-sm text-scripture-text">
        Names and places anchor a chapter — notice who is doing what.
      </p>
      {inductiveToolsEnabled && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            track('discovery_chip_tapped', { feature: 'entity' });
            openPanel('reference', { referenceInitialTab: 'chapter' });
          }}
        >
          See in Study Tools
        </Button>
      )}
    </DiscoveryCard>
  );
}
