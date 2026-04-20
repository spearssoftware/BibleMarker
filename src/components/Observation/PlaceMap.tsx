/**
 * Biblical Places Map
 *
 * Renders places on a MapLibre GL map grouped by name (one marker per unique place).
 * Uses PMTiles with Protomaps basemaps for vector tiles.
 * Sidebar lists each place once with all verse references beneath it.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import MapGL, { Marker, Popup, type MapRef } from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';

const pmtilesProtocol = new Protocol();
maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
import type { GnosisPlace, Place, VerseRef } from '@/types';
import { formatVerseRef } from '@/types';

interface PlaceMapProps {
  places: Place[];
  /** Read-only places from the gnosis reference library for the current chapter.
   * Rendered alongside user-tracked places but not persisted to the user's store. */
  gnosisPlaces?: GnosisPlace[];
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

const PMTILES_URL = import.meta.env.VITE_PMTILES_URL
  ?? (import.meta.env.DEV
    ? `${window.location.origin}/tiles/biblical-lands.pmtiles`
    : 'https://tiles.biblemarker.app/biblical-lands.pmtiles');

const SOURCE_NAME = 'protomaps';

function buildMapStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sources: {
      [SOURCE_NAME]: {
        type: 'vector',
        url: `pmtiles://${PMTILES_URL}`,
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
    },
    layers: layers(SOURCE_NAME, namedFlavor('light'), { lang: 'en' }),
  };
}

function buildSatelliteStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
    sources: {
      [SOURCE_NAME]: {
        type: 'vector',
        url: `pmtiles://${PMTILES_URL}`,
        attribution: '&copy; <a href="https://openstreetmap.org">OpenStreetMap</a>',
      },
      satellite: {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        attribution: '&copy; <a href="https://www.esri.com">Esri</a>',
      },
    },
    layers: [
      { id: 'satellite', type: 'raster', source: 'satellite' },
      ...layers(SOURCE_NAME, namedFlavor('light'), { labelsOnly: true, lang: 'en' }),
    ],
  };
}

let cachedStyles: { map: StyleSpecification; satellite: StyleSpecification } | null = null;

function getStyles() {
  if (!cachedStyles) {
    cachedStyles = { map: buildMapStyle(), satellite: buildSatelliteStyle() };
  }
  return cachedStyles;
}

