/**
 * Satellite/Map switch pinned to the top-right corner of a map box. The
 * parent must be `position: relative`.
 */

import type { MapLayer } from '@/lib/map/mapStyle';

interface MapLayerToggleProps {
  layer: MapLayer;
  onToggle: (layer: MapLayer) => void;
}

export function MapLayerToggle({ layer, onToggle }: MapLayerToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onToggle(layer === 'map' ? 'satellite' : 'map')}
      className="absolute top-2 right-2 z-10 px-2 py-1 text-xs font-medium bg-scripture-surface/95 hover:bg-scripture-surface text-scripture-text rounded shadow transition-colors"
    >
      {layer === 'map' ? 'Satellite' : 'Map'}
    </button>
  );
}
