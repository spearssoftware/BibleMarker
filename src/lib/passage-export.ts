/**
 * Passage Export
 *
 * Build a standalone HTML document for a single chapter (or verse range
 * within a chapter), then drive Print / Save-as-PDF and Copy-to-clipboard
 * from the same HTML. Inline styles only — Word/Pages/Google Docs preserve
 * inline `style=""` on paste but ignore class names from the live app.
 *
 * Hard-capped at one chapter for licensing reasons (NASB Lockman Free
 * Distribution Agreement, ESV quotation guidelines).
 */

import type {
  Annotation,
  ChapterTitle,
  HighlightColor,
  Note,
  SectionHeading,
  SymbolAnnotation,
  SymbolKey,
  TextAnnotation,
  Verse,
} from '@/types';
import { getBookById, getHighlightColorHex, SYMBOLS } from '@/types';
import { getModuleCopyright, ESV_COPYRIGHT, type ApiTranslation } from '@/lib/bible-api';
import { getSymbolMarkup } from '@/lib/symbolDisplay';

/**
 * How to render symbols in the exported HTML.
 * - `svg`: inline Phosphor SVG. Looks like the on-screen marks. Use for
 *   Print/PDF where the browser renders the SVG faithfully.
 * - `unicode`: text glyph from the SYMBOLS map. Use for clipboard/Word —
 *   Word strips inline SVG on paste, but the glyph survives.
 */
export type SymbolFormat = 'svg' | 'unicode';

export interface PassageExportInput {
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
  /** Defaults to 'svg'. Use 'unicode' for the clipboard path so symbols survive paste into Word. */
  symbolFormat?: SymbolFormat;
}

export interface PassageExportOutput {
  html: string;
  plainText: string;
}

/**
 * Resolve the attribution block for a translation. Falls back to a short
 * "translation-name only" line for public-domain modules with no copyright.
 */