export function PlaceMap({ places, gnosisPlaces = [], onNavigate }: PlaceMapProps) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [tileLayer, setTileLayer] = useState<'map' | 'satellite'>('map');
  const [tileError, setTileError] = useState(false);
  const mapRef = useRef<MapRef>(null);

  const groups = useMemo(() => groupPlaces(places), [places]);
  const mappableGroups = useMemo(
    () => groups.filter(g => g.latitude != null && g.longitude != null),
    [groups]
  );

  // Gnosis places the user hasn't already tracked — dedup by lowercased name so the
  // tracked version always wins (same coords and name, but tracked ones carry verse refs).
  const userNames = useMemo(
    () => new Set(groups.map(g => g.name.toLowerCase().trim())),
    [groups]
  );
  const gnosisOnly = useMemo(
    () => gnosisPlaces.filter(g =>
      g.latitude != null && g.longitude != null &&
      !userNames.has(g.name.toLowerCase().trim())
    ),
    [gnosisPlaces, userNames]
  );
  const selectedGnosis = useMemo(
    () => selectedName ? gnosisOnly.find(g => g.name === selectedName) ?? null : null,
    [selectedName, gnosisOnly]
  );

  const effectiveSelectedName = selectedName && (
    groups.some(g => g.name === selectedName) || gnosisOnly.some(g => g.name === selectedName)
  )
    ? selectedName
    : null;

  const handleMapError = useCallback((e: { error: { message?: string; url?: string } }) => {
    const msg = e.error?.message ?? e.error?.url ?? '';
    if (msg.includes(PMTILES_URL) || msg.includes('pmtiles')) {
      setTileError(true);
    }
  }, []);

  const styles = getStyles();

  // All coordinates on the map, user + gnosis, used for initial fit bounds
  const allCoords = useMemo(
    () => [
      ...mappableGroups.map(g => [g.longitude!, g.latitude!] as [number, number]),
      ...gnosisOnly.map(g => [g.longitude!, g.latitude!] as [number, number]),
    ],
    [mappableGroups, gnosisOnly]
  );

  // Fit bounds when markers change
  const fitAll = useCallback(() => {
    const map = mapRef.current;
    if (!map || allCoords.length === 0) return;
    if (allCoords.length === 1) {
      map.flyTo({ center: allCoords[0], zoom: 8, duration: 0 });
      return;
    }
    const lngs = allCoords.map(c => c[0]);
    const lats = allCoords.map(c => c[1]);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 40, maxZoom: 10, duration: 0 }
    );
  }, [allCoords]);

  // Fly to selected place (either tracked or gnosis)
  const prevSelected = useRef<string | null>(null);
  useEffect(() => {
    if (!effectiveSelectedName || effectiveSelectedName === prevSelected.current) {
      if (prevSelected.current !== null && effectiveSelectedName === null) fitAll();
      prevSelected.current = effectiveSelectedName;
      return;
    }
    prevSelected.current = effectiveSelectedName;
    const group = mappableGroups.find(g => g.name === effectiveSelectedName);
    const gnosis = !group ? gnosisOnly.find(g => g.name === effectiveSelectedName) : null;
    const center: [number, number] | null = group
      ? [group.longitude!, group.latitude!]
      : gnosis ? [gnosis.longitude!, gnosis.latitude!] : null;
    if (!center) return;
    const map = mapRef.current;
    if (!map) return;
    const zoom = Math.max(map.getZoom(), 8);
    map.flyTo({ center, zoom, duration: 0.6 });
  }, [effectiveSelectedName, mappableGroups, gnosisOnly, fitAll]);

  const activeStyle = styles[tileLayer];

  return (
    <div className="flex h-full gap-2">
      {/* Sidebar list */}
      <div className="w-44 flex-shrink-0 flex flex-col bg-scripture-surface rounded-xl border border-scripture-border/50 overflow-hidden">
        <div className="px-3 py-2 border-b border-scripture-border/30 flex-shrink-0">
          <span className="text-xs font-medium text-scripture-muted uppercase tracking-wide">
            Places ({groups.length + gnosisOnly.length})
          </span>
        </div>
        {groups.length === 0 && gnosisOnly.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-3">
            <p className="text-xs text-scripture-muted text-center">No places yet.</p>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 custom-scrollbar p-1.5 space-y-0.5">
            {groups.length > 0 && (
              <div className="px-2 pt-1 pb-1 text-[10px] font-semibold text-scripture-muted uppercase tracking-wider">
                Tracked
              </div>
            )}
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
            {gnosisOnly.length > 0 && (
              <div className={`px-2 pb-1 text-[10px] font-semibold text-scripture-muted uppercase tracking-wider ${groups.length > 0 ? 'pt-3' : 'pt-1'}`}>
                In this chapter
              </div>
            )}
            {gnosisOnly.map(place => {
              const isSelected = effectiveSelectedName === place.name;
              return (
                <div
                  key={`gnosis-${place.slug}`}
                  className={`rounded-lg transition-colors ${
                    isSelected ? 'bg-scripture-accent' : ''
                  }`}
                >
                  <button
                    onClick={() => setSelectedName(place.name)}
                    className={`w-full text-left px-2.5 py-2 text-sm transition-colors rounded-lg ${
                      isSelected
                        ? 'text-scripture-bg'
                        : 'hover:bg-scripture-elevated text-scripture-muted italic'
                    }`}
                  >
                    {place.name}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 rounded-xl overflow-hidden border border-scripture-border/50 relative">
        <button
          onClick={() => { setTileLayer(t => t === 'map' ? 'satellite' : 'map'); setTileError(false); }}
          className="absolute top-2 right-2 z-10 px-2 py-1 text-xs font-medium bg-scripture-surface/95 hover:bg-scripture-surface text-scripture-text rounded shadow transition-colors"
        >
          {tileLayer === 'map' ? 'Satellite' : 'Map'}
        </button>
        {mappableGroups.length === 0 && gnosisOnly.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6">
            <p className="text-scripture-muted text-sm">No places with coordinates to display.</p>
            <p className="text-scripture-muted text-xs mt-2">
              New places are automatically geocoded when created.
            </p>
          </div>
        ) : (
          <MapGL
            ref={mapRef}
            initialViewState={{ longitude: 35.2342, latitude: 31.7767, zoom: 7 }}
            style={{ width: '100%', height: '100%' }}
            mapStyle={activeStyle}
            onLoad={fitAll}
            onError={handleMapError}
            attributionControl={{ compact: false }}
          >
            {tileError && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-scripture-surface/80 pointer-events-none">
                <p className="text-scripture-muted text-sm">Map tiles unavailable</p>
              </div>
            )}
            {mappableGroups.map(group => (
              <Marker
                key={group.name}
                longitude={group.longitude!}
                latitude={group.latitude!}
                anchor="center"
                onClick={(e) => { e.originalEvent.stopPropagation(); setSelectedName(group.name); }}
              >
                <div
                  style={{
                    width: group.name === effectiveSelectedName ? 14 : 11,
                    height: group.name === effectiveSelectedName ? 14 : 11,
                    borderRadius: '50%',
                    background: group.name === effectiveSelectedName ? '#f97316' : '#3b82f6',
                    border: '2px solid white',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.45)',
                    cursor: 'pointer',
                  }}
                />
              </Marker>
            ))}
            {gnosisOnly.map(place => (
              <Marker
                key={`gnosis-${place.slug}`}
                longitude={place.longitude!}
                latitude={place.latitude!}
                anchor="center"
                onClick={(e) => { e.originalEvent.stopPropagation(); setSelectedName(place.name); }}
              >
                <div
                  style={{
                    width: place.name === effectiveSelectedName ? 12 : 9,
                    height: place.name === effectiveSelectedName ? 12 : 9,
                    borderRadius: '50%',
                    background: place.name === effectiveSelectedName ? '#f97316' : '#94a3b8',
                    border: '2px solid white',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
                    cursor: 'pointer',
                    opacity: 0.9,
                  }}
                />
              </Marker>
            ))}
            {effectiveSelectedName && (() => {
              const group = mappableGroups.find(g => g.name === effectiveSelectedName);
              if (!group) {
                if (!selectedGnosis) return null;
                return (
                  <Popup
                    longitude={selectedGnosis.longitude!}
                    latitude={selectedGnosis.latitude!}
                    anchor="bottom"
                    onClose={() => setSelectedName(null)}
                    closeOnClick={false}
                    closeButton={false}
                    className="place-map-popup"
                  >
                    <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '13px', lineHeight: '1.6' }}>
                      <div style={{ fontWeight: 600, marginBottom: '4px', paddingRight: '16px' }}>{selectedGnosis.name}</div>
                      {selectedGnosis.featureType && (
                        <div style={{ color: '#888', fontSize: '11px', textTransform: 'capitalize' }}>
                          {selectedGnosis.featureType.replace(/_/g, ' ')}
                        </div>
                      )}
                      {selectedGnosis.modernName && selectedGnosis.modernName !== selectedGnosis.name && (
                        <div style={{ color: '#666', fontSize: '11px', fontStyle: 'italic' }}>
                          today: {selectedGnosis.modernName}
                        </div>
                      )}
                    </div>
                  </Popup>
                );
              }
              return (
                <Popup
                  longitude={group.longitude!}
                  latitude={group.latitude!}
                  anchor="bottom"
                  onClose={() => setSelectedName(null)}
                  closeOnClick={false}
                  closeButton={false}
                  className="place-map-popup"
                >
                  <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: '13px', lineHeight: '1.6' }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px', paddingRight: '16px' }}>{group.name}</div>
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
              );
            })()}
          </MapGL>
        )}
      </div>
    </div>
  );
}
