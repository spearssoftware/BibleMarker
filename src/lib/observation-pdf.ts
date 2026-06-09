/**
 * Observation Report PDF export.
 *
 * Builds a study-scoped, keyword-first inductive-study report (the "observe
 * panel" data) using the shared PDF core in `./pdf/*`. Sections: keyword
 * legend, observation lists, places, people, time/chronology, conclusions,
 * interpretation, application. Empty sections are omitted.
 *
 * Scoping: entries are filtered by study id, and when the study targets a
 * single book they are further restricted to that book so cross-book markings
 * don't leak in. Topical/no-book studies fall back to the study-id filter.
 */

import type {
  ApplicationEntry,
  Conclusion,
  InterpretationEntry,
  MarkingPreset,
  ObservationList,
  Person,
  Place,
  Study,
  TimeExpression,
  VerseRef,
} from '@/types';
import { BIBLE_BOOKS, formatVerseRef, getBookById, getHighlightColorHex, type HighlightColor } from '@/types';
import { filterPresetsByStudy } from '@/lib/studyFilter';
import {
  getAllApplications,
  getAllConclusions,
  getAllInterpretations,
  getAllMarkingPresets,
  getAllObservationLists,
  getAllPeople,
  getAllPlaces,
  getAllTimeExpressions,
  getBookKeywordMarkCounts,
} from '@/lib/database';
import { PageWriter, loadJsPDF, type JsPDFDoc } from '@/lib/pdf/page-writer';
import { buildPresetIconCache, iconCacheKey } from '@/lib/pdf/symbol-cache';
import { savePdfBytes, openSavedPdf, slugify } from '@/lib/pdf/save';

export { openSavedPdf };

export interface BuildObservationPdfInput {
  /** The study to report on; its id scopes every section. */
  study: Study;
  /** All marking presets (filtered to the study internally for the legend). */
  presets: MarkingPreset[];
  /** Raw observation data (filtered to the study internally). */
  lists: ObservationList[];
  places: Place[];
  people: Person[];
  time: TimeExpression[];
  conclusions: Conclusion[];
  interpretations: InterpretationEntry[];
  applications: ApplicationEntry[];
  /** Per-preset keyword mark counts within the study's book, for the legend.
   *  Absent → the legend falls back to each preset's global usage count. */
  markCounts?: Record<string, number>;
}

// --- Pure helpers (study filtering / grouping) -------------------------------

/**
 * The trackers' study filter: when a study is active, keep global (no studyId)
 * entries plus entries matching the active study; with no active study, keep
 * everything. Mirrors PlaceTracker/PeopleTracker/TimeTracker.
 */
export function filterByStudy<T extends { studyId?: string }>(items: T[], activeStudyId: string | null): T[] {
  if (!activeStudyId) return items;
  return items.filter((e) => !e.studyId || e.studyId === activeStudyId);
}

/**
 * Book-scope a study report: when the study targets a single book, keep only
 * entries whose verse falls in that book. This drops cross-book entries that
 * the studyId filter alone would let through — e.g. another book's verses that
 * were marked while this study was active, or global (no-studyId) markings.
 * With no book set (topical/Prayer studies) it's a no-op.
 */
export function filterByBook<T extends { verseRef: VerseRef }>(items: T[], book: string | undefined): T[] {
  if (!book) return items;
  return items.filter((e) => e.verseRef.book === book);
}

/**
 * Conclusions have no `studyId`. Include a conclusion when it has no preset
 * link (free-form/manual — always shown) or its preset is one the active study
 * includes (global presets always pass via filterPresetsByStudy).
 */
export function filterConclusions(conclusions: Conclusion[], includedPresetIds: Set<string>): Conclusion[] {
  return conclusions.filter((c) => !c.presetId || includedPresetIds.has(c.presetId));
}

function refLabel(ref: VerseRef): string {
  return formatVerseRef(ref.book, ref.chapter, ref.verse);
}

/** Label a (possibly multi-verse) passage. A same-chapter range collapses to
 *  "John 3:16–18"; a cross-chapter range keeps the end chapter ("John 3:16–4:2"). */
