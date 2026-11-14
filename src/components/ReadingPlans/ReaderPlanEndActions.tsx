import { useEffect, useRef } from 'react';
import { getBookById } from '@/types/bible';
import type { ChapterPlanEntry } from '@/lib/readingPlans';
import { readingLabel } from '@/lib/readingPlans';
import { Button } from '@/components/shared';
import { goToChapter } from './planActions';

interface ReaderPlanEndActionsProps {
  entries: ChapterPlanEntry[];
  onComplete: (planId: string, day: number) => void;
  /** Plan ids with a save in flight. */
  pending: ReadonlySet<string>;
}

interface EntryActionsProps extends Omit<ReaderPlanEndActionsProps, 'entries'> {
  entry: ChapterPlanEntry;
}

function EntryActions({ entry, onComplete, pending }: EntryActionsProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const confirmationRef = useRef<HTMLParagraphElement>(null);
  const pressedRef = useRef(false);
  const completed = entry.kind === 'completed';

  // The pressed button is replaced by the confirmation, so focus would fall to the page.
  // Only a completion made with this button moves focus; one that arrives from elsewhere does not.
  useEffect(() => {
    if (!completed || !pressedRef.current) return;
    pressedRef.current = false;
    const target = rootRef.current?.querySelector('button') ?? confirmationRef.current;
    target?.focus({ preventScroll: true });
  }, [completed]);

  const body = () => {
    if (entry.kind === 'completed') {
      const { next } = entry;
      return next ? (
        <>
          <p className="text-sm text-scripture-muted">Next: {readingLabel(next)}</p>
          <Button variant="secondary" onClick={() => goToChapter(next.chapters[0])}>
            Read on
          </Button>
        </>
      ) : null;
    }

    const { nextInDay } = entry;
    if (nextInDay) {
      const bookName = getBookById(nextInDay.bookId)?.name ?? nextInDay.bookId;
      return (
        <Button variant="primary" onClick={() => goToChapter(nextInDay)}>
          Continue to {bookName} {nextInDay.chapter}
        </Button>
      );
    }
    return (
      <Button
        variant="primary"
        disabled={pending.has(entry.planId)}
        onClick={() => {
          pressedRef.current = true;
          onComplete(entry.planId, entry.day);
        }}
      >
        Mark day {entry.day} complete
      </Button>
    );
  };

  return (
    <div ref={rootRef} className="space-y-2">
      <div aria-live="polite">
        {entry.kind === 'completed' && (
          <p ref={confirmationRef} tabIndex={-1} className="text-scripture-text focus:outline-none">
            Day {entry.day} complete.
          </p>
        )}
      </div>
      {body()}
    </div>
  );
}

/** What each plan offers at the end of the chapter, stacked in list order. */
export function ReaderPlanEndActions({ entries, onComplete, pending }: ReaderPlanEndActionsProps) {
  return (
    <div className="select-none mt-6 space-y-4" data-reader-plan-actions>
      {entries.map((entry) => (
        <section key={entry.planId} aria-label={entry.name}>
          <EntryActions entry={entry} onComplete={onComplete} pending={pending} />
        </section>
      ))}
    </div>
  );
}
