import { useGnosisEntity } from '@/hooks/useGnosis';
import { VerseRefList } from './VerseRefList';

interface EventDetailProps {
  slug: string;
  onNavigate: (type: string, slug: string) => void;
  onBack: () => void;
}

export function EventDetail({ slug, onNavigate, onBack }: EventDetailProps) {
  const { data: event, isLoading, error } = useGnosisEntity((p) => p.getEvent(slug), [slug]);

  if (isLoading) {
    return <div className="p-4 text-scripture-muted text-sm">Loading...</div>;
  }

  if (error) {
    return <div className="p-4 text-scripture-error text-sm">{error}</div>;
  }

  if (!event) return null;

  return (
    <div className="p-4 space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-scripture-muted hover:text-scripture-text transition-colors"
      >
        ← Back
      </button>

      <div>
        <h2 className="text-lg font-semibold text-scripture-text">{event.title}</h2>
        {event.startYearDisplay && (
          <p className="text-sm text-scripture-muted">{event.startYearDisplay}</p>
        )}
        {event.duration && (
          <p className="text-sm text-scripture-muted">Duration: {event.duration}</p>
        )}
      </div>

      {event.participants.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-scripture-text mb-2">Participants</h3>
          <div className="flex flex-wrap gap-2">
            {event.participants.map((p) => (
              <button
                key={p}
                onClick={() => onNavigate('person', p)}
                className="text-sm text-scripture-accent hover:underline"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}

      {(event.parentEvent || event.predecessor) && (
        <div>
          <h3 className="text-sm font-medium text-scripture-text mb-2">Related Events</h3>
          <dl className="space-y-1 text-sm">
            {event.parentEvent && (
              <div className="flex gap-2">
                <dt className="text-scripture-muted w-20 shrink-0">Parent</dt>
                <dd>
                  <button onClick={() => onNavigate('event', event.parentEvent!)} className="text-scripture-accent hover:underline">
                    {event.parentEvent}
                  </button>
                </dd>
              </div>
            )}
            {event.predecessor && (
              <div className="flex gap-2">
                <dt className="text-scripture-muted w-20 shrink-0">Preceded by</dt>
                <dd>
                  <button onClick={() => onNavigate('event', event.predecessor!)} className="text-scripture-accent hover:underline">
                    {event.predecessor}
                  </button>
                </dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {event.verses.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-scripture-text mb-2">Verses</h3>
          <VerseRefList refs={event.verses} />
        </div>
      )}
    </div>
  );
}