export function getTranslationAttribution(translation: ApiTranslation): string {
  if (translation.id === 'ESV' || translation.id === 'eng-ESV') return ESV_COPYRIGHT;
  const sword = getModuleCopyright(translation.id);
  if (sword?.text) return sword.text;
  if (translation.copyright) return translation.copyright;
  return `${translation.name} — public domain.`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatRangeLabel(book: string, chapter: number, range?: { start: number; end: number }): string {
  const bookName = getBookById(book)?.name ?? book;
  if (!range) return `${bookName} ${chapter}`;
  if (range.start === range.end) return `${bookName} ${chapter}:${range.start}`;
  return `${bookName} ${chapter}:${range.start}–${range.end}`;
}

/**
 * Find the section heading that "covers" the given verse — either one that
 * starts at this verse, or one that started earlier and whose coversUntil
 * (or implied next-heading boundary) hasn't been crossed yet. Used so a
 * partial range starting mid-section still shows the user enough context.
 */
function findCoveringHeading(verseNum: number, headings: SectionHeading[]): SectionHeading | null {
  let covering: SectionHeading | null = null;
  for (const h of headings) {
    if (h.beforeRef.verse > verseNum) continue;
    if (h.coversUntil && h.coversUntil.verse < verseNum) continue;
    if (!covering || h.beforeRef.verse > covering.beforeRef.verse) {
      covering = h;
    }
  }
  return covering;
}

interface AnnotationRange {
  start: number;
  end: number;
  textAnns: TextAnnotation[];
  symbolAnns: SymbolAnnotation[];
}

/**
 * Compute character offsets for a single-verse annotation. Prefers explicit
 * startOffset/endOffset; falls back to a substring search of selectedText.
 * Returns null when the annotation can't be placed (will be skipped).
 */
function resolveOffsets(
  ann: TextAnnotation | SymbolAnnotation,
  text: string,
): { start: number; end: number } | null {
  const startOffset = 'startOffset' in ann ? ann.startOffset : undefined;
  const endOffset = 'endOffset' in ann ? ann.endOffset : undefined;
  if (startOffset !== undefined && endOffset !== undefined) {
    const s = Math.max(0, Math.min(startOffset, text.length));
    const e = Math.max(s, Math.min(endOffset, text.length));
    return { start: s, end: e };
  }
  const selectedText = 'selectedText' in ann ? ann.selectedText : undefined;
  if (selectedText) {
    const idx = text.indexOf(selectedText);
    if (idx >= 0) return { start: idx, end: idx + selectedText.length };
  }
  return null;
}

function buildRangesForVerse(
  verse: Verse,
  annotations: Annotation[],
): AnnotationRange[] {
  const text = verse.text || '';
  const ranges: AnnotationRange[] = [];

  for (const ann of annotations) {
    if (ann.type === 'symbol') {
      // Symbol annotations: only those tied to a word/range on this verse.
      // "Before verse" symbols (no offsets, position='before') are handled
      // separately as a prefix.
      if (ann.ref.verse !== verse.ref.verse) continue;
      if (ann.position === 'before' || ann.position === 'after') {
        // Verse-level symbol with no word index — render as prefix only.
        if (ann.startOffset === undefined && ann.startWordIndex === undefined) continue;
      }
      const offsets = resolveOffsets(ann, text);
      if (!offsets) continue;
      let range = ranges.find((r) => r.start === offsets.start && r.end === offsets.end);
      if (!range) {
        range = { start: offsets.start, end: offsets.end, textAnns: [], symbolAnns: [] };
        ranges.push(range);
      }
      if (!range.symbolAnns.some((s) => s.symbol === ann.symbol)) {
        range.symbolAnns.push(ann);
      }
    } else {
      // Text annotations: highlight / textColor / underline. Only those
      // contained in this verse — multi-verse selections aren't supported
      // in v1 export (rare; would need cross-verse stitching).
      if (ann.startRef.verse !== verse.ref.verse) continue;
      if (ann.endRef.verse !== verse.ref.verse) continue;
      const offsets = resolveOffsets(ann, text);
      if (!offsets) continue;
      let range = ranges.find((r) => r.start === offsets.start && r.end === offsets.end);
      if (!range) {
        range = { start: offsets.start, end: offsets.end, textAnns: [], symbolAnns: [] };
        ranges.push(range);
      }
      range.textAnns.push(ann);
    }
  }

  ranges.sort((a, b) => a.start - b.start);
  return ranges;
}

function inlineStyleFor(textAnns: TextAnnotation[]): string {
  const styles: string[] = [];
  for (const ann of textAnns) {
    const hex = getHighlightColorHex(ann.color as HighlightColor);
    if (ann.type === 'highlight') styles.push(`background-color:${hex}40`);
    if (ann.type === 'textColor') styles.push(`color:${hex}`);
    if (ann.type === 'underline') {
      styles.push('text-decoration:underline');
      styles.push(`text-decoration-color:${hex}`);
      styles.push(`text-decoration-style:${ann.underlineStyle || 'solid'}`);
    }
  }
  return styles.join(';');
}

function renderSymbol(symbol: SymbolKey, color: string | undefined, format: SymbolFormat): string {
  if (format === 'unicode') {
    const glyph = SYMBOLS[symbol] ?? '';
    if (!glyph) return '';
    const safe = escapeHtml(glyph);
    const colorStyle = color ? `color:${color};` : '';
    return `<span style="${colorStyle}font-weight:600;">${safe}</span>`;
  }
  const markup = getSymbolMarkup(symbol, color);
  return `<span style="display:inline-block;width:1em;height:1em;vertical-align:-0.1em;">${markup}</span>`;
}

function renderVerseHtml(verse: Verse, annotations: Annotation[], symbolFormat: SymbolFormat): string {
  const text = verse.text || '';
  if (!text) return '';

  // Verse-level prefix symbols (no word target): render before the text.
  const prefixSymbolHtml = annotations
    .filter(
      (a): a is SymbolAnnotation =>
        a.type === 'symbol' &&
        a.ref.verse === verse.ref.verse &&
        (a.position === 'before' || a.position === 'after') &&
        a.startOffset === undefined &&
        a.startWordIndex === undefined,
    )
    .map((a) => {
      const color = a.color ? getHighlightColorHex(a.color) : undefined;
      return renderSymbol(a.symbol, color, symbolFormat) + (symbolFormat === 'svg' ? '' : ' ');
    })
    .join('');

  const ranges = buildRangesForVerse(verse, annotations);
  if (ranges.length === 0) {
    return `${prefixSymbolHtml}${escapeHtml(text)}`;
  }

  // Walk through text and emit segments. Skip ranges that overlap previous
  // ones (rare; keeps the output safe even if the data is messy).
  const out: string[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) out.push(escapeHtml(text.slice(cursor, range.start)));
    const segment = text.slice(range.start, range.end);
    const style = inlineStyleFor(range.textAnns);
    if (range.symbolAnns.length > 0) {
      const sym = range.symbolAnns[0];
      const color = sym.color ? getHighlightColorHex(sym.color) : undefined;
      const symbolHtml = renderSymbol(sym.symbol, color, symbolFormat);
      const styleAttr = style ? ` style="${style}"` : '';
      const sep = symbolFormat === 'svg' ? '' : ' ';
      out.push(`${symbolHtml}${sep}<span${styleAttr}>${escapeHtml(segment)}</span>`);
    } else if (style) {
      out.push(`<span style="${style}">${escapeHtml(segment)}</span>`);
    } else {
      out.push(escapeHtml(segment));
    }
    cursor = range.end;
  }
  if (cursor < text.length) out.push(escapeHtml(text.slice(cursor)));

  return `${prefixSymbolHtml}${out.join('')}`;
}

