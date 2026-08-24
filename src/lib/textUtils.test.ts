import { describe, it, expect } from 'vitest';
import { stripSymbols, pluralize } from './textUtils';

describe('stripSymbols', () => {
  it('returns empty string for empty input', () => {
    expect(stripSymbols('')).toBe('');
  });

  it('returns falsy values unchanged', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(stripSymbols(null as any)).toBe(null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(stripSymbols(undefined as any)).toBe(undefined);
  });

  it('removes known symbol characters from text', () => {
    const result = stripSymbols('In the beginning ▲ God created');
    expect(result).toBe('In the beginning God created');
  });

  it('preserves normal text without symbols', () => {
    expect(stripSymbols('In the beginning God created')).toBe('In the beginning God created');
  });

  it('cleans up extra whitespace left after symbol removal', () => {
    const result = stripSymbols('God  ▲  is  good');
    expect(result).toBe('God is good');
  });

  it('handles text with multiple different symbols', () => {
    const result = stripSymbols('▲ God ✝ Jesus 🕊 Spirit');
    expect(result).toBe('God Jesus Spirit');
  });
});

describe('pluralize', () => {
  it('uses the singular form for a count of 1, and the plural form otherwise', () => {
    expect(pluralize(1, 'person', 'people')).toBe('1 person');
    expect(pluralize(2, 'person', 'people')).toBe('2 people');
    expect(pluralize(0, 'person', 'people')).toBe('0 people');
  });

  it('defaults the plural form to singular + "s" when omitted', () => {
    expect(pluralize(3, 'hinge')).toBe('3 hinges');
  });
});
