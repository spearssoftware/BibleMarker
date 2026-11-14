import type { ChapterPlanEntry } from '@/lib/readingPlans';
import { readingLabel } from '@/lib/readingPlans';
import { useAnnotationStore } from '@/stores/annotationStore';

const READING_SIZE_CLASS = {
  sm: 'text-scripture-sm',
  base: 'text-scripture-base',
  lg: 'text-scripture-lg',
  xl: 'text-scripture-xl',
} as const;

/** One line per plan at the top of the chapter text; only the reading follows the text size. */
export function ReaderPlanStrip({ entries }: { entries: ChapterPlanEntry[] }) {
  const fontSize = useAnnotationStore((s) => s.fontSize);
  return (
    <div className="select-none space-y-1 pb-2" data-reader-plan-strip>
      {entries.map((entry) => (
        <p key={entry.planId} className="text-sm text-scripture-muted">
          {entry.name} · Day {entry.day} ·{' '}
          <span className={`text-scripture-text ${READING_SIZE_CLASS[fontSize]}`}>
            {readingLabel(entry.reading)}
          </span>
        </p>
      ))}
    </div>
  );
}
