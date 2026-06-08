/**
 * Shared PDF layout core (jsPDF-based).
 *
 * A small imperative page writer used by the passage and observation PDF
 * exporters. jsPDF is dynamic-imported on first use (it's pure browser JS;
 * pdfmake/PDFKit hang in WKWebView). This module is passage-agnostic — verse
 * rendering lives in `passage-pdf.ts` via a `PageWriter` subclass.
 */

// --- jsPDF lazy loader -------------------------------------------------------

export type JsPDFGState = object;
export type JsPDFDoc = {
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

export type JsPDFCtor = new (opts?: { unit?: string; format?: string; orientation?: string }) => JsPDFDoc;

let jspdfPromise: Promise<JsPDFCtor> | null = null;

export function loadJsPDF(): Promise<JsPDFCtor> {
  if (jspdfPromise) return jspdfPromise;
  jspdfPromise = (async () => {
    console.log('[pdf] loading jsPDF…');
    const mod = (await import('jspdf')) as unknown as { jsPDF?: JsPDFCtor; default?: JsPDFCtor | { jsPDF?: JsPDFCtor } };
    const candidate = mod.jsPDF
      ?? (typeof mod.default === 'function' ? mod.default as JsPDFCtor : (mod.default as { jsPDF?: JsPDFCtor } | undefined)?.jsPDF);
    if (!candidate) throw new Error('jsPDF module did not expose a constructor.');
    console.log('[pdf] jsPDF ready.');
    return candidate;
  })();
  jspdfPromise.catch(() => { jspdfPromise = null; });
  return jspdfPromise;
}

/** Convert a CSS hex string to an [r,g,b] tuple for jsPDF's numeric color APIs. */
export function hexToRgb(hex: string): [number, number, number] {
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

// --- Layout writer -----------------------------------------------------------

export interface PageWriterOptions {
  marginTop: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  /** Reserved space at the bottom of every page for the running footer. */
  footerHeight: number;
}

export const DEFAULT_OPTS: PageWriterOptions = {
  marginTop: 68,
  marginBottom: 72,
  marginLeft: 54,
  marginRight: 54,
  footerHeight: 24,
};

/**
 * Imperative page writer. Tracks the vertical cursor, paginates, and renders
 * generic blocks (title, text, tinted note callout, footer). Passage-specific
 * verse layout is added by subclasses (see `PassagePageWriter`).
 */
export class PageWriter {
  readonly doc: JsPDFDoc;
  protected opts: PageWriterOptions;
  protected y: number;
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

  protected ensureSpace(needed: number): void {
    if (this.y + needed > this.bottomLimit()) {
      this.doc.addPage();
      this.pageNo += 1;
      this.y = this.opts.marginTop;
      this.drawHeaderOnCurrentPage();
    }
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
   * Render text inside a light tinted rounded callout box, so it reads clearly
   * as set-apart content (a note) rather than blending into the body. The whole
   * box is kept together on one page when it fits; an unusually tall block that
   * can't fit a fresh page falls back to flowing text.
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

    // If the note is too tall to ever fit a single page, drawing one box would
    // overflow the footer. Flow it as plain indented text instead, page-breaking
    // line by line so it stays on-page.
    const pageUsable = this.pageHeight - this.opts.marginTop - this.opts.marginBottom - this.opts.footerHeight;
    if (boxHeight > pageUsable) {
      this.doc.setTextColor(...textColor);
      for (const line of lines) {
        this.ensureSpace(lineHeight);
        this.doc.text(line, boxLeft + padX, this.y + fontSize);
        this.y += lineHeight;
      }
      this.y += marginBottom;
      return;
    }

    // Keep the box together on one page.
    this.ensureSpace(boxHeight);

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

  /** Add a vertical gap. */
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
