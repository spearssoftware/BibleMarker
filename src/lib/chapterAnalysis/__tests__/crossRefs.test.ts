import { describe, it, expect } from 'vitest';
import { formatCrossRefTarget, isOlderTarget } from '../crossRefs';

describe('formatCrossRefTarget', () => {
  it('formats a single verse', () => {
    expect(formatCrossRefTarget('Gen.1.1', null)).toBe('Genesis 1:1');
  });

  it('formats a same-book, same-chapter range as "Psalms 45:6–7"', () => {
    expect(formatCrossRefTarget('Ps.45.6', 'Ps.45.7')).toBe('Psalms 45:6–7');
  });

  it('formats a same-book, cross-chapter range as "Deuteronomy 28:2–29:1"', () => {
    expect(formatCrossRefTarget('Deut.28.2', 'Deut.29.1')).toBe('Deuteronomy 28:2–29:1');
  });

  it('falls back to the start ref for a cross-book range', () => {
    expect(formatCrossRefTarget('Mal.4.5', 'Matt.11.14')).toBe('Malachi 4:5');
  });

  it('renders the plain start label when targetEndRef equals targetRef', () => {
    expect(formatCrossRefTarget('Ps.45.6', 'Ps.45.6')).toBe('Psalms 45:6');
  });
});

describe('isOlderTarget - the "older" rule', () => {
  it.each<[string, string, string, boolean]>([
    ['NT source -> OT target', 'John', 'Gen', true],
    ['OT source -> an earlier OT target', 'Isa', 'Gen', true],
    ['same-book target', 'John', 'John', false],
    ['NT -> NT target, even when it sorts earlier in canon order', 'Heb', 'Col', false],
    ['OT source -> a later OT target', 'Gen', 'Isa', false],
    ['OT source -> NT target (forward in time)', 'Ps', 'Matt', false],
  ])('%s: isOlderTarget(%s, %s) -> %s', (_label, sourceBookId, targetBookId, expected) => {
    expect(isOlderTarget(sourceBookId, targetBookId)).toBe(expected);
  });
});
