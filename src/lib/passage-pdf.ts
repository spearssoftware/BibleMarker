/**
 * Passage PDF export.
 *
 * Builds a PDF (via jsPDF, dynamic-imported on first use) from the chapter
 * data the export popover loads, then saves it through Tauri's native
 * save dialog and auto-opens it in the system's default PDF viewer.
 *
 * Why jsPDF and not pdfmake / browser print:
 * - WKWebView (Tauri on macOS) has a no-op window.print(), so HTML
 *   approaches never reached the print dialog.
 * - pdfmake bundles PDFKit which uses Node-style streams that don't
 *   initialize in WKWebView/Vite — createPdf().getBuffer() hangs even
 *   for trivial documents.
 * - jsPDF is pure browser JS with no Node-stream dependencies, ships
 *   the core 14 PDF fonts, and is well-trodden in Tauri/Electron apps.
 *
 * Trade-off in v1: jsPDF is imperative (you position text yourself), so
 * we render verses as clean numbered paragraphs and summarize the
 * annotations on a small line after each verse — instead of trying to
 * inline-color individual words, which requires manual run-by-run
 * layout. The information is preserved; iteration can move to inline
 * coloring later.
 *
 * Hard-capped at one chapter for licensing reasons (NASB Lockman / ESV
 * quotation guidelines).
 */

import type {
  Annotation,
  ChapterTitle,
  KeywordExclusion,
  MarkingPreset,
  Note,
  SectionHeading,
  Verse,
} from '@/types';
import { getBookById, SYMBOL_LABELS } from '@/types';
import { getModuleCopyright, ESV_COPYRIGHT, type ApiTranslation } from '@/lib/bible-api';
import { findKeywordMatches } from '@/lib/keywordMatching';
import { filterPresetsByStudy } from '@/lib/studyFilter';

export interface BuildPassagePdfInput {
  translation: ApiTranslation;
  book: string;
  chapter: number;
  verses: Verse[];
  annotations: Annotation[];
  notes: Note[];
  sectionHeadings: SectionHeading[];
  chapterTitle: ChapterTitle | null;
  /** Inclusive verse range. Omit to export the entire chapter. */
  verseRange?: { start: number; end: number };
  /** MarkingPresets — needed to surface the virtual keyword-match annotations
   *  the on-screen reader shows but never persists. */
  presets?: MarkingPreset[];
  /** Per-verse keyword exclusions (user-dismissed virtual matches). */
  exclusions?: KeywordExclusion[];
  /** Active study, used to filter presets. */
  activeStudyId?: string | null;
}

/** Per-translation attribution string used in the PDF footer and the popover. */
export function getTranslationAttribution(translation: ApiTranslation): string {
  if (translation.id === 'ESV' || translation.id === 'eng-ESV') return ESV_COPYRIGHT;
  const sword = getModuleCopyright(translation.id);
  if (sword?.text) return sword.text;
  if (translation.copyright) return translation.copyright;
  return `${translation.name} — public domain.`;
}

export function formatRangeLabel(book: string, chapter: number, range?: { start: number; end: number }): string {
  const bookName = getBookById(book)?.name ?? book;
  if (!range) return `${bookName} ${chapter}`;
  if (range.start === range.end) return `${bookName} ${chapter}:${range.start}`;
  return `${bookName} ${chapter}:${range.start}–${range.end}`;
}

function findCoveringHeading(verseNum: number, headings: SectionHeading[]): SectionHeading | null {
  let covering: SectionHeading | null = null;
  for (const h of headings) {
    if (h.beforeRef.verse > verseNum) continue;
    if (h.coversUntil && h.coversUntil.verse < verseNum) continue;
    if (!covering || h.beforeRef.verse > covering.beforeRef.verse) covering = h;
  }
  return covering;
}

/**
 * One-line, human-readable summary of the marks on this verse. Includes
 * both persisted annotations and virtual keyword-match annotations
 * (presets that match words in the verse text but aren't stored). Dedup
 * is by `${kind}|${selectedText.toLowerCase()}|${label}` within a verse
 * — same word marked twice with the same preset only lists once.
 *
 * Example: `marks: "Lord" marked God · "Gilead" marked Place · "Gilead" highlighted fuchsia`
 */
