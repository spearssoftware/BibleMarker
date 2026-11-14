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
  if (entry.kind === 'completed') {
    const { next } = entry;
    return (
      <>
        <p className="text-scripture-text">Day {entry.day} complete.</p>
        {next && (
          <>
            <p className="text-sm text-scripture-muted">Next: {readingLabel(next)}</p>
            <Button variant="secondary" onClick={() => goToChapter(next.chapters[0])}>
              Read on
            </Button>
          </>
        )}
      </>
    );
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
      onClick={() => onComplete(entry.planId, entry.day)}
    >
      Mark day {entry.day} complete
    </Button>
  );
}

/** What each plan offers at the end of the chapter, stacked in list order. */
export function ReaderPlanEndActions({ entries, onComplete, pending }: ReaderPlanEndActionsProps) {
  return (
    <div className="select-none mt-6 space-y-4" data-reader-plan-actions>
      {entries.map((entry) => (
        <section key={entry.planId} aria-label={entry.name} className="space-y-2">
          <EntryActions entry={entry} onComplete={onComplete} pending={pending} />
        </section>
      ))}
    </div>
  );
}
