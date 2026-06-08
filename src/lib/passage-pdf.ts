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
  SymbolAnnotation,
  TextAnnotation,
  Verse,
} from '@/types';
import { getBookById, getHighlightColorHex, SYMBOL_LABELS, type HighlightColor, type SymbolKey } from '@/types';
import { getModuleCopyright, ESV_COPYRIGHT, type ApiTranslation } from '@/lib/bible-api';
import { findKeywordMatches } from '@/lib/keywordMatching';
import { filterPresetsByStudy } from '@/lib/studyFilter';
import { getSymbolMarkup } from '@/lib/symbolDisplay';

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
 * A token in the marks line: either a symbol-icon-plus-word entry (`{icon}`)
 * or a plain text entry for highlights/underlines/colors (`{text}`). The
 * renderer walks these in order, placing icons as embedded PNGs and text
 * via doc.text, wrapping on the line as needed.
 */
type MarkToken =
  | { kind: 'icon'; symbol: SymbolKey; color: string | undefined; word: string }
  | { kind: 'text'; text: string };

/**
 * Build the list of mark tokens for a verse. Includes both persisted
 * annotations and virtual keyword-match annotations. Deduped by
 * `${kind}|${selectedText.toLowerCase()}|${label}` so the same word
 * marked twice with the same preset only lists once.
 */
function buildMarkTokens(verse: Verse, annotations: Annotation[]): MarkToken[] {
  const tokens: MarkToken[] = [];
  const seen = new Set<string>();

  for (const ann of annotations) {
    if (ann.type === 'symbol') {
      if (ann.ref.verse !== verse.ref.verse) continue;
      const label = SYMBOL_LABELS[ann.symbol] || ann.symbol;
      const word = ann.selectedText ?? 'verse';
      const key = `sym|${word.toLowerCase()}|${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tokens.push({ kind: 'icon', symbol: ann.symbol, color: ann.color, word });
    } else {
      if (ann.startRef.verse !== verse.ref.verse) continue;
      if (ann.endRef.verse !== verse.ref.verse) continue;
      const kind =
        ann.type === 'highlight' ? 'highlighted'
        : ann.type === 'textColor' ? 'colored'
        : 'underlined';
      const word = ann.selectedText ?? 'text';
      const key = `${kind}|${word.toLowerCase()}|${ann.color}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tokens.push({ kind: 'text', text: `"${word}" ${kind} ${ann.color}` });
    }
  }
  return tokens;
}

/** All unique (symbol, colorHex) pairs needed for the export — used to
 *  pre-render the PNG cache before the (sync) doc builder runs. */
