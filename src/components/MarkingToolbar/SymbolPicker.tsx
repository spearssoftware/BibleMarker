/**
 * Symbol Picker Component
 * 
 * Shows favorites, recents, and categorized symbols for Precept-style marking.
 */

import { SYMBOLS, type SymbolKey } from '@/types/annotation';

interface SymbolPickerProps {
  selectedSymbol: SymbolKey;
  onSelect: (symbol: SymbolKey) => void;
  favorites: SymbolKey[];
  recents: SymbolKey[];
}

// Symbol categories for organized display
const SYMBOL_CATEGORIES: { name: string; symbols: SymbolKey[] }[] = [
  {
    name: 'Precept Marks',
    symbols: ['cross', 'triangle', 'circle', 'square', 'diamond', 'star', 'starOutline', 'hexagon'],
  },
  {
    name: 'Concepts',
    symbols: ['crown', 'dove', 'water', 'fire', 'lightning', 'skull', 'heart', 'prayer', 'book'],
  },
  {
    name: 'Time & Sequence',
    symbols: ['clock', 'calendar', 'hourglass', 'arrowRight', 'arrowLeft', 'arrowUp', 'arrowDown'],
  },
  {
    name: 'Numbered',
    symbols: ['num1', 'num2', 'num3', 'num4', 'num5', 'letterA', 'letterB', 'letterC'],
  },
  {
    name: 'Markers',
    symbols: ['question', 'exclamation', 'check', 'x'],
  },
];

export function SymbolPicker({
  selectedSymbol,
  onSelect,
  favorites,
  recents,
}: SymbolPickerProps) {
  return (
    <div className="space-y-4 max-h-[40vh] overflow-y-auto custom-scrollbar">
      {/* Favorites */}
      {favorites.length > 0 && (
        <div>
          <h4 className="text-xs font-ui text-scripture-muted uppercase tracking-wider mb-2 flex items-center gap-1">
            <span>⭐</span> Favorites
          </h4>
          <div className="flex flex-wrap gap-2">
            {favorites.map((symbol) => (
              <SymbolButton
                key={symbol}
                symbol={symbol}
                isSelected={selectedSymbol === symbol}
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
            {recents.map((symbol) => (
              <SymbolButton
                key={symbol}
                symbol={symbol}
                isSelected={selectedSymbol === symbol}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      )}

      {/* Categorized symbols */}
      {SYMBOL_CATEGORIES.map((category) => (
        <div key={category.name}>
          <h4 className="text-xs font-ui text-scripture-muted uppercase tracking-wider mb-2">
            {category.name}
          </h4>
          <div className="flex flex-wrap gap-2">
            {category.symbols.map((symbol) => (
              <SymbolButton
                key={symbol}
                symbol={symbol}
                isSelected={selectedSymbol === symbol}
                onSelect={onSelect}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface SymbolButtonProps {
  symbol: SymbolKey;
  isSelected: boolean;
  onSelect: (symbol: SymbolKey) => void;
}

function SymbolButton({ symbol, isSelected, onSelect }: SymbolButtonProps) {
  return (
    <button
      onClick={() => onSelect(symbol)}
      className={`w-10 h-10 rounded-lg text-xl flex items-center justify-center
                 transition-all touch-target
                 ${isSelected 
                   ? 'bg-scripture-accent text-scripture-bg scale-110' 
                   : 'bg-scripture-elevated hover:bg-scripture-border hover:scale-105'}`}
      aria-label={`Select ${symbol}`}
      title={symbol}
    >
      {SYMBOLS[symbol]}
    </button>
  );
}
