/**
 * Chapter Map
 *
 * Small non-interactive map of the places named in the current chapter. Tapping a
 * marker shows its verses below the map (a Popup would clip in the static box);
 * tapping a verse navigates there. Falls back to a plain place list when the
 * basemap can't load.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import MapGL, { Marker, type MapRef } from 'react-map-gl/maplibre';
import { Button } from '@/components/shared';
import { useMapAvailability } from '@/hooks/useMapAvailability';
import { boundsFor, ensurePmtilesProtocol, getStyles } from '@/lib/map/mapStyle';
import type { ChapterPlace } from '@/types';
import { VerseLinks } from './InlineDetail';

ensurePmtilesProtocol();

const SINGLE_PLACE_ZOOM = 8;
const FIT_MAX_ZOOM = 10;

interface ChapterMapCanvasProps {
  places: ChapterPlace[];
  interactive: boolean;
  selectedSlug: string | null;
  onSelect: (place: ChapterPlace) => void;
  /** Sizing classes for the map box. */
  className: string;
}

/** The map itself, or the place-name fallback when the basemap is unavailable. */
export function ChapterMapCanvas({ places, interactive, selectedSlug, onSelect, className }: ChapterMapCanvasProps) {
  const mapRef = useRef<MapRef>(null);
  const { available, onLoad, onError } = useMapAvailability();

  const fitAll = useCallback(() => {
    const map = mapRef.current;
    if (!map || places.length === 0) return;
    const coords = places.map(p => [p.longitude, p.latitude] as [number, number]);
    if (coords.length === 1) {
      map.flyTo({ center: coords[0], zoom: SINGLE_PLACE_ZOOM, duration: 0 });
      return;
    }
    map.fitBounds(boundsFor(coords), { padding: 40, maxZoom: FIT_MAX_ZOOM, duration: 0 });
  }, [places]);

  useEffect(() => {
    fitAll();
  }, [fitAll]);

  const handleLoad = useCallback(() => {
    onLoad();
    fitAll();
  }, [onLoad, fitAll]);

  if (!available) {
    return (
      <div className={`${className} overflow-auto rounded-lg border border-scripture-border/50 bg-scripture-surface p-3`}>
        <p className="mb-2 text-xs text-scripture-muted">Map needs an internet connection.</p>
        <ul className="space-y-0.5 text-sm text-scripture-text">
          {places.map(place => (
            <li key={place.slug}>{place.name}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className={`${className} relative overflow-hidden rounded-lg border border-scripture-border/50`}>
      <MapGL
        ref={mapRef}
        initialViewState={{ longitude: 35.2342, latitude: 31.7767, zoom: 7 }}
        style={{ width: '100%', height: '100%' }}
        mapStyle={getStyles().map}
        interactive={interactive}
        onLoad={handleLoad}
        onError={onError}
        attributionControl={{ compact: true }}
      >
        {places.map(place => {
          const isSelected = place.slug === selectedSlug;
          return (
            <Marker
              key={place.slug}
              longitude={place.longitude}
              latitude={place.latitude}
              anchor="center"
              onClick={e => {
                e.originalEvent.stopPropagation();
                onSelect(place);
              }}
            >
              <div
                aria-label={place.name}
                className={`cursor-pointer rounded-full border-2 border-scripture-surface shadow ${
                  isSelected ? 'h-4 w-4 bg-scripture-accent' : 'h-3 w-3 bg-scripture-info'
                }`}
              />
            </Marker>
          );
        })}
      </MapGL>
    </div>
  );
}

interface ChapterMapProps {
  places: ChapterPlace[];
  book: string;
  chapter: number;
  /** Fires when a marker is tapped (e.g. for telemetry). */
  onMarkerTap?: (place: ChapterPlace) => void;
  /** Fires when the reader asks for the full map; the parent owns the modal. */
  onOpenFullMap?: () => void;
}

export function ChapterMap({ places, book, chapter, onMarkerTap, onOpenFullMap }: ChapterMapProps) {
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [prevChapter, setPrevChapter] = useState({ book, chapter });
  if (prevChapter.book !== book || prevChapter.chapter !== chapter) {
    setPrevChapter({ book, chapter });
    setSelectedSlug(null);
  }

  if (places.length === 0) return null;

  const selected = places.find(p => p.slug === selectedSlug) ?? null;

  const handleSelect = (place: ChapterPlace) => {
    setSelectedSlug(place.slug);
    onMarkerTap?.(place);
  };

  return (
    <div className="space-y-2">
      <ChapterMapCanvas
        places={places}
        interactive={false}
        selectedSlug={selected?.slug ?? null}
        onSelect={handleSelect}
        className="h-48"
      />
      {selected && (
        <div className="text-sm text-scripture-text">
          <div className="font-medium">{selected.name}</div>
          <VerseLinks book={book} chapter={chapter} verses={selected.verses} />
        </div>
      )}
      <Button variant="secondary" size="sm" onClick={onOpenFullMap}>
        Open full map
      </Button>
    </div>
  );
}
