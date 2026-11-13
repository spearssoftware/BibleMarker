import { describe, expect, it } from 'vitest';
import {
  addDays,
  daysBehind,
  daysBetween,
  dueDate,
  isValidDateString,
  shiftedStartDate,
  todayLocal,
} from './dates';

describe('todayLocal', () => {
  it('uses the local calendar fields', () => {
    expect(todayLocal(new Date(2026, 0, 5, 23, 59, 59))).toBe('2026-01-05');
    expect(todayLocal(new Date(2026, 11, 31, 0, 0, 0))).toBe('2026-12-31');
  });
});

describe('addDays', () => {
  it('crosses a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('knows leap days', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
  });

  it('moves backwards and across a year', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(addDays('2026-11-13', 0)).toBe('2026-11-13');
  });

  it('is not shifted by daylight saving changes', () => {
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(addDays('2026-03-07', 365)).toBe('2027-03-07');
  });
});

describe('daysBetween', () => {
  it('counts calendar days in either direction', () => {
    expect(daysBetween('2026-01-30', '2026-02-02')).toBe(3);
    expect(daysBetween('2026-02-02', '2026-01-30')).toBe(-3);
    expect(daysBetween('2026-03-07', '2026-03-09')).toBe(2);
  });
});

describe('isValidDateString', () => {
  it('accepts real calendar dates only', () => {
    expect(isValidDateString('2028-02-29')).toBe(true);
    expect(isValidDateString('2027-02-29')).toBe(false);
    expect(isValidDateString('2026-13-01')).toBe(false);
    expect(isValidDateString('2026-1-1')).toBe(false);
    expect(isValidDateString(20260101)).toBe(false);
  });
});

describe('due, behind and shift', () => {
  it('makes day 1 due on the start date', () => {
    expect(dueDate('2026-11-13', 1)).toBe('2026-11-13');
    expect(dueDate('2026-11-13', 3)).toBe('2026-11-15');
  });

  it('counts days behind across a month boundary', () => {
    expect(daysBehind('2026-01-29', 1, '2026-02-01')).toBe(3);
  });

  it('is not behind on the due date, before it, or when the start is in the future', () => {
    expect(daysBehind('2026-11-13', 1, '2026-11-13')).toBe(0);
    expect(daysBehind('2026-11-13', 4, '2026-11-13')).toBe(0);
    expect(daysBehind('2026-11-20', 1, '2026-11-13')).toBe(0);
  });

  it('shifts the start so the day is due today', () => {
    const start = shiftedStartDate(5, '2026-03-02');
    expect(start).toBe('2026-02-26');
    expect(dueDate(start, 5)).toBe('2026-03-02');
    expect(daysBehind(start, 5, '2026-03-02')).toBe(0);
  });
});