function buildMarksSummary(verse: Verse, annotations: Annotation[]): string | null {
  const parts: string[] = [];
  const seen = new Set<string>();
  const add = (key: string, text: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    parts.push(text);
  };

  for (const ann of annotations) {
    if (ann.type === 'symbol') {
      if (ann.ref.verse !== verse.ref.verse) continue;
      const label = SYMBOL_LABELS[ann.symbol] || ann.symbol;
      const target = ann.selectedText ? `"${ann.selectedText}"` : 'verse';
      add(`sym|${(ann.selectedText ?? '').toLowerCase()}|${label}`, `${target} marked ${label}`);
    } else {
      if (ann.startRef.verse !== verse.ref.verse) continue;
      if (ann.endRef.verse !== verse.ref.verse) continue;
      const kind =
        ann.type === 'highlight' ? 'highlighted'
        : ann.type === 'textColor' ? 'colored'
        : 'underlined';
      const target = ann.selectedText ? `"${ann.selectedText}"` : 'text';
      add(`${kind}|${(ann.selectedText ?? '').toLowerCase()}|${ann.color}`, `${target} ${kind} ${ann.color}`);
    }
  }
  if (parts.length === 0) return null;
  return `marks: ${parts.join(' · ')}`;
}

// --- jsPDF lazy loader -------------------------------------------------------

type JsPDFDoc = {
  internal: { pageSize: { getWidth: () => number; getHeight: () => number } };
  setFont(family: string, style?: string): JsPDFDoc;
  setFontSize(size: number): JsPDFDoc;
  setTextColor(r: number, g: number, b: number): JsPDFDoc;
  setDrawColor(r: number, g: number, b: number): JsPDFDoc;
  setFillColor(r: number, g: number, b: number): JsPDFDoc;
  setLineWidth(w: number): JsPDFDoc;
  text(text: string | string[], x: number, y: number, options?: { align?: 'left' | 'center' | 'right'; maxWidth?: number }): JsPDFDoc;
  splitTextToSize(text: string, maxWidth: number): string[];
  rect(x: number, y: number, w: number, h: number, style?: string): JsPDFDoc;
  line(x1: number, y1: number, x2: number, y2: number): JsPDFDoc;
  addPage(): JsPDFDoc;
  getNumberOfPages(): number;
  setPage(n: number): JsPDFDoc;
  output(type: 'arraybuffer'): ArrayBuffer;
};

type JsPDFCtor = new (opts?: { unit?: string; format?: string; orientation?: string }) => JsPDFDoc;

let jspdfPromise: Promise<JsPDFCtor> | null = null;

function loadJsPDF(): Promise<JsPDFCtor> {
  if (jspdfPromise) return jspdfPromise;
  jspdfPromise = (async () => {
    console.log('[passage-pdf] loading jsPDF…');
    const mod = (await import('jspdf')) as unknown as { jsPDF?: JsPDFCtor; default?: JsPDFCtor | { jsPDF?: JsPDFCtor } };
    const candidate = mod.jsPDF
      ?? (typeof mod.default === 'function' ? mod.default as JsPDFCtor : (mod.default as { jsPDF?: JsPDFCtor } | undefined)?.jsPDF);
    if (!candidate) throw new Error('jsPDF module did not expose a constructor.');
    console.log('[passage-pdf] jsPDF ready.');
    return candidate;
  })();
  jspdfPromise.catch(() => { jspdfPromise = null; });
  return jspdfPromise;
}

// --- Layout writer -----------------------------------------------------------

interface PageWriterOptions {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  /** Reserved space at the bottom of every page for the running footer. */
  footerHeight: number;
}

const DEFAULT_OPTS: PageWriterOptions = {
  marginTop: 68,
  marginBottom: 72,
  marginLeft: 54,
  marginRight: 54,
  footerHeight: 24,
};

class PageWriter {
  readonly doc: JsPDFDoc;
  private opts: PageWriterOptions;
  private y: number;
  private headerText: string | null = null;
  readonly pageWidth: number;
  readonly pageHeight: number;
  readonly contentWidth: number;

  constructor(doc: JsPDFDoc, opts: PageWriterOptions = DEFAULT_OPTS) {
    this.doc = doc;
    this.opts = opts;
    this.pageWidth = doc.internal.pageSize.getWidth();
    this.pageHeight = doc.internal.pageSize.getHeight();
    this.contentWidth = this.pageWidth - opts.marginLeft - opts.marginRight;
    this.y = opts.marginTop;
  }

