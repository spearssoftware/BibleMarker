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

export function PlaceMap({ places, onNavigate }: PlaceMapProps) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [tileLayer, setTileLayer] = useState<'map' | 'satellite'>('map');
  const [tileError, setTileError] = useState(false);
  const mapRef = useRef<MapRef>(null);

  const groups = useMemo(() => groupPlaces(places), [places]);
  const mappableGroups = useMemo(
    () => groups.filter(g => g.latitude != null && g.longitude != null),
    [groups]
  );

  const effectiveSelectedName = selectedName && groups.some(g => g.name === selectedName)
    ? selectedName
    : null;

  const handleMapError = useCallback((e: { error: { message?: string; url?: string } }) => {
    const msg = e.error?.message ?? e.error?.url ?? '';
    if (msg.includes(PMTILES_URL) || msg.includes('pmtiles')) {
      setTileError(true);
    }
  }, []);

  const styles = getStyles();

  // Fit bounds when groups change
  const fitAll = useCallback(() => {
    const map = mapRef.current;
    if (!map || mappableGroups.length === 0) return;
    if (mappableGroups.length === 1) {
      map.flyTo({ center: [mappableGroups[0].longitude!, mappableGroups[0].latitude!], zoom: 8, duration: 0 });
      return;
    }
    const lngs = mappableGroups.map(g => g.longitude!);
    const lats = mappableGroups.map(g => g.latitude!);
    map.fitBounds(
      [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
      { padding: 40, maxZoom: 10, duration: 0 }
    );
  }, [mappableGroups]);

  // Fly to selected place
  const prevSelected = useRef<string | null>(null);
  useEffect(() => {
    if (!effectiveSelectedName || effectiveSelectedName === prevSelected.current) {
      if (prevSelected.current !== null && effectiveSelectedName === null) fitAll();
      prevSelected.current = effectiveSelectedName;
      return;
    }
    prevSelected.current = effectiveSelectedName;
    const group = mappableGroups.find(g => g.name === effectiveSelectedName);
    if (!group) return;
    const map = mapRef.current;
    if (!map) return;
    const zoom = Math.max(map.getZoom(), 8);
    map.flyTo({ center: [group.longitude!, group.latitude!], zoom, duration: 0.6 });
  }, [effectiveSelectedName, mappableGroups, fitAll]);

  const activeStyle = styles[tileLayer];

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
        {mappableGroups.length === 0 ? (
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
            {effectiveSelectedName && (() => {
              const group = mappableGroups.find(g => g.name === effectiveSelectedName);
              if (!group) return null;
              return (
                <Popup
                  longitude={group.longitude!}
                  latitude={group.latitude!}
                  anchor="bottom"
                  onClose={() => setSelectedName(null)}
                  closeOnClick={false}
                  className="place-map-popup"
                >
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
              );
            })()}
          </MapGL>
        )}
      </div>
    </div>
  );
}
