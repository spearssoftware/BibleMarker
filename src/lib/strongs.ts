/**
 * Strong's Dictionary Lookup
 *
 * Lazy-loads Hebrew/Greek Strong's dictionaries from public JSON files.
 * Data sourced from openscriptures/strongs (public domain).
 */

export interface StrongsEntry {
  lemma: string;
  xlit: string;
  pronounce?: string;
  strongs_def: string;
  kjv_def?: string;
}

interface RawHebrewEntry {
  lemma: string;
  xlit: string;
  pron: string;
  strongs_def: string;
  kjv_def?: string;
}

interface RawGreekEntry {
  lemma: string;
  translit: string;
  strongs_def: string;
  kjv_def?: string;
}

let hebrewDict: Record<string, RawHebrewEntry> | null = null;
let greekDict: Record<string, RawGreekEntry> | null = null;
let hebrewLoading: Promise<void> | null = null;
let greekLoading: Promise<void> | null = null;

async function loadHebrew(): Promise<void> {
  if (hebrewDict) return;
  if (hebrewLoading) return hebrewLoading;
  hebrewLoading = fetch('/strongs-hebrew.json')
    .then((r) => r.json())
    .then((data) => { hebrewDict = data; });
  return hebrewLoading;
}

async function loadGreek(): Promise<void> {
  if (greekDict) return;
  if (greekLoading) return greekLoading;
  greekLoading = fetch('/strongs-greek.json')
    .then((r) => r.json())
    .then((data) => { greekDict = data; });
  return greekLoading;
}

export async function lookupStrongs(number: string): Promise<StrongsEntry | null> {
  const upper = number.toUpperCase();
  if (upper.startsWith('H')) {
    await loadHebrew();
    const entry = hebrewDict?.[upper];
    if (!entry) return null;
    return {
      lemma: entry.lemma,
      xlit: entry.xlit,
      pronounce: entry.pron,
      strongs_def: entry.strongs_def,
      kjv_def: entry.kjv_def,
    };
  }
  if (upper.startsWith('G')) {
    await loadGreek();
    const entry = greekDict?.[upper];
    if (!entry) return null;
    return {
      lemma: entry.lemma,
      xlit: entry.translit,
      strongs_def: entry.strongs_def,
      kjv_def: entry.kjv_def,
    };
  }
  return null;
}
