/**
 * OSIS markup → commentary paragraphs for MHCC entries.
 *
 * MHCC marks paragraphs and the preverse part with sID/eID milestone divs rather than nested
 * elements, so a flat tokenizer with a small state machine is enough; a tree parser buys nothing.
 */

import { BIBLE_BOOKS, parseOsisRef } from '@/types';
import type { CommentaryRun } from './types';

type Paragraph = CommentaryRun[];

/** Outline row: a section title keyed by the first verse of its range. */
export interface OutlineRow {
  start: number;
  title: string;
}

export interface ParsedEntry {
  /** Preverse prose before the first `Chapter N` / `Chapter Outline` title (chapter 1 only). */
  bookIntro: Paragraph[];
  /** Prose after the preverse part and before the label; everything after the preverse when unlabelled. */
  preLabel: Paragraph[];
  /** Prose after the `Verses N-M` label. */
  body: Paragraph[];
  hasLabel: boolean;
  outline: OutlineRow[];
}

const TOKEN = /<[^>]+>|[^<]+/g;
const OUTLINE_RANGE = /^\((\d+)(?:-(\d+))?(?:;.*)?\)$/;
const LABEL = /^Verses? \d/;
/** Rest of a label the source left outside the bold element, e.g. `Verse 7</hi> ,8` or `, 36-43`. */
const LABEL_TAIL = /^,\s*\d+(?:-\d+)?\s*/;
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const VALID_BOOKS = new Set(BIBLE_BOOKS.map((b) => b.id));

function cleanText(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name])
    .replace(/--/g, '—')
    .replace(/#\(/g, '(');
}

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(tag)?.[1];
}

function tagName(tag: string): string {
  return /^<\/?([A-Za-z]+)/.exec(tag)?.[1] ?? '';
}

function paragraphText(p: Paragraph): string {
  return p.map((r) => r.text).join('');
}

function cleanTitle(title: string): string {
  return title.trim().replace(/\s*(?:\.|—|;|,)$/, '').trim();
}

/** Collapse whitespace across a paragraph's runs, merging adjacent plain runs and dropping empties. */
function normalizeParagraph(runs: Paragraph): Paragraph {
  const merged: Paragraph = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && !last.osisRef && !run.osisRef) last.text += run.text;
    else merged.push({ ...run });
  }
  for (const run of merged) run.text = run.text.replace(/\s+/g, ' ');
  if (merged.length) {
    merged[0].text = merged[0].text.trimStart();
    merged[merged.length - 1].text = merged[merged.length - 1].text.trimEnd();
  }
  return merged.filter((r) => r.text !== '');
}

const INLINE_OUTLINE = /^(?:\s*[^()]+\(\s*(?:[1-3]\s?)?[A-Za-z]+\.?\s+\d+:\d+[^()]*\)\s*)+$/;
const INLINE_OUTLINE_ROW = /\s*([^()]+)\(\s*(?:[1-3]\s?)?[A-Za-z]+\.?\s+(\d+):(\d+)[^()]*\)/g;

/**
 * Rows from a one-paragraph outline of `Title. (Is. 2:1-9) Title. (Is. 2:10-22)` segments, all in one
 * chapter, with or without reference markup; null when the paragraph is anything else.
 */
function inlineOutlineRows(text: string): OutlineRow[] | null {
  if (!INLINE_OUTLINE.test(text)) return null;
  const matches = [...text.matchAll(INLINE_OUTLINE_ROW)];
  if (matches.some((m) => m[2] !== matches[0][2])) return null;
  return matches.map((m) => ({ start: Number(m[3]), title: cleanTitle(m[1]) }));
}

/**
 * Remove outline paragraphs, collecting their rows: `Chapter Outline`, each `(N-M)` line together
 * with the title paragraph before it, and one-paragraph outlines with references (see inlineOutlineRows).
 */
function harvestOutline(paragraphs: Paragraph[], rows: OutlineRow[]): Paragraph[] {
  const kept: Paragraph[] = [];
  for (const p of paragraphs) {
    const text = paragraphText(p);
    if (text === 'Chapter Outline') continue;
    const inline = inlineOutlineRows(text);
    if (inline) {
      rows.push(...inline);
      continue;
    }
    const range = OUTLINE_RANGE.exec(text);
    if (!range) {
      kept.push(p);
      continue;
    }
    const titlePara = kept.pop();
    if (titlePara) rows.push({ start: Number(range[1]), title: cleanTitle(paragraphText(titlePara)) });
  }
  return kept;
}

type Zone = 'bookIntro' | 'preverseTail' | 'preLabel' | 'body';

interface Scan {
  zones: Record<Zone, Paragraph[]>;
  hasLabel: boolean;
  tableRows: OutlineRow[];
}

function isPreverseMilestone(tag: string): boolean {
  return attr(tag, 'subType') === 'x-preverse';
}

/**
 * Walk the entry's tokens. With `zoned`, text before the first preverse eID goes to bookIntro (until
 * the first `x-s2` / `x-IS` title) then preverseTail; text after it goes to preLabel until the label,
 * then body. Without `zoned`, all text goes to preLabel.
 */
