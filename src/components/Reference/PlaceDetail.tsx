import { useGnosisEntity } from '@/hooks/useGnosis';
import { EntityNotes } from './EntityNotes';

interface PlaceDetailProps {
  slug: string;
  onNavigate: (type: string, slug: string) => void;
  onBack: () => void;
}

export function PlaceDetail({ slug, onBack }: PlaceDetailProps) {
  const { data: place, isLoading, error } = useGnosisEntity((p) => p.getPlace(slug), [slug]);

  if (isLoading) {
    return <div className="p-4 text-scripture-muted text-sm">Loading...</div>;
  }

  if (error) {
    return <div className="p-4 text-scripture-error text-sm">{error}</div>;
  }

  if (!place) return null;

  return (
    <div className="p-4 space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-scripture-muted hover:text-scripture-text transition-colors"
      >
        ← Back
      </button>

      <div>
        <h2 className="text-lg font-semibold text-scripture-text">{place.name}</h2>
        {place.modernName && (
          <p className="text-sm text-scripture-muted">Modern: {place.modernName}</p>
        )}
        {place.featureType && (
          <p className="text-sm text-scripture-muted capitalize">{place.featureType}</p>
        )}
      </div>

      {(place.latitude !== null && place.longitude !== null) && (
        <div>
          <h3 className="text-sm font-medium text-scripture-text mb-1">Coordinates</h3>
          <p className="text-sm text-scripture-muted font-mono">
            {place.latitude.toFixed(4)}, {place.longitude.toFixed(4)}
          </p>
        </div>
      )}

      {(place.kjvName || place.esvName) && (
        <div>
          <h3 className="text-sm font-medium text-scripture-text mb-2">Name Variants</h3>
          <dl className="space-y-1 text-sm">
            {place.kjvName && (
              <div className="flex gap-2">
                <dt className="text-scripture-muted w-12 shrink-0">KJV</dt>
                <dd className="text-scripture-text">{place.kjvName}</dd>
              </div>
            )}
            {place.esvName && (
              <div className="flex gap-2">
                <dt className="text-scripture-muted w-12 shrink-0">ESV</dt>
                <dd className="text-scripture-text">{place.esvName}</dd>
              </div>
            )}
          </dl>
        </div>
      )}

      <EntityNotes entityType="place" entitySlug={slug} entityName={place.name} />
    </div>
  );
}
