/**
 * Full-size interactive view of the chapter's places. Read-only: it never
 * writes to a store.
 */

import { useState } from 'react';
import { Modal } from '@/components/shared';
import type { ChapterPlace } from '@/types';
import { ChapterMapCanvas } from './ChapterMap';

interface ChapterMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  places: ChapterPlace[];
}

export function ChapterMapModal({ isOpen, onClose, places }: ChapterMapModalProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const selected = places.find(p => p.slug === selectedSlug) ?? null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Places in this chapter"
      size="full"
      className="h-[80vh]"
      contentClassName="flex-1 min-h-0 relative"
      footer={
        selected && (
          <div className="text-sm text-scripture-text">
            <span className="font-medium">{selected.name}</span>
            <span className="text-scripture-muted">
              {' '}
              · {selected.verses.length === 1 ? 'Verse' : 'Verses'} {selected.verses.join(', ')}
            </span>
          </div>
        )
      }
    >
      <ChapterMapCanvas
        places={places}
        interactive
        selectedSlug={selected?.slug ?? null}
        onSelect={place => setSelectedSlug(place.slug)}
        className="h-full"
      />
    </Modal>
  );
}