function passageLabel(start: VerseRef, end?: VerseRef): string {
  if (!end) return refLabel(start);
  if (end.book === start.book && end.chapter === start.chapter) {
    return `${refLabel(start)}–${end.verse}`;
  }
  return `${refLabel(start)}–${formatVerseRef(end.book, end.chapter, end.verse)}`;
}

function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

const BOOK_ORDER = new Map(BIBLE_BOOKS.map((b, i) => [b.id, i]));

function compareRef(a: VerseRef, b: VerseRef): number {
  return ((BOOK_ORDER.get(a.book) ?? 0) - (BOOK_ORDER.get(b.book) ?? 0))
    || (a.chapter - b.chapter) || (a.verse - b.verse);
}

/** Group entries by their linked preset id; entries with no preset (or whose
 *  preset isn't in `presetOrder` — e.g. deleted) go under a trailing `null` key
 *  rendered as "Other". Returns groups in preset order, "Other" last. */
function groupByPreset<T extends { presetId?: string }>(
  items: T[],
  presetOrder: MarkingPreset[],
): Array<{ preset: MarkingPreset | null; items: T[] }> {
  const byId = new Map<string, T[]>();
  const manual: T[] = [];
  for (const item of items) {
    if (item.presetId) {
      const list = byId.get(item.presetId) ?? [];
      list.push(item);
      byId.set(item.presetId, list);
    } else {
      manual.push(item);
    }
  }
  const out: Array<{ preset: MarkingPreset | null; items: T[] }> = [];
  const emitted = new Set<string>();
  for (const preset of presetOrder) {
    const list = byId.get(preset.id);
    if (list && list.length > 0) {
      out.push({ preset, items: list });
      emitted.add(preset.id);
    }
  }
  // Fold entries whose presetId didn't match any known preset (deleted/orphaned)
  // into "Other" so they aren't silently dropped from the report.
  for (const [id, list] of byId) {
    if (!emitted.has(id)) manual.push(...list);
  }
  if (manual.length > 0) out.push({ preset: null, items: manual });
  return out;
}

// --- Observation layout writer ----------------------------------------------

class ObservationPageWriter extends PageWriter {
  /** Bold section heading with a thin underline rule. */
  sectionHeading(title: string): void {
    this.y += 16;
    // Reserve the heading plus a following row so a heading never strands alone
    // at the bottom of a page with its content on the next.
    this.ensureSpace(28 + 22);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(15);
    this.doc.setTextColor(28, 28, 28);
    this.doc.text(title, this.opts.marginLeft, this.y + 13);
    this.y += 18;
    this.doc.setDrawColor(210, 210, 210);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.opts.marginLeft, this.y, this.pageWidth - this.opts.marginRight, this.y);
    this.y += 8;
  }

  /** A keyword row/group header: its symbol icon, the word, and optional gray meta. */
  keywordHeading(iconDataUrl: string | null, label: string, meta?: string): void {
    const size = 13;
    this.y += 7;
    // Reserve the heading plus one entry row so the group header keeps company.
    this.ensureSpace(size + 6 + 16);
    const x = this.opts.marginLeft;
    if (iconDataUrl) this.doc.addImage(iconDataUrl, 'PNG', x, this.y, size, size);
    const textX = x + (iconDataUrl ? size + 5 : 0);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11.5);
    this.doc.setTextColor(40, 40, 40);
    this.doc.text(label, textX, this.y + size - 2);
    if (meta) {
      const w = this.doc.getTextWidth(label);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(9);
      this.doc.setTextColor(150, 150, 150);
      this.doc.text(meta, textX + w + 8, this.y + size - 2);
    }
    this.y += size + 3;
  }

  /**
   * A single entry: a gray ref tag followed by the primary text (wrapped to a
   * hanging indent), then an optional italic notes sub-line.
   */
  entry(ref: string, text: string, notes?: string, indent = 14): void {
    const fontSize = 10;
    const lineHeight = fontSize * 1.32;
    const left = this.opts.marginLeft + indent;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(fontSize);
    const refW = this.doc.getTextWidth(ref + '   ');
    const textLeft = left + refW;
    const textWidth = Math.max(60, this.opts.marginLeft + this.contentWidth - textLeft);
    const lines = this.doc.splitTextToSize(text || '', textWidth);

    this.ensureSpace(lineHeight);
    this.doc.setTextColor(120, 120, 135);
    this.doc.text(ref, left, this.y + fontSize);
    this.doc.setTextColor(20, 20, 20);
    this.doc.text(lines[0] ?? '', textLeft, this.y + fontSize);
    this.y += lineHeight;
    for (let i = 1; i < lines.length; i++) {
      this.ensureSpace(lineHeight);
      this.doc.text(lines[i], textLeft, this.y + fontSize);
      this.y += lineHeight;
    }
    if (notes) {
      const nSize = 9;
      const nLH = nSize * 1.3;
      this.doc.setFont('helvetica', 'italic');
      this.doc.setFontSize(nSize);
      this.doc.setTextColor(110, 110, 135);
      const nLines = this.doc.splitTextToSize(notes, this.opts.marginLeft + this.contentWidth - textLeft);
      for (const nl of nLines) {
        this.ensureSpace(nLH);
        this.doc.text(nl, textLeft, this.y + nSize);
        this.y += nLH;
      }
      this.doc.setFont('helvetica', 'normal');
    }
  }

  /** A labelled free-text field (Interpretation/Application guided questions). */
  field(label: string, value: string): void {
    this.writeBlock(`${label}: ${value}`, { fontSize: 10, indent: 14, marginBottom: 3 });
  }
}

