import { describe, it, expect } from 'vitest';
import {
  getTrackerForSymbol,
  getSymbolsForTracker,
  hasTrackerMapping,
} from '@/lib/observationSymbols';

describe('getTrackerForSymbol', () => {
  it('returns the mapping for a known symbol', () => {
    const result = getTrackerForSymbol('doubleArrow');
    expect(result?.tracker).toBe('contrast');
  });

  it('returns undefined for a symbol with no tracker mapping', () => {
    expect(getTrackerForSymbol('star')).toBeUndefined();
  });

  it('returns time tracker for clock symbol', () => {
    expect(getTrackerForSymbol('clock')?.tracker).toBe('time');
  });

  it('returns people tracker for person symbol', () => {
    expect(getTrackerForSymbol('person')?.tracker).toBe('people');
  });

  it('returns place tracker for mapPin symbol', () => {
    expect(getTrackerForSymbol('mapPin')?.tracker).toBe('place');
  });

  it('returns conclusion tracker for arrowRight symbol', () => {
    expect(getTrackerForSymbol('arrowRight')?.tracker).toBe('conclusion');
  });
});

describe('getSymbolsForTracker', () => {
  it('returns all time symbols', () => {
    const symbols = getSymbolsForTracker('time');
    expect(symbols).toContain('clock');
    expect(symbols).toContain('calendar');
    expect(symbols).toContain('hourglass');
    expect(symbols).toHaveLength(3);
  });

  it('returns all place symbols', () => {
    const symbols = getSymbolsForTracker('place');
    expect(symbols).toContain('mapPin');
    expect(symbols).toContain('mountain');
    expect(symbols).toContain('city');
    expect(symbols).toHaveLength(3);
  });

  it('returns all people symbols', () => {
    const symbols = getSymbolsForTracker('people');
    expect(symbols).toContain('person');
    expect(symbols).toContain('peopleGroup');
    expect(symbols).toHaveLength(2);
  });

  it('returns single symbol for contrast tracker', () => {
    const symbols = getSymbolsForTracker('contrast');
    expect(symbols).toEqual(['doubleArrow']);
  });

  it('returns empty array for tracker with no symbols', () => {
    expect(getSymbolsForTracker('lists')).toEqual([]);
  });
});

describe('hasTrackerMapping', () => {
  it('returns true for mapped symbols', () => {
    expect(hasTrackerMapping('clock')).toBe(true);
    expect(hasTrackerMapping('mapPin')).toBe(true);
    expect(hasTrackerMapping('person')).toBe(true);
    expect(hasTrackerMapping('arrowRight')).toBe(true);
  });

  it('returns false for symbol with no tracker mapping', () => {
    expect(hasTrackerMapping('star')).toBe(false);
  });
});