  /** Set a running header that's redrawn at the top of every page (including the current one). */
  setHeader(text: string): void {
    this.headerText = text;
    this.drawHeaderOnCurrentPage();
  }

  private drawHeaderOnCurrentPage(): void {
    if (!this.headerText) return;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.setTextColor(110, 110, 110);
    // Header text sits above marginTop so it doesn't push content down on new pages.
    this.doc.text(this.headerText, this.pageWidth / 2, this.opts.marginTop - 18, { align: 'center' });
  }

  private bottomLimit(): number {
    return this.pageHeight - this.opts.marginBottom - this.opts.footerHeight;
  }

  private ensureSpace(needed: number): void {
    if (this.y + needed > this.bottomLimit()) {
      this.doc.addPage();
      this.y = this.opts.marginTop;
      this.drawHeaderOnCurrentPage();
    }
  }

  writeCentered(text: string, opts: { fontSize: number; bold?: boolean; italics?: boolean; color?: [number, number, number]; marginBottom?: number }): void {
    const style = opts.italics ? (opts.bold ? 'bolditalic' : 'italic') : (opts.bold ? 'bold' : 'normal');
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(opts.fontSize);
    if (opts.color) this.doc.setTextColor(...opts.color); else this.doc.setTextColor(0, 0, 0);
    const lines = this.doc.splitTextToSize(text, this.contentWidth);
    const lineHeight = opts.fontSize * 1.2;
    this.ensureSpace(lines.length * lineHeight + (opts.marginBottom ?? 0));
    this.doc.text(lines, this.pageWidth / 2, this.y + opts.fontSize, { align: 'center' });
    this.y += lines.length * lineHeight + (opts.marginBottom ?? 0);
  }

  writeBlock(text: string, opts: { fontSize: number; bold?: boolean; italics?: boolean; color?: [number, number, number]; indent?: number; marginTop?: number; marginBottom?: number }): void {
    if (opts.marginTop) this.y += opts.marginTop;
    const style = opts.italics ? (opts.bold ? 'bolditalic' : 'italic') : (opts.bold ? 'bold' : 'normal');
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(opts.fontSize);
    if (opts.color) this.doc.setTextColor(...opts.color); else this.doc.setTextColor(0, 0, 0);
    const indent = opts.indent ?? 0;
    const width = this.contentWidth - indent;
    const lines = this.doc.splitTextToSize(text, width);
    const lineHeight = opts.fontSize * 1.3;
    // For potentially long blocks: emit line-by-line so we can page-break
    // mid-block rather than orphaning lines past the page bottom.
    for (const line of lines) {
      this.ensureSpace(lineHeight);
      this.doc.text(line, this.opts.marginLeft + indent, this.y + opts.fontSize);
      this.y += lineHeight;
    }
    if (opts.marginBottom) this.y += opts.marginBottom;
  }

  /** Render a verse: small bold gray number + body text on one paragraph. */
  writeVerse(verseNum: number, body: string, marksSummary: string | null): void {
    const fontSize = 11;
    const lineHeight = fontSize * 1.35;

    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(fontSize);
    this.doc.setTextColor(0, 0, 0);

    const numLabel = `${verseNum} `;
    const numWidth = this.doc.splitTextToSize(numLabel, this.contentWidth)[0]
      ? // getStringUnitWidth would be cleaner but the typings vary; estimate via splitTextToSize.
        approxTextWidth(this.doc, numLabel)
      : 12;

    // Body wraps to (contentWidth - hanging indent after the verse number).
    const bodyWidth = this.contentWidth - numWidth;
    const lines = this.doc.splitTextToSize(body, bodyWidth);
    if (lines.length === 0) return;

    this.ensureSpace(lineHeight);

    // First line: verse number in gray, body to its right.
    this.doc.setTextColor(120, 120, 120);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(numLabel, this.opts.marginLeft, this.y + fontSize);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(0, 0, 0);
    this.doc.text(lines[0], this.opts.marginLeft + numWidth, this.y + fontSize);
    this.y += lineHeight;

    // Subsequent lines: hanging-indented under the body, not under the number.
    for (let i = 1; i < lines.length; i++) {
      this.ensureSpace(lineHeight);
      this.doc.text(lines[i], this.opts.marginLeft + numWidth, this.y + fontSize);
      this.y += lineHeight;
    }

    if (marksSummary) {
      this.doc.setFont('helvetica', 'italic');
      this.doc.setFontSize(8.5);
      this.doc.setTextColor(80, 80, 120);
      const summaryLines = this.doc.splitTextToSize(marksSummary, bodyWidth);
      const summaryLineHeight = 8.5 * 1.3;
      for (const line of summaryLines) {
        this.ensureSpace(summaryLineHeight);
        this.doc.text(line, this.opts.marginLeft + numWidth, this.y + 8.5);
        this.y += summaryLineHeight;
      }
    }

    this.y += 3;
  }

