import { useGnosisEntity } from '@/hooks/useGnosis';
import { VerseRefList } from './VerseRefList';
import { EntityNotes } from './EntityNotes';

interface PersonDetailProps {
  slug: string;
  onNavigate: (type: string, slug: string) => void;
  onBack: () => void;
}

export function PersonDetail({ slug, onNavigate, onBack }: PersonDetailProps) {
  const { data: person, isLoading, error } = useGnosisEntity((p) => p.getPerson(slug), [slug]);

  if (isLoading) {
    return <div className="p-4 text-scripture-muted text-sm">Loading...</div>;
  }

  if (error) {
    return <div className="p-4 text-scripture-error text-sm">{error}</div>;
  }

  if (!person) return null;

  const familyLinks = (slugs: string[], type = 'person') =>
    slugs.map((s) => (
      <button
        key={s}
        onClick={() => onNavigate(type, s)}
        className="text-scripture-accent hover:underline text-sm"
      >
        {s}
      </button>
    ));

  return (
    <div className="p-4 space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-scripture-muted hover:text-scripture-text transition-colors"
      >
        ← Back
      </button>

      <div>
        <h2 className="text-lg font-semibold text-scripture-text">{person.name}</h2>
        {person.gender && <p className="text-sm text-scripture-muted capitalize">{person.gender}</p>}
        {(person.birthYearDisplay || person.deathYearDisplay) && (
          <p className="text-sm text-scripture-muted">
            {person.birthYearDisplay && `b. ${person.birthYearDisplay}`}
            {person.birthYearDisplay && person.deathYearDisplay && ' — '}
            {person.deathYearDisplay && `d. ${person.deathYearDisplay}`}
          </p>
        )}
        {person.nameMeaning && (
          <p className="text-sm text-scripture-muted italic">"{person.nameMeaning}"</p>
        )}
      </div>

      {(person.father || person.mother || person.siblings.length > 0 || person.children.length > 0 || person.partners.length > 0) && (
        <div>
          <h3 className="text-sm font-medium text-scripture-text mb-2">Family</h3>
          <dl className="space-y-1 text-sm">
            {person.father && (
              <div className="flex gap-2">
                <dt className="text-scripture-muted w-16 shrink-0">Father</dt>
                <dd>
                  <button onClick={() => onNavigate('person', person.father!)} className="text-scripture-accent hover:underline">
                    {person.father}
                  </button>
                </dd>
              </div>
            )}
            {person.mother && (
              <div className="flex gap-2">
                <dt className="text-scripture-muted w-16 shrink-0">Mother</dt>
                <dd>
                  <button onClick={() => onNavigate('person', person.mother!)} className="text-scripture-accent hover:underline">
                    {person.mother}
                  </button>
                </dd>
              </div>
            )}
            {person.siblings.length > 0 && (
              <div className="flex gap-2">
                <dt className="text-scripture-muted w-16 shrink-0">Siblings</dt>
                <dd className="flex flex-wrap gap-2">{familyLinks(person.siblings)}</dd>
              </div>
            )}
            {person.children.length > 0 && (
              <div className="flex gap-2">
                <dt className="text-scripture-muted w-16 shrink-0">Children</dt>
                <dd className="flex flex-wrap gap-2">{familyLinks(person.children)}</dd>
              </div>
            )}
            {person.partners.length > 0 && (
              <div className="flex gap-2">
                <dt className="text-scripture-muted w-16 shrink-0">Partners</dt>
                <dd className="flex flex-wrap gap-2">{familyLinks(person.partners)}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      {person.peopleGroups.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-scripture-text mb-2">People Groups</h3>
          <div className="flex flex-wrap gap-2">
            {person.peopleGroups.map((g) => (
              <button key={g} onClick={() => onNavigate('group', g)} className="text-sm text-scripture-accent hover:underline">
                {g}
              </button>
            ))}
          </div>
        </div>
      )}

      {person.verses.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-scripture-text mb-2">Verses ({person.verseCount})</h3>
          <VerseRefList refs={person.verses} />
        </div>
      )}

      <EntityNotes entityType="person" entitySlug={slug} entityName={person.name} />
    </div>
  );
}
