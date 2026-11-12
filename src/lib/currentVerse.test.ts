import { describe, it, expect } from 'vitest';
import { pickCurrentVerse, type PickCurrentVerseInput } from './currentVerse';

const rows = [
  { verse: 1, top: 0, height: 100 },
  { verse: 2, top: 100, height: 100 },
  { verse: 3, top: 200, height: 100 },
];

const base: PickCurrentVerseInput = {
  scrollTop: 50,
  clientHeight: 200,
  scrollHeight: 1000,
  containerTop: 0,
  rows,
  minVerse: 1,
  maxVerse: 3,
};

describe('pickCurrentVerse', () => {
  it('returns minVerse at the top', () => {
    expect(pickCurrentVerse({ ...base, scrollTop: 0, rows: rows.slice(1) })).toBe(1);
  });

  it('returns maxVerse at the bottom', () => {
    expect(pickCurrentVerse({ ...base, scrollTop: 800 })).toBe(3);
  });

  it('picks the row whose center is nearest the container center', () => {
    // target = 100; centers 0, 100, 200 after shift
    expect(pickCurrentVerse({ ...base, rows: rows.map((r) => ({ ...r, top: r.top - 50 })) })).toBe(2);
  });

  it('breaks ties toward the lower verse', () => {
    // target = 100 sits exactly between centers 50 and 150
    expect(pickCurrentVerse({ ...base, rows: [rows[1], rows[0]] })).toBe(1);
  });

  it('clamps to the verse range', () => {
    expect(pickCurrentVerse({ ...base, minVerse: 2, maxVerse: 2 })).toBe(2);
  });

  it('returns null for no rows', () => {
    expect(pickCurrentVerse({ ...base, rows: [] })).toBeNull();
  });

  it('treats 1px from the edges as the edge', () => {
    expect(pickCurrentVerse({ ...base, scrollTop: 1 })).toBe(1);
    expect(pickCurrentVerse({ ...base, scrollTop: 799 })).toBe(3);
  });

  it('gives minVerse for a chapter that fits without scrolling', () => {
    expect(pickCurrentVerse({ ...base, scrollTop: 0, clientHeight: 500, scrollHeight: 500 })).toBe(1);
  });
});
