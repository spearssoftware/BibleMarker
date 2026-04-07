import { useGnosisEntity } from '@/hooks/useGnosis';
import { VerseRefList } from './VerseRefList';
import { EntityNotes } from './EntityNotes';

interface TopicDetailProps {
  slug: string;
  onNavigate: (type: string, slug: string) => void;
  onBack: () => void;
}

export function TopicDetail({ slug, onNavigate, onBack }: TopicDetailProps) {
  const { data: topic, isLoading, error } = useGnosisEntity((p) => p.getTopic(slug), [slug]);

  if (isLoading) {
    return <div className="p-4 text-scripture-muted text-sm">Loading...</div>;
  }

  if (error) {
    return <div className="p-4 text-scripture-error text-sm">{error}</div>;
  }

  if (!topic) return null;

  return (
    <div className="p-4 space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-scripture-muted hover:text-scripture-text transition-colors"
      >
        ← Back
      </button>

      <h2 className="text-lg font-semibold text-scripture-text">{topic.name}</h2>

      {topic.aspects.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-scripture-text">Aspects</h3>
          {topic.aspects.map((aspect, i) => (
            <div key={i} className="pl-3 border-l border-scripture-border/50 space-y-1">
              {aspect.label && (
                <p className="text-sm font-medium text-scripture-text">{aspect.label}</p>
              )}
              {aspect.source && (
                <p className="text-xs text-scripture-muted">{aspect.source}</p>
              )}
              {aspect.verses.length > 0 && <VerseRefList refs={aspect.verses} maxVisible={5} />}
            </div>
          ))}
        </div>
      )}

      {topic.seeAlso.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-scripture-text mb-2">See Also</h3>
          <div className="flex flex-wrap gap-2">
            {topic.seeAlso.map((t) => (
              <button
                key={t}
                onClick={() => onNavigate('topic', t)}
                className="text-sm text-scripture-accent hover:underline"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      )}

      <EntityNotes entityType="topic" entitySlug={slug} entityName={topic.name} />
    </div>
  );
}