  drawRunningFooter(text: string): void {
    const total = this.doc.getNumberOfPages();
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.doc.setTextColor(110, 110, 110);
    for (let p = 1; p <= total; p++) {
      this.doc.setPage(p);
      const footerY = this.pageHeight - this.opts.marginBottom + 12;
      const lines = this.doc.splitTextToSize(text, this.contentWidth);
      this.doc.text(lines, this.pageWidth / 2, footerY, { align: 'center' });
    }
  }
}

function approxTextWidth(doc: JsPDFDoc, text: string): number {
  // splitTextToSize returns whatever fits in maxWidth. We probe with a very
  // large width to get the line as a single string, then measure with a
  // shrinking binary-ish heuristic. jsPDF exposes getStringUnitWidth in
  // most builds but the typings disagree; this is the portable workaround.
  const big = 9999;
  const oneLine = doc.splitTextToSize(text, big)[0] ?? '';
  // Estimate: 11pt Helvetica averages ~5.5 units per char; close enough for
  // verse-number gutter sizing. The text is always short ("1 ", "12 ", etc.)
  // so a small over-estimate is fine.
  return Math.max(10, oneLine.length * 5.5 + 2);
}

// --- Document builder --------------------------------------------------------

function buildPdfDoc(jsPDF: JsPDFCtor, input: BuildPassagePdfInput): JsPDFDoc {
  const { translation, book, chapter, verses, annotations, notes, sectionHeadings, chapterTitle, verseRange } = input;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const writer = new PageWriter(doc);

  const presets = input.presets ?? [];
  const exclusions = input.exclusions ?? [];
  const filteredPresets = filterPresetsByStudy(presets, input.activeStudyId ?? null);

  const range = verseRange ?? { start: verses[0]?.ref.verse ?? 1, end: verses[verses.length - 1]?.ref.verse ?? 0 };
  const inRange = verses.filter((v) => v.ref.verse >= range.start && v.ref.verse <= range.end);
  const rangeLabel = formatRangeLabel(book, chapter, verseRange);
  const showChapterTitle = !verseRange || verseRange.start === (verses[0]?.ref.verse ?? 1);

  // Running page header — drawn at top of every page (above marginTop).
  writer.setHeader(`${rangeLabel}  ·  ${translation.name}`);

  if (showChapterTitle && chapterTitle?.title) {
    writer.writeCentered(chapterTitle.title, { fontSize: 18, bold: true, marginBottom: 4 });
    if (chapterTitle.theme) {
      writer.writeCentered(chapterTitle.theme, { fontSize: 10, italics: true, color: [85, 85, 85], marginBottom: 14 });
    } else {
      writer.writeBlock('', { fontSize: 1, marginBottom: 10 });
    }
  }

  // If the range starts mid-section, show the section heading it falls under.
  let lastHeadingId: string | null = null;
  if (inRange.length > 0) {
    const covering = findCoveringHeading(inRange[0].ref.verse, sectionHeadings);
    if (covering && covering.beforeRef.verse < inRange[0].ref.verse) {
      writer.writeBlock(covering.title, { fontSize: 13, bold: true, color: [50, 50, 50], marginTop: 6, marginBottom: 4 });
      lastHeadingId = covering.id;
    }
  }

  for (const verse of inRange) {
    const headingAtVerse = sectionHeadings.find((h) => h.beforeRef.verse === verse.ref.verse);
    if (headingAtVerse && headingAtVerse.id !== lastHeadingId) {
      writer.writeBlock(headingAtVerse.title, { fontSize: 13, bold: true, color: [50, 50, 50], marginTop: 10, marginBottom: 4 });
      lastHeadingId = headingAtVerse.id;
    }

    const verseAnns = annotations.filter((a) => {
      if (a.type === 'symbol') return a.ref.verse === verse.ref.verse;
      return a.startRef.verse <= verse.ref.verse && a.endRef.verse >= verse.ref.verse;
    });
    const virtualAnns = filteredPresets.length > 0
      ? findKeywordMatches(verse.text || '', verse.ref, filteredPresets, translation.id, exclusions)
      : [];
    const allAnns: Annotation[] = [...verseAnns, ...virtualAnns];

    writer.writeVerse(verse.ref.verse, verse.text || '', buildMarksSummary(verse, allAnns));

    const verseNotes = notes.filter(
      (n) => n.ref.verse === verse.ref.verse ||
        (n.range && n.range.start.verse <= verse.ref.verse && n.range.end.verse >= verse.ref.verse),
    );
    for (const note of verseNotes) {
      writer.writeBlock(note.content, {
        fontSize: 9.5,
        italics: true,
        color: [60, 60, 90],
        indent: 18,
        marginTop: 2,
        marginBottom: 6,
      });
    }
  }

  writer.drawRunningFooter(getTranslationAttribution(translation));
  return doc;
}

