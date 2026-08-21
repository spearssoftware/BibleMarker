/**
 * EntityChips — quiet entity-count teaser
 *
 * "{n} people · {n} places" from Gnosis, shown only once loaded, error-free,
 * and non-zero. Tapping opens Study Tools → Chapter, where the full detail
 * already lives. Verse-level "greyed until found" gating is a Phase 2
 * Look-Again Card concern — this is Phase 1's plain-count version.
 */

import { Button } from '@/components/shared';
import { track } from '@/lib/telemetry';
import { usePanelStore } from '@/stores/panelStore';
import type { ChapterEntities } from '@/types';

interface EntityChipsProps {
  entities: ChapterEntities | null;
  isLoading: boolean;
  error: string | null;
}

export function EntityChips({ entities, isLoading, error }: EntityChipsProps) {
  const openPanel = usePanelStore(s => s.openPanel);

  if (isLoading || error || !entities) return null;

  const peopleCount = entities.people.length;
  const placesCount = entities.places.length;
  if (peopleCount === 0 && placesCount === 0) return null;

  const parts: string[] = [];
  if (peopleCount > 0) parts.push(`${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`);
  if (placesCount > 0) parts.push(`${placesCount} ${placesCount === 1 ? 'place' : 'places'}`);

  return (
    <Button
      variant="secondary"
      size="sm"
      className="rounded-full"
      onClick={() => {
        track('discovery_chip_tapped', { feature: 'entity' });
        openPanel('reference', { referenceInitialTab: 'chapter' });
      }}
    >
      {parts.join(' · ')}
    </Button>
  );
}