function scan(raw: string, zoned: boolean): Scan {
  const zones: Record<Zone, Paragraph[]> = { bookIntro: [], preverseTail: [], preLabel: [], body: [] };
  const tableRows: OutlineRow[] = [];
  const hasPreverse = zoned && /<div\b[^>]*subType="x-preverse"[^>]*\beID=/.test(raw);
  // Widened so TypeScript doesn't narrow it past the reassignments inside moveTo.
  let zone = (hasPreverse ? 'bookIntro' : 'preLabel') as Zone;
  let hasLabel = false;
  let current: Paragraph = [];
  let skip: 'title' | 'table' | 'hi' | null = null;
  let skipped = '';
  let row: string[] | null = null;
  let cell: string | null = null;
  let ref: { osisRef: string; text: string } | null = null;

  const flush = () => {
    const p = normalizeParagraph(current);
    if (p.length) zones[zone].push(p);
    current = [];
  };
  const moveTo = (next: Zone) => {
    flush();
    zone = next;
  };

  for (const [token] of raw.matchAll(TOKEN)) {
    if (!token.startsWith('<')) {
      const text = cleanText(token);
      if (skip === 'table') {
        if (cell !== null) cell += text;
      } else if (skip) {
        skipped += text;
      } else if (ref) {
        ref.text += text;
      } else {
        current.push({ text });
      }
      continue;
    }

    const name = tagName(token);
    const closing = token.startsWith('</');

    if (skip) {
      if (skip === 'table') {
        if (name === 'row' && !closing) {
          row = [];
        } else if (name === 'row') {
          pushRow(row, tableRows);
          row = null;
        } else if (name === 'cell' && !closing) {
          cell = '';
        } else if (name === 'cell') {
          row?.push(cell ?? '');
          cell = null;
        } else if (name === 'table' && closing) {
          skip = null;
        }
      } else if (closing && ((skip === 'title' && name === 'title') || (skip === 'hi' && name === 'hi'))) {
        if (skip === 'hi' && zoned && !hasLabel && LABEL.test(skipped.trim())) {
          hasLabel = true;
          moveTo('body');
        }
        skip = null;
      }
      continue;
    }

    if (name === 'title' && !closing) {
      const type = attr(token, 'type');
      if (zone === 'bookIntro' && (type === 'x-s2' || type === 'x-IS')) moveTo('preverseTail');
      if (!token.endsWith('/>')) {
        skip = 'title';
        skipped = '';
      }
    } else if (name === 'table' && !closing) {
      skip = 'table';
    } else if (name === 'hi' && !closing && attr(token, 'type') === 'bold') {
      skip = 'hi';
      skipped = '';
    } else if (name === 'reference') {
      if (!closing) {
        ref = { osisRef: attr(token, 'osisRef') ?? '', text: '' };
      } else if (ref) {
        // Only a verse reference can open inline; a chapter-only or unknown-book reference stays plain text.
        const target = parseOsisRef(ref.osisRef.split('-')[0]);
        const linkable = target?.verse !== undefined && VALID_BOOKS.has(target.book);
        current.push(linkable ? { text: ref.text, osisRef: ref.osisRef } : { text: ref.text });
        ref = null;
      }
    } else if (name === 'div' && attr(token, 'type') === 'x-p') {
      flush();
    } else if (
      name === 'div' &&
      hasPreverse &&
      (zone === 'bookIntro' || zone === 'preverseTail') &&
      isPreverseMilestone(token) &&
      attr(token, 'eID')
    ) {
      moveTo('preLabel');
    }
  }
  flush();
  return { zones, hasLabel, tableRows };
}

function pushRow(row: string[] | null, rows: OutlineRow[]): void {
  if (!row || row.length < 2) return;
  const range = OUTLINE_RANGE.exec(row[1].trim());
  if (range) rows.push({ start: Number(range[1]), title: cleanTitle(row[0]) });
}

/** Parse one verse entry into its zones, outline rows, and label state. */
export function parseEntry(raw: string): ParsedEntry {
  const { zones, hasLabel, tableRows } = scan(raw, true);
  const outline = [...tableRows];
  harvestOutline(zones.preverseTail, outline);
  const preLabel = harvestOutline(zones.preLabel, outline);
  outline.sort((a, b) => a.start - b.start);
  const lead = zones.body[0]?.[0];
  if (lead && !lead.osisRef) {
    lead.text = lead.text.replace(LABEL_TAIL, '');
    if (!lead.text) zones.body[0].shift();
    if (!zones.body[0].length) zones.body.shift();
  }
  return { bookIntro: zones.bookIntro, preLabel, body: zones.body, hasLabel, outline };
}

/** All prose in a book or chapter heading slot, ignoring preverse milestones, with outlines removed. */
export function headingProse(raw: string): Paragraph[] {
  return harvestOutline(scan(raw, false).zones.preLabel, []);
}