// --- Document builder --------------------------------------------------------

function bcad(year: number | undefined, era: 'BC' | 'AD' | undefined): string {
  if (year === undefined) return '';
  return `${year} ${era ?? 'AD'}`;
}

/** Render entries grouped by their linked keyword (preset), each entry a
 *  ref-tagged line whose primary text comes from `toText`. */
function renderGrouped<T extends { presetId?: string; verseRef: VerseRef; notes?: string }>(
  writer: ObservationPageWriter,
  items: T[],
  presetOrder: MarkingPreset[],
  iconFor: (p: MarkingPreset | null) => string | null,
  toText: (item: T) => string,
): void {
  for (const { preset, items: group } of groupByPreset(items, presetOrder)) {
    writer.keywordHeading(iconFor(preset), preset?.word ?? 'Other', `${group.length}`);
    for (const item of [...group].sort((a, b) => compareRef(a.verseRef, b.verseRef))) {
      writer.entry(refLabel(item.verseRef), toText(item), item.notes, 22);
    }
  }
}

/** Render guided-question entries (Interpretation / Application): a passage
 *  heading followed by each non-empty string field as a labelled line. */
function renderGuidedFields<T extends { verseRef: VerseRef }>(
  writer: ObservationPageWriter,
  entries: T[],
  fields: Array<[keyof T, string]>,
  headingLabel: (entry: T) => string,
): void {
  for (const entry of [...entries].sort((a, b) => compareRef(a.verseRef, b.verseRef))) {
    writer.keywordHeading(null, headingLabel(entry));
    for (const [key, label] of fields) {
      const value = entry[key];
      if (typeof value === 'string' && value.trim()) writer.field(label, value.trim());
    }
  }
}

/**
 * Render the observation report onto an existing doc, starting at its current
 * page. Lets a combined export append it after another section; standalone
 * exports pass a fresh single-page doc.
 */