function collectIconKeys(tokens: MarkToken[][]): Array<{ symbol: SymbolKey; colorHex: string | undefined }> {
  const seen = new Set<string>();
  const out: Array<{ symbol: SymbolKey; colorHex: string | undefined }> = [];
  for (const list of tokens) {
    for (const t of list) {
      if (t.kind !== 'icon') continue;
      const colorHex = t.color ? getHighlightColorHex(t.color as HighlightColor) : undefined;
      const key = `${t.symbol}|${colorHex ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ symbol: t.symbol, colorHex });
    }
  }
  return out;
}

/** Render a Phosphor SVG to a PNG data URL at 2x the requested pt size
 *  (for crisp rendering at print resolutions). Returns null if rasterization
 *  fails — caller falls back to a text label. */
async function rasterizeSymbol(symbol: SymbolKey, colorHex: string | undefined, sizePt: number): Promise<string | null> {
  const color = colorHex ?? '#222';
  const markup = getSymbolMarkup(symbol, color);
  if (!markup) return null;
  // getSymbolMarkup wraps the SVG in a <span style="color:…"> and relies on
  // CSS `currentColor` to tint the Phosphor paths. We rasterize the bare SVG
  // (without that span), so the color would otherwise be lost — bake it in by
  // substituting currentColor with the actual hex. Duotone keeps its two-tone
  // look because the faint background layer shares the same currentColor.
  const svgMatch = markup.match(/<svg[\s\S]*<\/svg>/);
  if (!svgMatch) return null;
  // Force an explicit width/height on the SVG so canvas drawImage knows the
  // intrinsic size — Phosphor's em-based sizing gives 0×0 on a free SVG.
  const svgStr = svgMatch[0]
    .replace(/currentColor/g, color)
    .replace(/<svg([^>]*)>/, (_m, attrs) => {
      const cleaned = String(attrs)
        .replace(/\swidth="[^"]*"/, '')
        .replace(/\sheight="[^"]*"/, '');
      return `<svg${cleaned} width="64" height="64">`;
    });
  const px = Math.max(16, Math.round(sizePt * 2));

  try {
    const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('SVG image load failed'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(img, 0, 0, px, px);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    console.warn('[passage-pdf] symbol rasterize failed for', symbol, err);
    return null;
  }
}

async function buildIconCache(tokens: MarkToken[][], sizePt: number): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  const keys = collectIconKeys(tokens);
  await Promise.all(
    keys.map(async ({ symbol, colorHex }) => {
      const dataUrl = await rasterizeSymbol(symbol, colorHex, sizePt);
      if (dataUrl) cache.set(`${symbol}|${colorHex ?? ''}`, dataUrl);
    }),
  );
  return cache;
}

// --- jsPDF lazy loader -------------------------------------------------------

type JsPDFGState = object;
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
  getTextWidth(text: string): number;
  rect(x: number, y: number, w: number, h: number, style?: string): JsPDFDoc;
  roundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number, style?: string): JsPDFDoc;
  line(x1: number, y1: number, x2: number, y2: number): JsPDFDoc;
  addImage(data: string, format: string, x: number, y: number, w: number, h: number): JsPDFDoc;
  addPage(): JsPDFDoc;
  getNumberOfPages(): number;
  setPage(n: number): JsPDFDoc;
  output(type: 'arraybuffer'): ArrayBuffer;
  GState(opts: { opacity?: number; 'stroke-opacity'?: number }): JsPDFGState;
  setGState(state: JsPDFGState): JsPDFDoc;
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
  private pageNo = 1;
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
    // Page 1 carries the prominent title block instead of the running header.
    if (this.pageNo <= 1) return;
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
      this.pageNo += 1;
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

  /**
   * Prominent page-1 title block: a large bold title, an optional italic
   * theme line, a secondary attribution line, and a thin divider rule.
   */
  writeTitle(main: string, secondary: string, theme?: string): void {
    // Main title.
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(23);
    this.doc.setTextColor(17, 17, 17);
    const titleLines = this.doc.splitTextToSize(main, this.contentWidth);
    const titleLH = 23 * 1.15;
    this.ensureSpace(titleLines.length * titleLH + 40);
    this.doc.text(titleLines, this.pageWidth / 2, this.y + 23, { align: 'center' });
    this.y += titleLines.length * titleLH + 4;

    // Theme (sub-heading) line.
    if (theme) {
      this.doc.setFont('helvetica', 'italic');
      this.doc.setFontSize(11.5);
      this.doc.setTextColor(85, 85, 85);
      const themeLines = this.doc.splitTextToSize(theme, this.contentWidth);
      this.doc.text(themeLines, this.pageWidth / 2, this.y + 11.5, { align: 'center' });
      this.y += themeLines.length * (11.5 * 1.3) + 2;
    }

    // Secondary attribution line (translation / reference).
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(10);
    this.doc.setTextColor(120, 120, 120);
    this.doc.text(secondary, this.pageWidth / 2, this.y + 10, { align: 'center' });
    this.y += 10 + 12;

    // Divider rule.
    this.doc.setDrawColor(205, 205, 205);
    this.doc.setLineWidth(0.75);
    this.doc.line(this.opts.marginLeft, this.y, this.pageWidth - this.opts.marginRight, this.y);
    this.y += 16;
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

  /**
   * Render a study note inside a light tinted rounded callout box, so it
   * reads clearly as a note rather than blending into the scripture text.
   * The whole box is kept together on one page when it fits; an unusually
   * tall note that can't fit a fresh page falls back to flowing text.
   */
  writeNote(content: string): void {
    const fontSize = 9.5;
    const lineHeight = fontSize * 1.35;
    const indent = 18;       // box left inset from the text margin
    const padX = 9;          // horizontal padding inside the box
    const padY = 7;          // vertical padding inside the box
    const marginTop = 4;
    const marginBottom = 7;
    const fill: [number, number, number] = [240, 241, 250];
    const border: [number, number, number] = [214, 216, 236];
    const textColor: [number, number, number] = [55, 55, 80];

    this.doc.setFont('helvetica', 'italic');
    this.doc.setFontSize(fontSize);

    const boxLeft = this.opts.marginLeft + indent;
    const boxWidth = this.contentWidth - indent;
    const textWidth = boxWidth - padX * 2;
    const lines = this.doc.splitTextToSize(content, textWidth);
    const boxHeight = lines.length * lineHeight + padY * 2;

    this.y += marginTop;
    // Keep the box together if it can fit on a page at all; otherwise fall
    // back to plain flowing text so very long notes still render.
    const pageUsable = this.pageHeight - this.opts.marginTop - this.opts.marginBottom - this.opts.footerHeight;
    if (boxHeight <= pageUsable) {
      this.ensureSpace(boxHeight);
    }

    const boxTop = this.y;
    this.doc.setFillColor(...fill);
    this.doc.setDrawColor(...border);
    this.doc.setLineWidth(0.5);
    this.doc.roundedRect(boxLeft, boxTop, boxWidth, boxHeight, 4, 4, 'FD');

    this.doc.setTextColor(...textColor);
    let ty = boxTop + padY;
    for (const line of lines) {
      this.doc.text(line, boxLeft + padX, ty + fontSize);
      ty += lineHeight;
    }

    this.y = boxTop + boxHeight + marginBottom;
  }

  /**
   * Render a list of mark tokens beneath a verse as `[icon] word · [icon] word · …`.
   * Plain-text tokens are rendered as-is. Icon tokens render the cached
   * PNG followed by the word. Wraps to a new line when content doesn't
   * fit; subsequent lines hang under the verse's body indent.
   */
  writeMarksLine(tokens: MarkToken[], iconCache: Map<string, string>, leftIndent: number): void {
    if (tokens.length === 0) return;
    const fontSize = 8.5;
    const lineHeight = fontSize * 1.4;
    const iconSize = fontSize * 1.15; // pt
    const gap = 3;        // gap between icon and its word
    const sepGap = 6;     // gap between entries

    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(fontSize);
    this.doc.setTextColor(80, 80, 120);

    const startX = this.opts.marginLeft + leftIndent;
    const maxX = this.opts.marginLeft + this.contentWidth;
    let x = startX;
    let firstOnLine = true;

    this.ensureSpace(lineHeight);

    for (const token of tokens) {
      const isIcon = token.kind === 'icon';
      const word = isIcon ? token.word : token.text;
      const wordWidth = this.doc.getTextWidth(word);
      const entryWidth = (isIcon ? iconSize + gap : 0) + wordWidth;
      const needed = entryWidth + (firstOnLine ? 0 : sepGap + this.doc.getTextWidth('·') + sepGap);

      if (!firstOnLine && x + needed > maxX) {
        // Wrap to next line.
        this.y += lineHeight;
        this.ensureSpace(lineHeight);
        x = startX;
        firstOnLine = true;
      }

      if (!firstOnLine) {
        const sep = '·';
        const sepW = this.doc.getTextWidth(sep);
        this.doc.text(sep, x + sepGap, this.y + fontSize);
        x += sepGap + sepW + sepGap;
      }

      if (isIcon) {
        const cacheKey = `${token.symbol}|${token.color ? getHighlightColorHex(token.color as HighlightColor) : ''}`;
        const dataUrl = iconCache.get(cacheKey);
        if (dataUrl) {
          // Center icon vertically with the text baseline.
          this.doc.addImage(dataUrl, 'PNG', x, this.y + (fontSize - iconSize) / 2 + 1, iconSize, iconSize);
        }
        x += iconSize + gap;
      }
      this.doc.text(word, x, this.y + fontSize);
      x += wordWidth;
      firstOnLine = false;
    }

    this.y += lineHeight;
  }

  /**
   * Render a verse with annotations laid out inline. Two-pass: first lays
   * out tokens onto lines, second renders each line. Every body line
   * reserves the same icon row above it, so line leading is uniform
   * whether or not a line carries symbols — symbols simply occupy the
   * reserved gap above the word(s) they mark. Each symbol annotation draws
   * exactly once, centered over the full span of words it covers (so a
   * multi-word keyword gets a single symbol, not one per word). Matches the
   * on-screen reader's "icons above words" appearance.
   */
  writeVerse(verseNum: number, body: string, annotations: Annotation[], iconCache: Map<string, string>): number {
    const fontSize = 11;
    const lineHeight = fontSize * 1.3;
    const iconSize = 11.5;
    const iconGap = 2;
    const symbolRow = iconSize + iconGap; // reserved above every line for consistent leading

    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(fontSize);

    const numLabel = `${verseNum} `;
    const numWidth = approxTextWidth(this.doc, numLabel);
    const bodyLeft = this.opts.marginLeft + numWidth;
    const maxX = this.opts.marginLeft + this.contentWidth;

    // -- Pass 1: layout --
    interface LaidOutToken {
      tok: VerseToken;
      covers: Annotation[];
      x: number;
      width: number;
    }
    const tokens = tokenizeVerse(body);
    const lines: LaidOutToken[][] = [];
    let line: LaidOutToken[] = [];
    let x = bodyLeft;
    let firstOnLine = true;

    for (const tok of tokens) {
      const covers = annotations.filter((a) => annotationCoversToken(a, tok, verseNum));

      const leading = firstOnLine ? '' : tok.leadingSpace || ' ';
      const leadingW = leading ? this.doc.getTextWidth(leading) : 0;
      const wordW = this.doc.getTextWidth(tok.text);

      if (!firstOnLine && x + leadingW + wordW > maxX) {
        lines.push(line);
        line = [];
        x = bodyLeft;
        firstOnLine = true;
      }
      if (!firstOnLine) x += leadingW;

      line.push({ tok, covers, x, width: wordW });
      x += wordW;
      firstOnLine = false;
    }
    if (line.length > 0) lines.push(line);

    // -- Pass 2: render --
    for (let li = 0; li < lines.length; li++) {
      const ln = lines[li];
      this.ensureSpace(symbolRow + lineHeight);
      this.y += symbolRow; // uniform icon row above every line

      // Verse number on the first physical line of the verse.
      if (li === 0) {
        this.doc.setTextColor(120, 120, 120);
        this.doc.setFont('helvetica', 'bold');
        this.doc.text(numLabel, this.opts.marginLeft, this.y + fontSize);
        this.doc.setFont('helvetica', 'normal');
        this.doc.setTextColor(0, 0, 0);
      }

      // Text run (highlights, colors, underlines, words).
      for (const lt of ln) {
        const { tok, covers, x: tokX, width: wordW } = lt;
        const highlight = covers.find((a) => a.type === 'highlight') as TextAnnotation | undefined;
        const textColor = covers.find((a) => a.type === 'textColor') as TextAnnotation | undefined;
        const underline = covers.find((a) => a.type === 'underline') as TextAnnotation | undefined;

        // Highlight rect.
        if (highlight) {
          const [r, g, b] = hexToRgb(getHighlightColorHex(highlight.color));
          this.doc.setFillColor(r, g, b);
          this.doc.setGState(this.doc.GState({ opacity: 0.28 }));
          this.doc.rect(tokX - 0.5, this.y + 2, wordW + 1, fontSize, 'F');
          this.doc.setGState(this.doc.GState({ opacity: 1 }));
        }

        // Text color.
        if (textColor) {
          const [r, g, b] = hexToRgb(getHighlightColorHex(textColor.color));
          this.doc.setTextColor(r, g, b);
        } else {
          this.doc.setTextColor(0, 0, 0);
        }
        this.doc.text(tok.text, tokX, this.y + fontSize);

        // Underline.
        if (underline) {
          const [r, g, b] = hexToRgb(getHighlightColorHex(underline.color));
          this.doc.setDrawColor(r, g, b);
          this.doc.setLineWidth(0.6);
          const uy = this.y + fontSize + 1.5;
          this.doc.line(tokX, uy, tokX + wordW, uy);
        }
      }

      // Symbols ABOVE the line: one per annotation, centered over the full
      // span of words it covers on this line. Group annotations that share
      // the same span so co-located symbols sit side by side.
      const spanByAnn = new Map<string, { left: number; right: number; ann: SymbolAnnotation }>();
      for (const lt of ln) {
        const left = lt.x;
        const right = lt.x + lt.width;
        for (const a of lt.covers) {
          if (a.type !== 'symbol') continue;
          const e = spanByAnn.get(a.id);
          if (e) {
            e.left = Math.min(e.left, left);
            e.right = Math.max(e.right, right);
          } else {
            spanByAnn.set(a.id, { left, right, ann: a });
          }
        }
      }
      if (spanByAnn.size > 0) {
        const groups = new Map<string, { left: number; right: number; anns: SymbolAnnotation[] }>();
        for (const { left, right, ann } of spanByAnn.values()) {
          const key = `${Math.round(left)}|${Math.round(right)}`;
          const g = groups.get(key) ?? { left, right, anns: [] };
          g.anns.push(ann);
          groups.set(key, g);
        }
        const iy = this.y - iconGap - iconSize;
        for (const g of groups.values()) {
          const center = (g.left + g.right) / 2;
          const totalIconW = g.anns.length * iconSize + (g.anns.length - 1) * 1;
          let ix = center - totalIconW / 2;
          if (ix < this.opts.marginLeft) ix = this.opts.marginLeft;
          if (ix + totalIconW > maxX) ix = maxX - totalIconW;
          for (const sym of g.anns) {
            const colorHex = sym.color ? getHighlightColorHex(sym.color as HighlightColor) : undefined;
            const dataUrl = iconCache.get(`${sym.symbol}|${colorHex ?? ''}`);
            if (dataUrl) this.doc.addImage(dataUrl, 'PNG', ix, iy, iconSize, iconSize);
            ix += iconSize + 1;
          }
        }
      }

      this.y += lineHeight;
    }

    return numWidth;
  }

  /** Add a small gap after a verse. */
  spacer(pts: number): void {
    this.y += pts;
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

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace('#', '');
  const full = m.length === 3
    ? m.split('').map((c) => c + c).join('')
    : m.length >= 6 ? m.slice(0, 6) : 'cccccc';
  return [
    parseInt(full.slice(0, 2), 16) || 0,
    parseInt(full.slice(2, 4), 16) || 0,
    parseInt(full.slice(4, 6), 16) || 0,
  ];
}

interface VerseToken {
  text: string;
  startOffset: number;
  endOffset: number;
  leadingSpace: string;
}

/** Split verse text into whitespace-separated tokens, preserving each
 *  token's character offsets in the original string so we can match
 *  annotation ranges precisely. */
function tokenizeVerse(text: string): VerseToken[] {
  const tokens: VerseToken[] = [];
  let lastEnd = 0;
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({
      text: m[0],
      startOffset: m.index,
      endOffset: m.index + m[0].length,
      leadingSpace: text.slice(lastEnd, m.index),
    });
    lastEnd = m.index + m[0].length;
  }
  return tokens;
}

function annotationCoversToken(ann: Annotation, tok: VerseToken, verseNum: number): boolean {
  if (ann.type === 'symbol') {
    if (ann.ref.verse !== verseNum) return false;
    const s = ann.startOffset, e = ann.endOffset;
    if (s === undefined || e === undefined) return false;
    return s < tok.endOffset && e > tok.startOffset;
  }
  if (ann.startRef.verse !== verseNum || ann.endRef.verse !== verseNum) return false;
  const s = ann.startOffset, e = ann.endOffset;
  if (s === undefined || e === undefined) return false;
  return s < tok.endOffset && e > tok.startOffset;
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

async function buildPdfDoc(jsPDF: JsPDFCtor, input: BuildPassagePdfInput): Promise<JsPDFDoc> {
  const { translation, book, chapter, verses, annotations, notes, sectionHeadings, chapterTitle, verseRange } = input;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const writer = new PageWriter(doc);

  const presets = input.presets ?? [];
  const exclusions = input.exclusions ?? [];
  const filteredPresets = filterPresetsByStudy(presets, input.activeStudyId ?? null);

  const range = verseRange ?? { start: verses[0]?.ref.verse ?? 1, end: verses[verses.length - 1]?.ref.verse ?? 0 };
  const inRange = verses.filter((v) => v.ref.verse >= range.start && v.ref.verse <= range.end);

  // Per-verse combined annotation lists (persisted + virtual keyword matches).
  // Built once up front so we can pre-rasterize every unique symbol icon
  // in a single async pass before the (sync) PDF doc-building pass.
  const verseAnnotations = new Map<number, Annotation[]>();
  const tokensForIconCache: MarkToken[][] = [];
  for (const verse of inRange) {
    const verseAnns = annotations.filter((a) => {
      if (a.type === 'symbol') return a.ref.verse === verse.ref.verse;
      return a.startRef.verse <= verse.ref.verse && a.endRef.verse >= verse.ref.verse;
    });
    const virtualAnns = filteredPresets.length > 0
      ? findKeywordMatches(verse.text || '', verse.ref, filteredPresets, translation.id, exclusions)
      : [];
    const all = [...verseAnns, ...virtualAnns];
    verseAnnotations.set(verse.ref.verse, all);
    // Feed every annotation through buildMarkTokens just to enumerate the
    // unique (symbol, color) pairs the rasterizer needs.
    tokensForIconCache.push(buildMarkTokens(verse, all));
  }
  const iconCache = await buildIconCache(tokensForIconCache, 14);

  const rangeLabel = formatRangeLabel(book, chapter, verseRange);
  const showChapterTitle = !verseRange || verseRange.start === (verses[0]?.ref.verse ?? 1);

  // Running page header — drawn at top of pages 2+ (page 1 gets the title block).
  writer.setHeader(`${rangeLabel}  ·  ${translation.name}`);

  if (showChapterTitle) {
    const customTitle = chapterTitle?.title?.trim();
    const main = customTitle || rangeLabel;
    const secondary = customTitle ? `${rangeLabel}  ·  ${translation.name}` : translation.name;
    writer.writeTitle(main, secondary, customTitle ? chapterTitle?.theme : undefined);
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

    writer.writeVerse(verse.ref.verse, verse.text || '', verseAnnotations.get(verse.ref.verse) ?? [], iconCache);
    writer.spacer(8);

    const verseNotes = notes.filter(
      (n) => n.ref.verse === verse.ref.verse ||
        (n.range && n.range.start.verse <= verse.ref.verse && n.range.end.verse >= verse.ref.verse),
    );
    for (const note of verseNotes) {
      writer.writeNote(note.content);
    }
  }

  writer.drawRunningFooter(getTranslationAttribution(translation));
  return doc;
}

export async function buildPassagePdf(input: BuildPassagePdfInput): Promise<Uint8Array> {
  const jsPDF = await loadJsPDF();
  console.log('[passage-pdf] building PDF…');
  const doc = await buildPdfDoc(jsPDF, input);
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