function buildHtmlDocument(input: PassageExportInput): string {
  const { translation, book, chapter, verses, annotations, notes, sectionHeadings, chapterTitle, verseRange } = input;
  const symbolFormat: SymbolFormat = input.symbolFormat ?? 'svg';

  const range = verseRange ?? { start: verses[0]?.ref.verse ?? 1, end: verses[verses.length - 1]?.ref.verse ?? 0 };
  const inRange = verses.filter((v) => v.ref.verse >= range.start && v.ref.verse <= range.end);

  const rangeLabel = formatRangeLabel(book, chapter, verseRange);

  // Chapter title only when range starts at verse 1 — otherwise the title
  // belongs to the chapter as a whole, not to a partial slice.
  const showChapterTitle = !verseRange || verseRange.start === (verses[0]?.ref.verse ?? 1);
  const titleHtml = showChapterTitle && chapterTitle?.title
    ? `<h1 style="font-size:24pt;font-weight:600;text-align:center;margin:0 0 0.5em 0;">${escapeHtml(chapterTitle.title)}</h1>`
    : '';
  const themeHtml = showChapterTitle && chapterTitle?.theme
    ? `<p style="text-align:center;font-style:italic;color:#666;margin:0 0 1.5em 0;">${escapeHtml(chapterTitle.theme)}</p>`
    : '';

  const blocks: string[] = [];
  let lastHeadingId: string | null = null;

  // If the range starts partway through a section, show the section header
  // for context so the reader knows what passage the slice belongs to.
  if (inRange.length > 0) {
    const covering = findCoveringHeading(inRange[0].ref.verse, sectionHeadings);
    if (covering && covering.beforeRef.verse < inRange[0].ref.verse) {
      blocks.push(
        `<h2 style="font-size:14pt;font-weight:600;margin:1em 0 0.5em 0;color:#444;">${escapeHtml(covering.title)}</h2>`,
      );
      lastHeadingId = covering.id;
    }
  }

  for (const verse of inRange) {
    const headingAtVerse = sectionHeadings.find((h) => h.beforeRef.verse === verse.ref.verse);
    if (headingAtVerse && headingAtVerse.id !== lastHeadingId) {
      blocks.push(
        `<h2 style="font-size:14pt;font-weight:600;margin:1.2em 0 0.5em 0;color:#444;">${escapeHtml(headingAtVerse.title)}</h2>`,
      );
      lastHeadingId = headingAtVerse.id;
    }

    const verseAnns = annotations.filter((a) => {
      if (a.type === 'symbol') return a.ref.verse === verse.ref.verse;
      return a.startRef.verse <= verse.ref.verse && a.endRef.verse >= verse.ref.verse;
    });

    blocks.push(
      `<p style="margin:0 0 0.6em 0;line-height:1.6;text-indent:0;">` +
        `<sup style="font-weight:600;color:#888;margin-right:0.3em;">${verse.ref.verse}</sup>` +
        renderVerseHtml(verse, verseAnns, symbolFormat) +
        `</p>`,
    );

    const verseNotes = notes.filter(
      (n) => n.ref.verse === verse.ref.verse || (n.range && n.range.start.verse <= verse.ref.verse && n.range.end.verse >= verse.ref.verse),
    );
    for (const note of verseNotes) {
      blocks.push(
        `<aside style="margin:0 0 0.8em 1.5em;padding:0.5em 0.8em;border-left:3px solid #cbd5e1;background:#f8fafc;color:#334155;font-size:10pt;white-space:pre-wrap;">` +
          escapeHtml(note.content) +
          `</aside>`,
      );
    }
  }

  const attribution = getTranslationAttribution(translation);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(rangeLabel)} (${escapeHtml(translation.abbreviation)})</title>
