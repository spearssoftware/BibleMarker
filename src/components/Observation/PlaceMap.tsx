/**
 * Biblical Places Map
 *
 * Renders places on a Leaflet map grouped by name (one marker per unique place).
 * Sidebar lists each place once with all verse references beneath it.
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

interface PlaceGroup {
  name: string;
  latitude?: number;
  longitude?: number;
  entries: Place[];
}

function groupPlaces(places: Place[]): PlaceGroup[] {
  const map = new Map<string, PlaceGroup>();
  for (const place of places) {
    const existing = map.get(place.name);
    if (existing) {
      existing.entries.push(place);
    } else {
      map.set(place.name, {
        name: place.name,
        latitude: place.latitude,
        longitude: place.longitude,
        entries: [place],
      });
    }
  }
  return Array.from(map.values());
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

function FitBounds({ groups }: { groups: PlaceGroup[] }) {
  const map = useMap();
  useMemo(() => {
    if (groups.length === 0) return;
    const bounds = L.latLngBounds(
      groups.map(g => [g.latitude!, g.longitude!] as [number, number])
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 10 });
  }, [groups, map]);
  return null;
}

function FlyToSelected({
  selectedName,
  groups,
  markerRefs,
}: {
  selectedName: string | null;
  groups: PlaceGroup[];
  markerRefs: React.RefObject<Map<string, L.Marker>>;
}) {
  const map = useMap();
  const prevName = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedName || selectedName === prevName.current) return;
    prevName.current = selectedName;
    const group = groups.find(g => g.name === selectedName);
    if (!group) return;
    const zoom = Math.max(map.getZoom(), 8);
    map.flyTo([group.latitude!, group.longitude!], zoom, { duration: 0.6 });
    setTimeout(() => {
      markerRefs.current?.get(selectedName)?.openPopup();
    }, 700);
  }, [selectedName, groups, map, markerRefs]);

  return null;
}

export function PlaceMap({ places, onNavigate }: PlaceMapProps) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const markerRefs = useRef<Map<string, L.Marker>>(new Map());

  const groups = useMemo(() => groupPlaces(places), [places]);
  const mappableGroups = useMemo(
    () => groups.filter(g => g.latitude != null && g.longitude != null),
    [groups]
  );

  const effectiveSelectedName = selectedName && groups.some(g => g.name === selectedName)
    ? selectedName
    : null;

  const center: [number, number] = [31.7767, 35.2342];

  return (
    <div className="flex h-full gap-2">
      {/* Sidebar list */}
      <div className="w-44 flex-shrink-0 flex flex-col bg-scripture-surface rounded-xl border border-scripture-border/50 overflow-hidden">
        <div className="px-3 py-2 border-b border-scripture-border/30 flex-shrink-0">
          <span className="text-xs font-medium text-scripture-muted uppercase tracking-wide">
            Places ({groups.length})
          </span>
        </div>
        {groups.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-3">
            <p className="text-xs text-scripture-muted text-center">No places yet.</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 custom-scrollbar p-1.5 space-y-0.5">
            {groups.map(group => {
              const hasCoordsMap = group.latitude != null && group.longitude != null;
              const isSelected = effectiveSelectedName === group.name;
              return (
                <div
                  key={group.name}
                  className={`rounded-lg transition-colors ${
                    isSelected ? 'bg-scripture-accent' : ''
                  }`}
                >
                  {/* Place name row — clickable to select on map */}
                  <button
                    onClick={() => hasCoordsMap ? setSelectedName(group.name) : undefined}
                    disabled={!hasCoordsMap}
                    className={`w-full text-left px-2.5 pt-2 pb-1 text-sm font-medium transition-colors rounded-lg ${
                      isSelected
                        ? 'text-scripture-bg'
                        : hasCoordsMap
                        ? 'hover:bg-scripture-elevated text-scripture-text'
                        : 'text-scripture-muted cursor-default'
                    }`}
                  >
                    {group.name}
                  </button>
                  {/* Verse list */}
                  <div className="px-2.5 pb-1.5 space-y-0.5">
                    {group.entries.map(place => (
                      onNavigate ? (
                        <button
                          key={place.id}
                          onClick={() => onNavigate(place.verseRef)}
                          className={`block text-xs transition-colors ${
                            isSelected
                              ? 'text-scripture-bg/80 hover:text-scripture-bg'
                              : 'text-scripture-accent hover:text-scripture-accent/70'
                          }`}
                        >
                          {formatVerseRef(place.verseRef.book, place.verseRef.chapter, place.verseRef.verse)}
                        </button>
                      ) : (
                        <span key={place.id} className={`block text-xs ${isSelected ? 'text-scripture-bg/70' : 'text-scripture-muted'}`}>
                          {formatVerseRef(place.verseRef.book, place.verseRef.chapter, place.verseRef.verse)}
                        </span>
                      )
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 rounded-xl overflow-hidden border border-scripture-border/50">
        {mappableGroups.length === 0 ? (
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
            <FitBounds groups={mappableGroups} />
            <FlyToSelected selectedName={effectiveSelectedName} groups={mappableGroups} markerRefs={markerRefs} />
            {mappableGroups.map(group => (
              <Marker
                key={group.name}
                position={[group.latitude!, group.longitude!]}
                icon={createMarkerIcon(group.name === effectiveSelectedName)}
                ref={(marker) => {
                  if (marker) markerRefs.current.set(group.name, marker);
                  else markerRefs.current.delete(group.name);
                }}
                eventHandlers={{ click: () => setSelectedName(group.name) }}
              >
                <Popup>
                  <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '13px', lineHeight: '1.6' }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>{group.name}</div>
                    {group.entries.map(place => (
                      <div key={place.id} style={{ color: '#555', fontSize: '12px' }}>
                        {formatVerseRef(place.verseRef.book, place.verseRef.chapter, place.verseRef.verse)}
                        {place.notes && (
                          <span style={{ color: '#888', marginLeft: '4px' }}>— {place.notes}</span>
                        )}
                      </div>
                    ))}
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
