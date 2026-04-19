/**
 * Symbol Picker Component
 *
 * Shows favorites, recents, and categorized symbols for Precept-style marking.
 * Symbols and Letters/Numbers are in an accordion — only one section open at a time.
 */

import { useState } from 'react';
import { SYMBOL_LABELS, type SymbolKey } from '@/types';
import { SymbolIcon } from '@/lib/symbolDisplay';

interface SymbolPickerProps {
  selectedSymbol: SymbolKey;
  onSelect: (symbol: SymbolKey) => void;
  recents: SymbolKey[];
}

type AccordionSection = 'symbols' | 'letters';

// Symbol categories for organized display (Based on Precept Bible Study Method)
const SYMBOL_CATEGORIES: { name: string; symbols: SymbolKey[] }[] = [
  {
    name: 'Identity',
    symbols: ['triangle', 'cross', 'dove', 'flame', 'angel', 'lamb', 'anchor', 'cloud'],
  },
  {
    name: 'People & Characters',
    symbols: ['person', 'peopleGroup', 'crown', 'prayer'],
  },
  {
    name: 'Obedience & Freedom',
    symbols: ['obey', 'chains', 'liberty'],
  },
  {
    name: 'Concepts & Themes',
    symbols: ['star', 'starOutline', 'heart', 'joy', 'peace', 'mercy', 'wisdom', 'praise', 'repentance', 'lightning', 'skull', 'sin', 'shield', 'scales', 'key', 'sun', 'moon', 'cup', 'sword', 'vine', 'bread', 'rock', 'door', 'harvest', 'warning'],
  },
  {
    name: 'Scripture & Teaching',
    symbols: ['scroll', 'book', 'tablet', 'lamp'],
  },
  {
    name: 'Time & Sequence',
    symbols: ['clock', 'calendar', 'hourglass', 'arrowRight', 'arrowLeft', 'doubleArrow'],
  },
  {
    name: 'Geography & Place',
    symbols: ['mapPin', 'nationLand', 'mountain', 'globe', 'tree', 'river', 'house', 'temple', 'church', 'city'],
  },
  {
    name: 'Actions & States',
    symbols: ['water', 'fire', 'check', 'x', 'hand', 'eye', 'mouth', 'foot'],
  },
  {
    name: 'General Markers',
    symbols: ['circle', 'square', 'diamond', 'hexagon', 'plus', 'minus'],
  },
  {
    name: 'Punctuation',
    symbols: ['question', 'exclamation', 'asterisk'],
  },
];

const LETTER_SYMBOLS: SymbolKey[] = [
  'letterA', 'letterB', 'letterC', 'letterD', 'letterE', 'letterF',
  'letterG', 'letterH', 'letterI', 'letterJ', 'letterK', 'letterL',
  'letterM', 'letterN', 'letterO', 'letterP', 'letterQ', 'letterR',
  'letterS', 'letterT', 'letterU', 'letterV', 'letterW', 'letterX',
  'letterY', 'letterZ',
];

const NUMBER_SYMBOLS: SymbolKey[] = [
  'number0', 'number1', 'number2', 'number3', 'number4',
  'number5', 'number6', 'number7', 'number8', 'number9',
];

export function SymbolPicker({
  selectedSymbol,
  onSelect,
  recents,
}: SymbolPickerProps) {
  const [openSection, setOpenSection] = useState<AccordionSection>('symbols');

  const toggleSection = (section: AccordionSection) => {
    setOpenSection(prev => prev === section ? section : section);
  };

  return (
    <div className="space-y-4">
      {/* Recents */}
      {recents.length > 0 && (
        <div>
          <h4 className="text-xs font-ui text-scripture-text uppercase tracking-wider mb-3 flex items-center gap-1 font-semibold">
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

      {/* Symbols accordion section */}
      <div>
        <button
          onClick={() => toggleSection('symbols')}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-ui text-scripture-text uppercase tracking-wider font-semibold bg-scripture-elevated hover:bg-scripture-border transition-colors"
        >
          <span>Symbols</span>
          <span className={`text-scripture-muted transition-transform duration-200 text-[10px] ${openSection === 'symbols' ? '' : '-rotate-90'}`}>▶</span>
        </button>
        {openSection === 'symbols' && (
          <div className="space-y-6 pt-2">
            {SYMBOL_CATEGORIES.map((category) => (
              <div key={category.name}>
                <h4 className="text-xs font-ui text-scripture-muted uppercase tracking-wider mb-3">
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
        )}
      </div>

      {/* Letters & Numbers accordion section */}
      <div>
        <button
          onClick={() => toggleSection('letters')}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-ui text-scripture-text uppercase tracking-wider font-semibold bg-scripture-elevated hover:bg-scripture-border transition-colors"
        >
          <span>Letters & Numbers</span>
          <span className={`text-scripture-muted transition-transform duration-200 text-[10px] ${openSection === 'letters' ? '' : '-rotate-90'}`}>▶</span>
        </button>
        {openSection === 'letters' && (
          <div className="flex flex-wrap gap-2.5 pt-2">
            {LETTER_SYMBOLS.map((symbol) => (
              <SymbolButton
                key={symbol}
                symbol={symbol}
                isSelected={selectedSymbol === symbol}
                onSelect={onSelect}
              />
            ))}
            {NUMBER_SYMBOLS.map((symbol) => (
              <SymbolButton
                key={symbol}
                symbol={symbol}
                isSelected={selectedSymbol === symbol}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface SymbolButtonProps {
  symbol: SymbolKey;
  isSelected: boolean;
  onSelect: (symbol: SymbolKey) => void;
}

function SymbolButton({ symbol, isSelected, onSelect }: SymbolButtonProps) {
  const isLetterOrNumber = symbol.startsWith('letter') || symbol.startsWith('number');
  return (
    <button
      onClick={() => onSelect(symbol)}
      className={`w-16 h-16 rounded-xl flex flex-col items-center justify-center gap-0.5 px-1
                 transition-all duration-200 touch-target shadow-sm
                 ${isSelected
                   ? 'bg-scripture-accent text-scripture-bg scale-110 shadow-md ring-2 ring-scripture-text ring-offset-2 ring-offset-scripture-surface'
                   : 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border hover:shadow-md'}`}
      aria-label={`Select ${SYMBOL_LABELS[symbol]}`}
      title={SYMBOL_LABELS[symbol]}
    >
      <SymbolIcon symbol={symbol} size={isLetterOrNumber ? 22 : 24} />
      {!isLetterOrNumber && (
        <span className="text-[10px] leading-tight font-ui truncate max-w-full">
          {SYMBOL_LABELS[symbol]}
        </span>
      )}
    </button>
  );
}
