/**
 * ConnectorPrompt — Connector Lens micro-prompt
 *
 * Anchored to the Connector chip. Shows the per-category Socratic prompt for
 * the tapped connector; "Add to Flow" only appears with the full Precept
 * toolkit enabled, since it lands in Observe → Flow.
 */

import type { RefObject } from 'react';
import { Button, ToolbarPopover } from '@/components/shared';
import { usePreferencesStore } from '@/stores/preferencesStore';
import { addConnectorToFlow } from '@/lib/discoveryActions';
import { promptFor, type ConnectorHit } from '@/lib/chapterAnalysis';

interface ConnectorPromptProps {
  hit: ConnectorHit;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  book: string;
  chapter: number;
}

export function ConnectorPrompt({ hit, triggerRef, onClose, book, chapter }: ConnectorPromptProps) {
  const inductiveToolsEnabled = usePreferencesStore(s => s.inductiveToolsEnabled);

  const handleAddToFlow = async () => {
    await addConnectorToFlow(hit, book, chapter);
    onClose();
  };

  return (
    <ToolbarPopover triggerRef={triggerRef} width={280} label="Connector hint" onClose={onClose}>
      <div className="p-4 space-y-3">
        <p className="text-sm text-scripture-text">{promptFor(hit)}</p>
        <div className="flex justify-end gap-2">
          {inductiveToolsEnabled && (
            <Button variant="primary" size="sm" onClick={handleAddToFlow}>
              Add to Flow
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </ToolbarPopover>
  );
}
