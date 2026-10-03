/**
 * Shared MapLibre setup for the biblical-lands PMTiles basemap.
 * Used by the Analyze places map and the Discover chapter map.
 */

import * as maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers, namedFlavor } from '@protomaps/basemaps';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

let protocolRegistered = false;

/**
 * Register the `pmtiles://` protocol once; safe to call from every map module.
 * Also points MapLibre at a Vite-bundled copy of its worker: MapLibre 6 loads
 * the worker relative to its own module URL, which breaks once Vite pre-bundles
 * the module (dev) or the app is served from a non-http origin (Tauri), leaving
 * a blank basemap with only DOM markers.
 */
export function ensurePmtilesProtocol(): void {
  if (protocolRegistered) return;
  protocolRegistered = true;
  maplibregl.setWorkerUrl(maplibreWorkerUrl);
  const pmtilesProtocol = new Protocol();
  maplibregl.addProtocol('pmtiles', pmtilesProtocol.tile);
}

export const PMTILES_URL = import.meta.env.VITE_PMTILES_URL
  ?? (import.meta.env.DEV
    ? `${window.location.origin}/tiles/biblical-lands.pmtiles`
    : 'https://tiles.biblemarker.app/biblical-lands.pmtiles');

export const SOURCE_NAME = 'protomaps';

export function buildMapStyle(): StyleSpecification {
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

export function buildSatelliteStyle(): StyleSpecification {
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

export function getStyles() {
  if (!cachedStyles) {
    cachedStyles = { map: buildMapStyle(), satellite: buildSatelliteStyle() };
  }
  return cachedStyles;
}

/** True when a MapLibre error event came from loading the PMTiles basemap. */
export function isTileError(e: { error: { message?: string; url?: string } }): boolean {
  const msg = e.error?.message ?? e.error?.url ?? '';
  return msg.includes(PMTILES_URL) || msg.includes('pmtiles');
}

/** Bounding box `[[minLng, minLat], [maxLng, maxLat]]` of `[lng, lat]` coordinates. */
export function boundsFor(coords: [number, number][]): [[number, number], [number, number]] {
  const lngs = coords.map(c => c[0]);
  const lats = coords.map(c => c[1]);
  return [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
}
