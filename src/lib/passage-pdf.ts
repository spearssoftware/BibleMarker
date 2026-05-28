/**
 * Passage PDF export.
 *
 * Builds a real PDF (via pdfmake, dynamic-imported on first use) from the
 * chapter data the export popover already loads, then saves it through
 * Tauri's native save dialog and auto-opens it in the system's default
 * PDF viewer.
 *
 * Why pdfmake and not browser print: WKWebView (Tauri on macOS) has a
 * no-op window.print(), so the HTML-based approaches we tried earlier
 * never reached the print dialog. A PDF file works everywhere — user
 * gets a portable artifact they can print, email, or open in Preview
 * and copy text from into Word.
 *
 * Hard-capped at one chapter for licensing reasons (NASB Lockman / ESV
 * quotation guidelines).
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

interface AnnotationRange {
  start: number;
  end: number;
  textAnns: TextAnnotation[];
  symbolAnns: SymbolAnnotation[];
}

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

function buildRangesForVerse(verse: Verse, annotations: Annotation[]): AnnotationRange[] {
  const text = verse.text || '';
  const ranges: AnnotationRange[] = [];

  for (const ann of annotations) {
    if (ann.type === 'symbol') {
      if (ann.ref.verse !== verse.ref.verse) continue;
      if (ann.startOffset === undefined && ann.startWordIndex === undefined) continue;
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

interface PdfTextRun {
  text: string;
  color?: string;
  background?: string;
  decoration?: 'underline';
  decorationColor?: string;
  decorationStyle?: string;
  bold?: boolean;
  fontSize?: number;
}

function styleForTextAnns(textAnns: TextAnnotation[]): Partial<PdfTextRun> {
  const style: Partial<PdfTextRun> = {};
  for (const ann of textAnns) {
    const hex = getHighlightColorHex(ann.color as HighlightColor);
    if (ann.type === 'highlight') {
      // pdfmake doesn't blend backgrounds; use the same 25%-alpha hex the app uses on screen.
      style.background = `${hex}40`;
    }
    if (ann.type === 'textColor') {
      style.color = hex;
    }
    if (ann.type === 'underline') {
      style.decoration = 'underline';
      style.decorationColor = hex;
      style.decorationStyle = ann.underlineStyle || 'solid';
    }
  }
  return style;
}

/** Unicode glyph for a symbol key — `SYMBOLS[key]` is the source of truth. */
function symbolGlyph(symbol: SymbolKey): string {
  return SYMBOLS[symbol] ?? '';
}

/**
 * Convert a verse + its annotations into an array of pdfmake inline text
 * runs. Symbols become text runs with their Unicode glyph (Phosphor SVG
 * isn't reliably inline-renderable in pdfmake's text arrays; the glyph
 * preserves meaning and stays selectable).
 */
function buildVerseRuns(verse: Verse, annotations: Annotation[]): PdfTextRun[] {
  const text = verse.text || '';
  const runs: PdfTextRun[] = [];

  // Verse-level prefix symbols with no word target → render up front.
  for (const ann of annotations) {
    if (ann.type !== 'symbol' || ann.ref.verse !== verse.ref.verse) continue;
    if (ann.startOffset !== undefined || ann.startWordIndex !== undefined) continue;
    const glyph = symbolGlyph(ann.symbol);
    if (!glyph) continue;
    runs.push({
      text: `${glyph} `,
      color: ann.color ? getHighlightColorHex(ann.color) : undefined,
      bold: true,
    });
  }

  const ranges = buildRangesForVerse(verse, annotations);
  if (ranges.length === 0) {
    runs.push({ text });
    return runs;
  }

  let cursor = 0;
  for (const range of ranges) {
    if (range.start < cursor) continue;
    if (range.start > cursor) runs.push({ text: text.slice(cursor, range.start) });
    const segment = text.slice(range.start, range.end);

    if (range.symbolAnns.length > 0) {
      const sym = range.symbolAnns[0];
      const glyph = symbolGlyph(sym.symbol);
      const color = sym.color ? getHighlightColorHex(sym.color) : undefined;
      if (glyph) runs.push({ text: `${glyph} `, color, bold: true });
    }
    runs.push({ text: segment, ...styleForTextAnns(range.textAnns) });
    cursor = range.end;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor) });
  return runs;
}

/**
 * Build pdfmake's docDefinition for the export.
 * `Content` and friends from @types/pdfmake are looser than what we
 * actually emit; the structural types are correct so we let TS infer
 * via the shape rather than importing the lib's types directly (avoids
 * coupling this file to pdfmake's internal type layout).
 */
