/**
 * Biblical Places Map
 *
 * Renders places with coordinates on a Leaflet map with OpenStreetMap tiles.
 */

import { useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Place } from '@/types';
import { formatVerseRef } from '@/types';

interface PlaceMapProps {
  places: Place[];
}

/** Auto-fit map bounds to markers */
function FitBounds({ places }: { places: Place[] }) {
  const map = useMap();

  useMemo(() => {
    if (places.length === 0) return;
    const bounds = L.latLngBounds(
      places.map(p => [p.latitude!, p.longitude!] as [number, number])
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }, [places, map]);

  return null;
}

export function PlaceMap({ places }: PlaceMapProps) {
  const mappable = useMemo(
    () => places.filter(p => p.latitude != null && p.longitude != null),
    [places]
  );

  if (mappable.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-scripture-muted text-sm">
          No places with coordinates to display.
        </p>
        <p className="text-scripture-muted text-xs mt-2">
          New places are automatically geocoded when created. Existing places without coordinates won't appear on the map.
        </p>
      </div>
    );
  }

  // Default center: Jerusalem
  const center: [number, number] = [31.7767, 35.2342];

  return (
    <div className="h-[400px] rounded-xl overflow-hidden border border-scripture-border/50">
      <MapContainer
        center={center}
        zoom={7}
        className="h-full w-full"
        scrollWheelZoom={true}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
        />
        <FitBounds places={mappable} />
        {mappable.map(place => (
          <Marker
            key={place.id}
            position={[place.latitude!, place.longitude!]}
          >
            <Popup>
              <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '13px', lineHeight: '1.4' }}>
                <div style={{ fontWeight: 600, marginBottom: '2px' }}>{place.name}</div>
                <div style={{ color: '#666', fontSize: '12px' }}>
                  {formatVerseRef(place.verseRef.book, place.verseRef.chapter, place.verseRef.verse)}
                </div>
                {place.notes && (
                  <div style={{ marginTop: '4px', fontSize: '12px', color: '#444' }}>
                    {place.notes}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