export async function renderObservationIntoDoc(doc: JsPDFDoc, input: BuildObservationPdfInput): Promise<void> {
  const { study } = input;
  const studyId = study.id;
  const writer = new ObservationPageWriter(doc);

  // Presets included by the study (global + this study); used for the legend,
  // grouping order, and the conclusion-inclusion gate.
  const studyPresets = filterPresetsByStudy(input.presets, studyId);
  const includedPresetIds = new Set(studyPresets.map((p) => p.id));
  const presetById = new Map(input.presets.map((p) => [p.id, p]));
  const iconCache = await buildPresetIconCache(studyPresets, 13);

  // Study-filtered data. When the study targets a single book, also book-scope
  // every section so cross-book entries (other books marked while this study
  // was active, or global no-studyId markings) don't leak in.
  const book = study.book || undefined;
  const lists = filterByStudy(input.lists, studyId)
    .map((l) => ({ ...l, items: filterByBook(l.items, book) }));
  const places = filterByBook(filterByStudy(input.places, studyId), book);
  const people = filterByBook(filterByStudy(input.people, studyId), book);
  const time = filterByBook(filterByStudy(input.time, studyId), book);
  const interpretations = filterByBook(filterByStudy(input.interpretations, studyId), book);
  const applications = filterByBook(filterByStudy(input.applications, studyId), book);
  const conclusions = filterByBook(filterConclusions(input.conclusions, includedPresetIds), book);

  const iconFor = (p: MarkingPreset | null): string | null => {
    if (!p?.symbol) return null;
    const colorHex = p.highlight?.color ? getHighlightColorHex(p.highlight.color as HighlightColor) : undefined;
    return iconCache.get(iconCacheKey(p.symbol, colorHex)) ?? null;
  };

  writer.setHeader(`${study.name}  ·  Observation Report`);
  const bookName = study.book ? getBookById(study.book)?.name ?? study.book : undefined;
  writer.writeTitle(study.name, bookName ? `Observation Report  ·  ${bookName}` : 'Observation Report');

  // 1. Keyword legend. When the study targets a book and we have book-scoped
  // mark counts, show those counts (not the preset's global usage). A global
  // keyword (no studyId) only earns a legend row if it's actually used in this
  // book — by a mark or by appearing in a section — so cross-book globals like
  // "Jesus" don't show up in, say, an Ezekiel report. Study-specific keywords
  // are always listed since they belong to the study. With no book (topical
  // studies) the legend lists every study keyword with its global count.
  const { markCounts } = input;
  const bookScoped = Boolean(book && markCounts);
  const markCountFor = (p: MarkingPreset): number =>
    bookScoped ? markCounts![p.id] ?? 0 : p.usageCount ?? 0;

  const usedPresetIds = new Set<string>();
  for (const l of lists) if (l.items.length > 0) usedPresetIds.add(l.keyWordId);
  for (const e of [...places, ...people, ...time, ...conclusions]) {
    if (e.presetId) usedPresetIds.add(e.presetId);
  }

  const legend = studyPresets.filter((p) => {
    if (!p.word) return false;
    if (!bookScoped || p.studyId) return true; // topical, or a study-specific keyword
    return markCountFor(p) > 0 || usedPresetIds.has(p.id); // global keyword: only if used here
  });
  if (legend.length > 0) {
    writer.sectionHeading('Keywords');
    for (const p of legend) {
      const count = markCountFor(p);
      const meta = [p.category ? capitalize(p.category) : null, count ? `${count} marked` : null]
        .filter(Boolean).join('  ·  ');
      writer.keywordHeading(iconFor(p), p.word!, meta || undefined);
    }
  }

  // 2. Observation lists (grouped by keyword).
  const nonEmptyLists = lists.filter((l) => l.items.length > 0);
  if (nonEmptyLists.length > 0) {
    writer.sectionHeading('What I’m Learning');
    // Order lists by their keyword's position in studyPresets, then title.
    const order = new Map(studyPresets.map((p, i) => [p.id, i]));
    const sorted = [...nonEmptyLists].sort((a, b) =>
      (order.get(a.keyWordId) ?? 1e9) - (order.get(b.keyWordId) ?? 1e9) || a.title.localeCompare(b.title));
    for (const list of sorted) {
      const preset = presetById.get(list.keyWordId) ?? null;
      writer.keywordHeading(iconFor(preset), list.title, `${list.items.length}`);
      for (const item of [...list.items].sort((a, b) => compareRef(a.verseRef, b.verseRef))) {
        writer.entry(refLabel(item.verseRef), item.content, item.notes, 22);
      }
    }
  }

  // 3. Places.
  if (places.length > 0) {
    writer.sectionHeading('Places');
    renderGrouped(writer, places, studyPresets, iconFor, (pl) => pl.name);
  }

  // 4. People.
  if (people.length > 0) {
    writer.sectionHeading('People');
    renderGrouped(writer, people, studyPresets, iconFor, (person) => {
      const dates = [bcad(person.yearStart, person.yearStartEra), bcad(person.yearEnd, person.yearEndEra)]
        .filter(Boolean).join('–');
      return dates ? `${person.name}  (${dates})` : person.name;
    });
  }

  // 5. Time / chronology (ordered by timeOrder then canonical).
  if (time.length > 0) {
    writer.sectionHeading('Time & Chronology');
    const sorted = [...time].sort((a, b) =>
      ((a.timeOrder ?? 1e9) - (b.timeOrder ?? 1e9)) || compareRef(a.verseRef, b.verseRef));
    for (const t of sorted) {
      const year = bcad(t.year, t.yearEra);
      const text = year ? `${t.expression}  (${year})` : t.expression;
      writer.entry(refLabel(t.verseRef), text, t.notes, 14);
    }
  }

  // 6. Conclusions (by flow order then canonical).
  if (conclusions.length > 0) {
    writer.sectionHeading('Conclusions');
    const sorted = [...conclusions].sort((a, b) =>
      ((a.flowOrder ?? 1e9) - (b.flowOrder ?? 1e9)) || compareRef(a.verseRef, b.verseRef));
    for (const c of sorted) {
      writer.entry(refLabel(c.verseRef), `→ ${c.term}`, c.notes, 14);
    }
  }

  // 7. Interpretation (guided fields, non-empty only).
  if (interpretations.length > 0) {
    writer.sectionHeading('Interpretation');
    const fields: Array<[keyof InterpretationEntry, string]> = [
      ['meaning', 'Meaning'], ['authorIntent', 'Author’s intent'], ['keyThemes', 'Key themes'],
      ['context', 'Context'], ['implications', 'Implications'], ['crossReferences', 'Cross-references'],
      ['questions', 'Questions'], ['insights', 'Insights'],
    ];
    renderGuidedFields(writer, interpretations, fields, (e) => passageLabel(e.verseRef, e.endVerseRef));
  }

  // 8. Application (2 Tim 3:16 fields, non-empty only).
  if (applications.length > 0) {
    writer.sectionHeading('Application');
    const fields: Array<[keyof ApplicationEntry, string]> = [
      ['teaching', 'Teaching'], ['reproof', 'Reproof'], ['correction', 'Correction'],
      ['training', 'Training'], ['notes', 'Notes'],
    ];
    renderGuidedFields(writer, applications, fields, (e) => refLabel(e.verseRef));
  }

  writer.drawRunningFooter(`${study.name} — generated by BibleMarker`);
}

