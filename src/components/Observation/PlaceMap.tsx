/**
 * Biblical Places Map
 *
 * Renders places with coordinates on a Leaflet map with OpenStreetMap tiles.
 * A sidebar list lets users click a place to fly to and highlight it on the map.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { Place, VerseRef } from '@/types';
import { formatVerseRef } from '@/types';

interface PlaceMapProps {
  places: Place[];
  onNavigate?: (ref: VerseRef) => void;
}

function createMarkerIcon(selected: boolean) {
  const color = selected ? '#f97316' : '#3b82f6';
  const size = selected ? 14 : 11;
  const anchor = size / 2;
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.45)"></div>`,
    iconSize: [size, size],
    iconAnchor: [anchor, anchor],
    className: '',
  });
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

/** Fly to selected place and open its popup */
function FlyToSelected({
  selectedId,
  places,
  markerRefs,
}: {
  selectedId: string | null;
  places: Place[];
  markerRefs: React.RefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();
  const prevId = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedId || selectedId === prevId.current) return;
    prevId.current = selectedId;
    const place = places.find(p => p.id === selectedId);
    if (!place) return;
    const zoom = Math.max(map.getZoom(), 8);
    map.flyTo([place.latitude!, place.longitude!], zoom, { duration: 0.6 });
    setTimeout(() => {
      markerRefs.current?.get(selectedId)?.openPopup();
    }, 700);
  }, [selectedId, places, map, markerRefs]);

  return null;
}

export function PlaceMap({ places, onNavigate }: PlaceMapProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  const mappable = useMemo(
    () => places.filter(p => p.latitude != null && p.longitude != null),
    [places]
  );

  // Treat selectedId as cleared if the place is no longer in the list
  const effectiveSelectedId = selectedId && places.some(p => p.id === selectedId) ? selectedId : null;

  const center: [number, number] = [31.7767, 35.2342];

  return (
    <div className="flex h-full gap-2">
      {/* Sidebar list */}
      <div className="w-44 flex-shrink-0 flex flex-col bg-scripture-surface rounded-xl border border-scripture-border/50 overflow-hidden">
        <div className="px-3 py-2 border-b border-scripture-border/30 flex-shrink-0">
          <span className="text-xs font-medium text-scripture-muted uppercase tracking-wide">
            Places ({places.length})
          </span>
        </div>
        {places.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-3">
            <p className="text-xs text-scripture-muted text-center">No places yet.</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 custom-scrollbar p-1.5 space-y-0.5">
            {places.map(place => {
              const hasCoordsMap = place.latitude != null && place.longitude != null;
              const isSelected = effectiveSelectedId === place.id;
              return (
                <button
                  key={place.id}
                  onClick={() => hasCoordsMap ? setSelectedId(place.id) : undefined}
                  disabled={!hasCoordsMap}
                  className={`w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors ${
                    isSelected
                      ? 'bg-scripture-accent text-scripture-bg'
                      : hasCoordsMap
                      ? 'hover:bg-scripture-elevated text-scripture-text'
                      : 'text-scripture-muted cursor-default'
                  }`}
                >
                  <div className="font-medium truncate">{place.name}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className={`text-xs truncate ${isSelected ? 'opacity-80' : 'text-scripture-muted'}`}>
                      {formatVerseRef(place.verseRef.book, place.verseRef.chapter, place.verseRef.verse)}
                    </span>
                    {onNavigate && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onNavigate(place.verseRef); }}
                        className={`shrink-0 text-xs underline transition-colors ${isSelected ? 'text-scripture-bg/80 hover:text-scripture-bg' : 'text-scripture-accent hover:text-scripture-accent/70'}`}
                        title="Jump to verse"
                      >
                        →
                      </button>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 rounded-xl overflow-hidden border border-scripture-border/50">
        {mappable.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <p className="text-scripture-muted text-sm">No places with coordinates to display.</p>
            <p className="text-scripture-muted text-xs mt-2">
              New places are automatically geocoded when created.
            </p>
          </div>
        ) : (
          <MapContainer center={center} zoom={7} className="h-full w-full" scrollWheelZoom={true}>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />
            <FitBounds places={mappable} />
            <FlyToSelected selectedId={effectiveSelectedId} places={mappable} markerRefs={markerRefs} />
            {mappable.map(place => (
              <Marker
                key={place.id}
                position={[place.latitude!, place.longitude!]}
                icon={createMarkerIcon(place.id === effectiveSelectedId)}
                ref={(marker) => {
                  if (marker) markerRefs.current.set(place.id, marker);
                  else markerRefs.current.delete(place.id);
                }}
                eventHandlers={{ click: () => setSelectedId(place.id) }}
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
        )}
      </div>
    </div>
  );
}
