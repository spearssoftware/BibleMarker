/**
 * Color Picker Component
 * 
 * Shows favorites, recents, and full color palette.
 */

import { HIGHLIGHT_COLORS, type HighlightColor } from '@/types/annotation';

interface ColorPickerProps {
  selectedColor: HighlightColor;
  onSelect: (color: HighlightColor) => void;
  recents: HighlightColor[];
}

export function ColorPicker({ 
  selectedColor, 
  onSelect, 
  recents 
}: ColorPickerProps) {
  const allColors = Object.keys(HIGHLIGHT_COLORS) as HighlightColor[];

  return (
    <div className="space-y-4">
      {/* Recents */}
      {recents.length > 0 && (
        <div>
          <h4 className="text-xs font-ui text-scripture-muted uppercase tracking-wider mb-2 flex items-center gap-1">
            <span>🕐</span> Recent
          </h4>
        <div className="flex flex-wrap gap-2.5">
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
        <div className="flex flex-wrap gap-2.5">
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
      className={`w-11 h-11 rounded-xl transition-all duration-200 touch-target shadow-sm
                 ${isSelected 
                   ? 'ring-2 ring-scripture-text ring-offset-2 ring-offset-scripture-surface scale-110 shadow-md' 
                   : 'hover:scale-105 hover:shadow-md active:scale-95'}`}
      style={{ backgroundColor: HIGHLIGHT_COLORS[color] }}
      aria-label={`Select ${color}`}
      title={color}
    />
  );
}