export async function buildObservationPdf(input: BuildObservationPdfInput): Promise<Uint8Array> {
  const jsPDF = await loadJsPDF();
  console.log('[observation-pdf] building PDF…');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  await renderObservationIntoDoc(doc, input);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  console.log('[observation-pdf] PDF ready, bytes=', bytes.length);
  return bytes;
}

export function observationFilename(study: Study): string {
  return `${slugify(study.name) || 'study'}-observations.pdf`;
}


/**
 * Gather every observation table for a study into a build input. Each getter is
 * independently resilient so one failed query can't blank the whole report.
 */
export async function gatherStudyObservationInput(study: Study): Promise<BuildObservationPdfInput> {
  const [presets, lists, places, people, time, conclusions, interpretations, applications, markCounts] = await Promise.all([
    getAllMarkingPresets().catch(() => []),
    getAllObservationLists().catch(() => []),
    getAllPlaces().catch(() => []),
    getAllPeople().catch(() => []),
    getAllTimeExpressions().catch(() => []),
    getAllConclusions().catch(() => []),
    getAllInterpretations().catch(() => []),
    getAllApplications().catch(() => []),
    // undefined (not {}) on failure/no-book so the legend falls back to each
    // preset's global usage count rather than silently showing every count as 0.
    study.book ? getBookKeywordMarkCounts(study.book).catch(() => undefined) : Promise.resolve(undefined),
  ]);
  return { study, presets, lists, places, people, time, conclusions, interpretations, applications, markCounts };
}

/** Gather a study's observation data and build its report PDF bytes. */
export async function buildStudyObservationPdf(study: Study): Promise<Uint8Array> {
  return buildObservationPdf(await gatherStudyObservationInput(study));
}

/** Gather, build, and save a study's report PDF via the native save dialog. */
export async function saveStudyObservationPdf(
  study: Study,
): Promise<{ path: string } | { cancelled: true }> {
  const bytes = await buildStudyObservationPdf(study);
  return savePdfBytes(bytes, observationFilename(study));
}
