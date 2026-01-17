/**
 * Symbol Picker Component
 * 
 * Shows favorites, recents, and categorized symbols for Precept-style marking.
 */

import { SYMBOLS, type SymbolKey } from '@/types/annotation';

interface SymbolPickerProps {
  selectedSymbol: SymbolKey;
  onSelect: (symbol: SymbolKey) => void;
  recents: SymbolKey[];
}

// Symbol categories for organized display (Based on Precept Bible Study Method)
const SYMBOL_CATEGORIES: { name: string; symbols: SymbolKey[] }[] = [
  {
    name: 'Identity',
    symbols: ['triangle', 'cross', 'dove', 'flame'],
  },
  {
    name: 'People & Characters',
    symbols: ['person', 'crown', 'prayer'],
  },
  {
    name: 'Concepts & Themes',
    symbols: ['star', 'starOutline', 'heart', 'lightning', 'skull', 'shield'],
  },
  {
    name: 'Scripture & Teaching',
    symbols: ['scroll', 'book', 'tablet'],
  },
  {
    name: 'Time & Sequence',
    symbols: ['clock', 'calendar', 'hourglass', 'arrowRight', 'arrowLeft', 'doubleArrow'],
  },
  {
    name: 'Geography & Place',
    symbols: ['mapPin', 'mountain', 'globe'],
  },
  {
    name: 'Actions & States',
    symbols: ['water', 'fire', 'check', 'x'],
  },
  {
    name: 'General Markers',
    symbols: ['circle', 'square', 'diamond', 'hexagon'],
  },
  {
    name: 'Numbered & Letters',
    symbols: ['num1', 'num2', 'num3', 'num4', 'num5', 'letterA', 'letterB', 'letterC'],
  },
  {
    name: 'Punctuation',
    symbols: ['question', 'exclamation'],
  },
];

export function SymbolPicker({
  selectedSymbol,
  onSelect,
  recents,
}: SymbolPickerProps) {
  return (
    <div className="space-y-4 max-h-[40vh] overflow-y-auto custom-scrollbar">
      {/* Recents */}
      {recents.length > 0 && (
        <div>
          <h4 className="text-xs font-ui text-scripture-muted uppercase tracking-wider mb-2 flex items-center gap-1">
            <span>🕐</span> Recent
          </h4>
          <div className="flex flex-wrap gap-2.5">
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
          <div className="flex flex-wrap gap-2.5">
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
      className={`w-11 h-11 rounded-xl text-xl flex items-center justify-center
                 transition-all duration-200 touch-target shadow-sm
                 ${isSelected 
                   ? 'bg-scripture-accent text-scripture-bg scale-110 shadow-md ring-2 ring-scripture-text ring-offset-2 ring-offset-scripture-surface' 
                   : 'bg-scripture-elevated hover:bg-scripture-border hover:scale-105 hover:shadow-md active:scale-95'}`}
      aria-label={`Select ${symbol}`}
      title={symbol}
    >
      {SYMBOLS[symbol]}
    </button>
  );
}
