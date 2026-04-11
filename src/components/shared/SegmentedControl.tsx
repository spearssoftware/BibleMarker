import { ReactNode } from 'react';

export type SegmentedSize = 'sm' | 'md';
export type SegmentedColumns = 2 | 3 | 4 | 5 | 6;

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Chip size. Defaults to `md`. */
  size?: SegmentedSize;
  /** When set, lays out options in a grid with the given number of columns. Otherwise uses a flex row. */
  columns?: SegmentedColumns;
  ariaLabel?: string;
  className?: string;
}

const GRID_COLS_CLASSES: Record<SegmentedColumns, string> = {
  2: 'grid grid-cols-2 gap-2',
  3: 'grid grid-cols-3 gap-2',
  4: 'grid grid-cols-4 gap-2',
  5: 'grid grid-cols-5 gap-2',
  6: 'grid grid-cols-6 gap-2',
};

const SIZE_CLASSES: Record<SegmentedSize, string> = {
  sm: 'px-3 py-1 text-xs',
  md: 'px-3 py-2 text-sm',
};

const BASE_BUTTON_CLASSES = 'font-ui rounded-lg transition-colors text-center';
const SELECTED_CLASSES = 'bg-scripture-accent text-scripture-bg';
const UNSELECTED_CLASSES = 'bg-scripture-elevated text-scripture-text hover:bg-scripture-border/50';

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  columns,
  ariaLabel,
  className = '',
}: SegmentedControlProps<T>) {
  const containerClasses = columns ? GRID_COLS_CLASSES[columns] : 'flex items-center gap-2';
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={`${containerClasses} ${className}`}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={`${BASE_BUTTON_CLASSES} ${SIZE_CLASSES[size]} ${
              selected ? SELECTED_CLASSES : UNSELECTED_CLASSES
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