function buildDocDefinition(input: BuildPassagePdfInput): Record<string, unknown> {
  const { translation, book, chapter, verses, annotations, notes, sectionHeadings, chapterTitle, verseRange } = input;

  const range = verseRange ?? { start: verses[0]?.ref.verse ?? 1, end: verses[verses.length - 1]?.ref.verse ?? 0 };
  const inRange = verses.filter((v) => v.ref.verse >= range.start && v.ref.verse <= range.end);
  const rangeLabel = formatRangeLabel(book, chapter, verseRange);
  const showChapterTitle = !verseRange || verseRange.start === (verses[0]?.ref.verse ?? 1);

  const content: Record<string, unknown>[] = [
    {
      text: `${rangeLabel}  ·  ${translation.name}`,
      style: 'pageHeader',
    },
  ];

  if (showChapterTitle && chapterTitle?.title) {
    content.push({ text: chapterTitle.title, style: 'chapterTitle' });
    if (chapterTitle.theme) {
      content.push({ text: chapterTitle.theme, style: 'chapterTheme' });
    }
  }

  let lastHeadingId: string | null = null;
  if (inRange.length > 0) {
    const covering = findCoveringHeading(inRange[0].ref.verse, sectionHeadings);
    if (covering && covering.beforeRef.verse < inRange[0].ref.verse) {
      content.push({ text: covering.title, style: 'sectionHeading' });
      lastHeadingId = covering.id;
    }
  }

  for (const verse of inRange) {
    const headingAtVerse = sectionHeadings.find((h) => h.beforeRef.verse === verse.ref.verse);
    if (headingAtVerse && headingAtVerse.id !== lastHeadingId) {
      content.push({ text: headingAtVerse.title, style: 'sectionHeading' });
      lastHeadingId = headingAtVerse.id;
    }

    const verseAnns = annotations.filter((a) => {
      if (a.type === 'symbol') return a.ref.verse === verse.ref.verse;
      return a.startRef.verse <= verse.ref.verse && a.endRef.verse >= verse.ref.verse;
    });

    const runs = buildVerseRuns(verse, verseAnns);
    content.push({
      text: [
        { text: `${verse.ref.verse} `, style: 'verseNum' },
        ...runs,
      ],
      style: 'verse',
      margin: [0, 0, 0, 6],
    });

    const verseNotes = notes.filter(
      (n) => n.ref.verse === verse.ref.verse ||
        (n.range && n.range.start.verse <= verse.ref.verse && n.range.end.verse >= verse.ref.verse),
    );
    for (const note of verseNotes) {
      content.push({ text: note.content, style: 'note' });
    }
  }

  const attribution = getTranslationAttribution(translation);

  return {
    pageSize: 'LETTER',
    pageMargins: [54, 56, 54, 72] as [number, number, number, number],
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.35 },
    content,
    footer: (_currentPage: number, _pageCount: number) => ({
      text: attribution,
      alignment: 'center',
      fontSize: 8,
      color: '#666',
      margin: [54, 16, 54, 0],
    }),
    styles: {
      pageHeader: { fontSize: 9, color: '#666', alignment: 'center', margin: [0, 0, 0, 12] },
      chapterTitle: { fontSize: 18, bold: true, alignment: 'center', margin: [0, 0, 0, 4] },
      chapterTheme: { fontSize: 10, italics: true, color: '#555', alignment: 'center', margin: [0, 0, 0, 14] },
      sectionHeading: { fontSize: 13, bold: true, color: '#333', margin: [0, 10, 0, 6] },
      verseNum: { fontSize: 8, bold: true, color: '#888' },
      verse: { fontSize: 11 },
      note: { fontSize: 9, color: '#334', italics: true, margin: [18, 2, 0, 10] },
    },
  };
}

type PdfDoc = {
  getBuffer: (cb: (buf: Uint8Array) => void) => void;
  getBlob: (cb: (blob: Blob) => void) => void;
};
type PdfFontConfig = Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>;
type PdfMakeInstance = {
  createPdf: (def: unknown) => PdfDoc;
  addVirtualFileSystem?: (vfs: Record<string, string>) => void;
  vfs?: Record<string, string>;
  fonts?: PdfFontConfig;
};

let pdfMakePromise: Promise<PdfMakeInstance> | null = null;

/**
 * Lazy-load pdfmake + its font bundle. The font bundle is ~700 KB; we only
 * want it on disk for users who actually export. Vite code-splits this into
 * its own chunk. Cached so repeat exports skip the import.
 */
