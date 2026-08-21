/**
 * ConnectorChip — Connector Lens toggle
 *
 * "{n} hinges in this chapter". Doubles as the lens on/off toggle; hidden
 * entirely below the tunable `connectorChipMinCount` threshold (a chapter
 * with one or two incidental connectors shouldn't invite a search that
 * isn't there).
 */

import { forwardRef } from 'react';
import { Button } from '@/components/shared';

interface ConnectorChipProps {
  count: number;
  minCount: number;
  active: boolean;
  onToggle: () => void;
}

export const ConnectorChip = forwardRef<HTMLDivElement, ConnectorChipProps>(function ConnectorChip(
  { count, minCount, active, onToggle },
  ref
) {
  if (count < minCount) return null;

  return (
    <div ref={ref} className="inline-block">
      <Button
        variant={active ? 'primary' : 'secondary'}
        size="sm"
        className="rounded-full"
        aria-pressed={active}
        onClick={onToggle}
      >
        {count} hinge{count === 1 ? '' : 's'} in this chapter
      </Button>
    </div>
  );
});