<style>
  @page { margin: 0.75in; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #111;
    max-width: 7in;
    margin: 0 auto;
    padding: 0.5in 0.5in 1in 0.5in;
    font-size: 12pt;
    line-height: 1.6;
  }
  header { text-align: center; font-size: 11pt; color: #666; margin-bottom: 1em; }
  footer { margin-top: 2em; padding-top: 1em; border-top: 1px solid #ccc; font-size: 9pt; color: #555; text-align: center; }
</style>
</head>
<body>
<header>${escapeHtml(rangeLabel)} &middot; ${escapeHtml(translation.name)}</header>
${titleHtml}
${themeHtml}
${blocks.join('\n')}
<footer>${escapeHtml(attribution)}</footer>
</body>
</html>`;
}

function buildPlainText(input: PassageExportInput): string {
  const { translation, book, chapter, verses, notes, sectionHeadings, chapterTitle, verseRange } = input;
  const range = verseRange ?? { start: verses[0]?.ref.verse ?? 1, end: verses[verses.length - 1]?.ref.verse ?? 0 };
  const inRange = verses.filter((v) => v.ref.verse >= range.start && v.ref.verse <= range.end);
  const lines: string[] = [];

  lines.push(formatRangeLabel(book, chapter, verseRange));
  lines.push(translation.name);
  lines.push('');

  const showChapterTitle = !verseRange || verseRange.start === (verses[0]?.ref.verse ?? 1);
  if (showChapterTitle && chapterTitle?.title) lines.push(chapterTitle.title, '');
  if (showChapterTitle && chapterTitle?.theme) lines.push(chapterTitle.theme, '');

  let lastHeadingId: string | null = null;
  if (inRange.length > 0) {
    const covering = findCoveringHeading(inRange[0].ref.verse, sectionHeadings);
    if (covering && covering.beforeRef.verse < inRange[0].ref.verse) {
      lines.push(covering.title, '');
      lastHeadingId = covering.id;
    }
  }

  for (const verse of inRange) {
    const headingAtVerse = sectionHeadings.find((h) => h.beforeRef.verse === verse.ref.verse);
    if (headingAtVerse && headingAtVerse.id !== lastHeadingId) {
      lines.push('', headingAtVerse.title, '');
      lastHeadingId = headingAtVerse.id;
    }
    lines.push(`${verse.ref.verse} ${verse.text || ''}`);

    const verseNotes = notes.filter(
      (n) => n.ref.verse === verse.ref.verse || (n.range && n.range.start.verse <= verse.ref.verse && n.range.end.verse >= verse.ref.verse),
    );
    for (const note of verseNotes) {
      lines.push(`    Note: ${note.content.replace(/\s+/g, ' ').trim()}`);
    }
  }

  lines.push('', getTranslationAttribution(translation));
  return lines.join('\n');
}

export function formatPassageAsHtml(input: PassageExportInput): PassageExportOutput {
  return {
    html: buildHtmlDocument(input),
    plainText: buildPlainText(input),
  };
}

/**
 * Open the system print dialog with the given HTML. On macOS/Windows/Linux
 * the dialog includes "Save as PDF" — same code path covers both.
 *
 * Implementation notes:
 * - Uses `srcdoc` rather than `document.write`. WKWebView (Tauri on macOS)
 *   is unreliable about firing `onload` for written documents, so the
 *   print call would silently fire before content existed.
 * - Iframe has real paper-sized dimensions positioned offscreen. Zero-
 *   dimension hidden iframes don't actually trigger print in WKWebView.
 */
export function printPassage(html: string): void {
  const existing = document.querySelector('iframe[data-passage-print]');
  if (existing) existing.remove();

  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-passage-print', 'true');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.position = 'fixed';
  iframe.style.left = '-10000px';
  iframe.style.top = '0';
  iframe.style.width = '210mm';
  iframe.style.height = '297mm';
  iframe.style.border = '0';
  iframe.style.pointerEvents = 'none';
  iframe.srcdoc = html;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  iframe.addEventListener('load', () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    win.addEventListener('afterprint', () => setTimeout(cleanup, 200));
    // Safety net: clean up after 60s even if afterprint never fires.
    setTimeout(cleanup, 60_000);
    try {
      win.focus();
      win.print();
    } catch (err) {
      console.error('[passage-export] print failed', err);
      cleanup();
    }
  });

  document.body.appendChild(iframe);
}

/**
 * Copy the HTML (and plain-text fallback) to the system clipboard. Modern
 * browsers/Tauri WebViews support `ClipboardItem`; falls back to a hidden
 * contenteditable + execCommand path for older environments.
 */
export async function copyPassage(html: string, plainText: string): Promise<void> {
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plainText], { type: 'text/plain' }),
    });
    await navigator.clipboard.write([item]);
    return;
  }

  // Fallback: stage HTML in a contenteditable, select, copy.
  const staging = document.createElement('div');
  staging.contentEditable = 'true';
  staging.style.position = 'fixed';
  staging.style.left = '-9999px';
  staging.style.top = '0';
  staging.style.opacity = '0';
  staging.innerHTML = html;
  document.body.appendChild(staging);
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(staging);
  selection?.removeAllRanges();
  selection?.addRange(range);
  try {
    const ok = document.execCommand('copy');
    if (!ok) throw new Error('Clipboard copy was rejected');
  } finally {
    selection?.removeAllRanges();
    document.body.removeChild(staging);
  }
}
