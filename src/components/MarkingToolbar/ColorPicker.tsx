/**
 * Color Picker Component
 * 
 * Shows favorites, recents, and full color palette.
 */

import { HIGHLIGHT_COLORS, type HighlightColor } from '@/types/annotation';

interface ColorPickerProps {
  selectedColor: HighlightColor;
  onSelect: (color: HighlightColor) => void;
  favorites: HighlightColor[];
  recents: HighlightColor[];
}

export function ColorPicker({ 
  selectedColor, 
  onSelect, 
  favorites, 
  recents 
}: ColorPickerProps) {
  const allColors = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[];

  return (
    <div className="space-y-4">
      {/* Favorites */}
      {favorites.length > 0 && (
        <div>
          <h4 className="text-xs font-ui text-scripture-muted uppercase tracking-wider mb-2 flex items-center gap-1">
            <span>⭐</span> Favorites
          </h4>
          <div className="flex flex-wrap gap-2">
            {favorites.map((color) => (
              <ColorButton
                key={color}
                color={color}
                isSelected={selectedColor === color}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}

      {/* Recents */}
      {recents.length > 0 && (
        <div>
          <h4 className="text-xs font-ui text-scripture-muted uppercase tracking-wider mb-2 flex items-center gap-1">
            <span>🕐</span> Recent
          </h4>
          <div className="flex flex-wrap gap-2">
            {recents.map((color) => (
              <ColorButton
                key={color}
                color={color}
                isSelected={selectedColor === color}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}

      {/* All colors - always show all colors */}
      <div>
        <h4 className="text-xs font-ui text-scripture-muted uppercase tracking-wider mb-2">
          All Colors
        </h4>
        <div className="flex flex-wrap gap-2">
          {allColors.map((color) => (
            <ColorButton
              key={color}
              color={color}
              isSelected={selectedColor === color}
              onSelect={onSelect}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface ColorButtonProps {
  color: HighlightColor;
  isSelected: boolean;
  onSelect: (color: HighlightColor) => void;
}

function ColorButton({ color, isSelected, onSelect }: ColorButtonProps) {
  return (
    <button
      onClick={() => onSelect(color)}
      className={`w-10 h-10 rounded-lg transition-all touch-target
                 ${isSelected 
                   ? 'ring-2 ring-scripture-text ring-offset-2 ring-offset-scripture-surface scale-110' 
                   : 'hover:scale-105'}`}
      style={{ backgroundColor: HIGHLIGHT_COLORS[color] }}
      aria-label={`Select ${color}`}
      title={color}
    />
  );
}
