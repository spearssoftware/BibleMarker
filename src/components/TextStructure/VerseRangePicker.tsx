/**
 * Verse Range Picker
 *
 * Modal for selecting a start and end verse when creating a new text structure.
 */

import { useState } from 'react';
import { Modal, Button, Select } from '@/components/shared';
import { getVerseCount } from '@/types';

interface VerseRangePickerProps {
  book: string;
  chapter: number;
  /** Existing verse ranges already covered by structures, to prevent overlap */
  occupiedRanges: { startVerse: number; endVerse: number }[];
  onConfirm: (startVerse: number, endVerse: number) => void;
  onClose: () => void;
}

export function VerseRangePicker({
  book,
  chapter,
  occupiedRanges,
  onConfirm,
  onClose,
}: VerseRangePickerProps) {
  const totalVerses = getVerseCount(book, chapter) || 50;
  const [startVerse, setStartVerse] = useState(1);
  const [endVerse, setEndVerse] = useState(Math.min(5, totalVerses));
  const [error, setError] = useState<string | null>(null);

  const verseOptions = Array.from({ length: totalVerses }, (_, i) => ({
    value: String(i + 1),
    label: `Verse ${i + 1}`,
  }));

  function handleConfirm() {
    if (startVerse > endVerse) {
      setError('Start verse must be before end verse.');
      return;
    }
    // Check for overlap
    const overlaps = occupiedRanges.some(
      r => startVerse <= r.endVerse && endVerse >= r.startVerse
    );
    if (overlaps) {
      setError('This range overlaps with an existing structure in this chapter.');
      return;
    }
    onConfirm(startVerse, endVerse);
  }

  return (
    <Modal isOpen onClose={onClose} title="New Structure" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-scripture-muted">
          Choose the verse range for this structure.
        </p>
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <Select
              id="start-verse"
              label="From"
              value={String(startVerse)}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                setStartVerse(v);
                if (v > endVerse) setEndVerse(v);
                setError(null);
              }}
              options={verseOptions}
            />
          </div>
          <div className="flex-1">
            <Select
              id="end-verse"
              label="To"
              value={String(endVerse)}
              onChange={e => {
                setEndVerse(parseInt(e.target.value, 10));
                setError(null);
              }}
              options={verseOptions.filter(o => parseInt(o.value, 10) >= startVerse)}
            />
          </div>
        </div>
        {error && <p className="text-sm text-scripture-error">{error}</p>}
      </div>

      <div className="flex gap-2 justify-end mt-6">
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleConfirm}>Create</Button>
      </div>
    </Modal>
  );
}