function loadPdfMake(): Promise<PdfMakeInstance> {
  if (pdfMakePromise) return pdfMakePromise;
  pdfMakePromise = (async () => {
    // pdfmake bundles PDFKit, which uses Node's `process.nextTick` inside
    // its stream callbacks. WKWebView (and most browsers) don't provide
    // `process`, so streams never advance and createPdf().getBuffer()
    // hangs silently with no callback. Shim the minimum surface pdfmake
    // needs before it loads.
    type ProcessShim = { nextTick: (cb: () => void) => void; browser?: boolean; env?: Record<string, string> };
    const w = window as unknown as { process?: ProcessShim };
    if (!w.process) {
      w.process = {
        nextTick: (cb: () => void) => setTimeout(cb, 0),
        browser: true,
        env: {},
      };
    } else if (typeof w.process.nextTick !== 'function') {
      w.process.nextTick = (cb: () => void) => setTimeout(cb, 0);
    }

    console.log('[passage-pdf] loading pdfmake…');
    const pdfMakeMod = (await import('pdfmake/build/pdfmake')) as unknown as { default?: PdfMakeInstance } & PdfMakeInstance;
    const pdfMake = (pdfMakeMod.default ?? pdfMakeMod) as PdfMakeInstance;
    if (typeof pdfMake.createPdf !== 'function') {
      throw new Error('pdfmake module did not expose createPdf; import shape unexpected.');
    }
    console.log('[passage-pdf] loading vfs_fonts…');
    const vfsMod = (await import('pdfmake/build/vfs_fonts')) as unknown as { default?: Record<string, string> } & Record<string, string>;
    // vfs_fonts ships as UMD: in some Vite resolutions the default export is
    // the vfs map, in others the module *is* the vfs map. Accept both.
    const candidate = vfsMod.default ?? vfsMod;
    const vfs = (typeof candidate === 'object' && candidate && 'Roboto-Regular.ttf' in candidate)
      ? (candidate as Record<string, string>)
      : (vfsMod as Record<string, string>);
    if (!vfs || !('Roboto-Regular.ttf' in vfs)) {
      throw new Error('pdfmake vfs_fonts did not include Roboto — font bundle import failed.');
    }
    if (typeof pdfMake.addVirtualFileSystem === 'function') {
      pdfMake.addVirtualFileSystem(vfs);
    } else {
      pdfMake.vfs = vfs;
    }
    // pdfmake's UMD usually sets pdfMake.fonts to the Roboto default, but
    // when loaded via ESM dynamic import that initialization doesn't always
    // run, leaving fonts undefined → createPdf hangs silently. Set it
    // explicitly so the docDefinition's default font resolves.
    pdfMake.fonts = {
      Roboto: {
        normal: 'Roboto-Regular.ttf',
        bold: 'Roboto-Medium.ttf',
        italics: 'Roboto-Italic.ttf',
        bolditalics: 'Roboto-MediumItalic.ttf',
      },
    };
    console.log('[passage-pdf] pdfmake ready.');
    return pdfMake;
  })();
  // Don't cache failures — let the next attempt try again.
  pdfMakePromise.catch(() => { pdfMakePromise = null; });
  return pdfMakePromise;
}

function generatePdfBytes(pdfMake: PdfMakeInstance, docDef: unknown, timeoutMs: number): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`PDF generation timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);
    try {
      pdfMake.createPdf(docDef).getBuffer((buf) => {
        clearTimeout(timeout);
        resolve(buf);
      });
    } catch (err) {
      clearTimeout(timeout);
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

export async function buildPassagePdf(input: BuildPassagePdfInput): Promise<Uint8Array> {
  const pdfMake = await loadPdfMake();

  // Probe with a trivial document first. If pdfmake itself is broken (e.g.
  // Vite/UMD bundling stripped its Buffer polyfill), this hangs too — which
  // tells us the problem isn't our docDefinition.
  console.log('[passage-pdf] probing pdfmake with a trivial document…');
  try {
    const probeBytes = await generatePdfBytes(pdfMake, {
      content: ['probe'],
      defaultStyle: { font: 'Roboto', fontSize: 12 },
    }, 5_000);
    console.log('[passage-pdf] probe ok, size=', probeBytes?.length ?? 'unknown');
  } catch (err) {
    console.error('[passage-pdf] probe FAILED — pdfmake itself is not generating:', err);
    throw new Error('pdfmake is not generating PDFs in this environment. See console for details.');
  }

  const docDef = buildDocDefinition(input);
  console.log('[passage-pdf] generating real PDF buffer…');
  const buf = await generatePdfBytes(pdfMake, docDef, 30_000);
  console.log('[passage-pdf] PDF buffer ready, size=', buf?.length ?? 'unknown');
  return buf;
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
 * - **Desktop (macOS/Windows/Linux/Android):** show Tauri's native save
 *   dialog so the user picks the location. Android uses the Storage
 *   Access Framework via the same call.
 * - **iOS:** Tauri 2 doesn't bridge an iOS save dialog. Mirror the
 *   pattern in `src/lib/export.ts:392` — write directly to the app's
 *   Documents directory under an `exports/` subfolder. The file is then
 *   visible in the Files app under "BibleMarker".
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

/**
 * Open a previously-saved PDF in the system default viewer.
 *
 * - macOS/Windows/Linux: launches Preview / default PDF app.
 * - Android: fires an `ACTION_VIEW` intent (system "Open with…").
 * - iOS: best-effort. Tauri's iOS opener support is limited; if the
 *   call throws, the popover surfaces the file path so the user can
 *   find it in the Files app.
 */
export async function openSavedPdf(path: string): Promise<void> {
  const { openPath } = await import('@tauri-apps/plugin-opener');
  await openPath(path);
}
