import { useRef, useState, type FormEvent } from 'react';
import { BIBLE_BOOKS } from '@/types';
import type { ReadingPlanScope } from '@/types';
import { Button, Input, ReadOnlyField, SegmentedControl, Select } from '@/components/shared';
import { FORM_GROUP_SPACING, Label } from '@/components/shared/Form';
import { useBibleStore } from '@/stores/bibleStore';
import { selectionChapters } from '@/lib/readingPlans';
import { startPlan } from './planActions';
import { chaptersPerDayLabel } from './chaptersPerDay';

type Kind = ReadingPlanScope['kind'];

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'bible', label: 'Whole Bible' },
  { value: 'ot', label: 'Old Testament' },
  { value: 'nt', label: 'New Testament' },
  { value: 'book', label: 'One book' },
];

const BOOK_OPTIONS = BIBLE_BOOKS.map((book) => ({ value: book.id, label: book.name }));

const SUGGESTED_DAYS: Record<Kind, number[]> = {
  bible: [90, 180, 365],
  ot: [30, 90, 180],
  nt: [30, 90, 180],
  book: [7, 14, 30],
};

interface NewPlanFormProps {
  onCancel: () => void;
  onCreated: () => void;
}

export function NewPlanForm({ onCancel, onCreated }: NewPlanFormProps) {
  const [kind, setKind] = useState<Kind>('bible');
  const [bookId, setBookId] = useState(() => useBibleStore.getState().currentBook);
  const [daysText, setDaysText] = useState('');
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  const scope: ReadingPlanScope = kind === 'book' ? { kind, bookId } : { kind };
  const chapterCount = selectionChapters(scope).length;
  const days = Number(daysText);
  const valid = /^\d+$/.test(daysText) && days >= 1 && days <= chapterCount;
  const showError = daysText !== '' && !valid;
  const chips = SUGGESTED_DAYS[kind].filter((value) => value <= chapterCount);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    const ok = await startPlan(scope, days);
    submittingRef.current = false;
    setSaving(false);
    if (ok) onCreated();
  };

  return (
    <form onSubmit={handleSubmit} className={`p-4 ${FORM_GROUP_SPACING}`}>
      <div className="space-y-1">
        <Label>What to read</Label>
        <SegmentedControl
          ariaLabel="What to read"
          columns={2}
          options={KIND_OPTIONS}
          value={kind}
          onChange={setKind}
        />
      </div>

      {kind === 'book' && (
        <Select label="Book" options={BOOK_OPTIONS} value={bookId} onChange={(e) => setBookId(e.target.value)} />
      )}

      <Input
        label="How many days"
        type="number"
        inputMode="numeric"
        min={1}
        max={chapterCount}
        value={daysText}
        onChange={(e) => setDaysText(e.target.value)}
        error={showError ? `Choose between 1 and ${chapterCount} days.` : undefined}
      />

      {chips.length > 0 && (
        <div role="group" aria-label="Suggested days" className="flex flex-wrap gap-2">
          {chips.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={daysText === String(value)}
              onClick={() => setDaysText(String(value))}
              className={`min-h-[44px] px-3 py-1.5 text-sm font-ui rounded-lg transition-colors ${
                daysText === String(value)
                  ? 'bg-scripture-accent text-scripture-bg'
                  : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50'
              }`}
            >
              {value}
            </button>
          ))}
        </div>
      )}

      <ReadOnlyField label="Start" value="Today" />

      {valid && <p className="text-sm text-scripture-muted">{chaptersPerDayLabel(chapterCount, days)}</p>}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!valid || saving}>
          Start plan
        </Button>
      </div>
    </form>
  );
}