export async function buildPassagePdf(input: BuildPassagePdfInput): Promise<Uint8Array> {
  const jsPDF = await loadJsPDF();
  console.log('[passage-pdf] building PDF…');
  const doc = buildPdfDoc(jsPDF, input);
  const arrBuf = doc.output('arraybuffer');
  const bytes = new Uint8Array(arrBuf);
  console.log('[passage-pdf] PDF ready, bytes=', bytes.length);
  return bytes;
}

/** Filesystem-safe slug for a filename — e.g. "Jeremiah 46:5–12" → "Jeremiah-46-5-12". */
function defaultFilename(input: BuildPassagePdfInput): string {
  const bookName = (getBookById(input.book)?.name ?? input.book).replace(/\s+/g, '-');
  const range = input.verseRange;
  const suffix = range
    ? range.start === range.end
      ? `-${range.start}`
      : `-${range.start}-${range.end}`
    : '';
  return `${bookName}-${input.chapter}${suffix}.pdf`;
}

/**
 * Build the PDF and write it to disk.
 *
 * - Desktop / Android: native save dialog.
 * - iOS: Tauri 2 doesn't bridge an iOS save dialog. Mirror the pattern
 *   in `src/lib/export.ts:392` — write directly to the app's Documents
 *   directory under `exports/`. The file appears in the Files app.
 *
 * Returns the saved path, or `{ cancelled: true }` if the user dismissed
 * the dialog (desktop / Android only).
 */
export async function savePassagePdf(
  input: BuildPassagePdfInput,
): Promise<{ path: string } | { cancelled: true }> {
  const bytes = await buildPassagePdf(input);

  const { writeFile, exists, mkdir } = await import('@tauri-apps/plugin-fs');
  const { documentDir, join } = await import('@tauri-apps/api/path');
  const { isIOS } = await import('@/lib/platform');

  const filename = defaultFilename(input);

  if (isIOS()) {
    const dir = await documentDir();
    const exportsDir = await join(dir, 'exports');
    if (!(await exists(exportsDir))) await mkdir(exportsDir, { recursive: true });
    const filePath = await join(exportsDir, filename);
    await writeFile(filePath, bytes);
    return { path: filePath };
  }

  const { save } = await import('@tauri-apps/plugin-dialog');
  const defaultDir = await documentDir().catch(() => '');
  const defaultPath = defaultDir ? await join(defaultDir, filename) : filename;

  console.log('[passage-pdf] opening save dialog, defaultPath=', defaultPath);
  const chosen = await save({
    defaultPath,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  console.log('[passage-pdf] save dialog returned:', chosen);
  if (!chosen) return { cancelled: true };

  console.log('[passage-pdf] writing file…');
  await writeFile(chosen, bytes);
  console.log('[passage-pdf] file written.');
  return { path: chosen };
}

/** Open a previously-saved PDF in the system default viewer. */
export async function openSavedPdf(path: string): Promise<void> {
  const { openPath } = await import('@tauri-apps/plugin-opener');
  await openPath(path);
}
