/**
 * Passage PDF export.
 *
 * Builds a PDF (via jsPDF, dynamic-imported on first use) from the chapter
 * data the export popover loads, then saves it through Tauri's native
 * save dialog and auto-opens it in the system's default PDF viewer.
 *
 * The reusable layout engine (PageWriter), jsPDF loader, symbol rasterizer,
 * and save flow live in `./pdf/*`; this module adds passage-specific verse
 * rendering via a PageWriter subclass.
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
import { getBookById, getHighlightColorHex, type HighlightColor } from '@/types';
import { getModuleCopyright, ESV_COPYRIGHT, type ApiTranslation } from '@/lib/bible-api';
import { findKeywordMatches } from '@/lib/keywordMatching';
import { filterPresetsByStudy } from '@/lib/studyFilter';
import { PageWriter, hexToRgb, loadJsPDF, type JsPDFDoc } from '@/lib/pdf/page-writer';
import { buildIconCache, iconCacheKey } from '@/lib/pdf/symbol-cache';
import { savePdfBytes, openSavedPdf } from '@/lib/pdf/save';

export { openSavedPdf };

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

interface VerseToken {
  text: string;
  startOffset: number;
  endOffset: number;
}

/** Split verse text into whitespace-separated tokens, preserving each
 *  token's character offsets in the original string so we can match
 *  annotation ranges precisely. */
function tokenizeVerse(text: string): VerseToken[] {
  const tokens: VerseToken[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tokens.push({
      text: m[0],
      startOffset: m.index,
      endOffset: m.index + m[0].length,
    });
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

/** PageWriter with passage-specific verse layout. */
class PassagePageWriter extends PageWriter {
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
  writeVerse(verseNum: number, body: string, annotations: Annotation[], iconCache: Map<string, string>): void {
    const fontSize = 11;
    const lineHeight = fontSize * 1.3;
    const iconSize = 11.5;
    const iconGap = 2;
    const symbolRow = iconSize + iconGap; // reserved above every line for consistent leading

    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(fontSize);

    const numLabel = `${verseNum} `;
    // Measure with the bold face the number is actually drawn in, so the body
    // gutter matches the rendered width. Floor at 10pt so the body never collapses
    // onto the number if metrics are unavailable.
    this.doc.setFont('helvetica', 'bold');
    const numWidth = Math.max(10, this.doc.getTextWidth(numLabel));
    this.doc.setFont('helvetica', 'normal');
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

      // Render one normalized space between words regardless of the source
      // whitespace. Some provider text has double/odd spaces that HTML collapses
      // on screen but the PDF would otherwise honor literally (uneven gaps).
      // Annotation matching uses token offsets, not this width, so marks stay aligned.
      const leadingW = firstOnLine ? 0 : this.doc.getTextWidth(' ');
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
            const dataUrl = iconCache.get(iconCacheKey(sym.symbol, colorHex));
            if (dataUrl) this.doc.addImage(dataUrl, 'PNG', ix, iy, iconSize, iconSize);
            ix += iconSize + 1;
          }
        }
      }

      this.y += lineHeight;
    }
  }
}

// --- Document builder --------------------------------------------------------

/**
 * Render the passage section onto an existing doc, starting at its current
 * page. Lets a combined export append other sections; standalone exports pass
 * a fresh single-page doc.
 */
export async function renderPassageIntoDoc(doc: JsPDFDoc, input: BuildPassagePdfInput): Promise<void> {
  const { translation, book, chapter, verses, annotations, notes, sectionHeadings, chapterTitle, verseRange } = input;
  const writer = new PassagePageWriter(doc);

  const presets = input.presets ?? [];
  const exclusions = input.exclusions ?? [];
  const filteredPresets = filterPresetsByStudy(presets, input.activeStudyId ?? null);

  const range = verseRange ?? { start: verses[0]?.ref.verse ?? 1, end: verses[verses.length - 1]?.ref.verse ?? 0 };
  const inRange = verses.filter((v) => v.ref.verse >= range.start && v.ref.verse <= range.end);

  // Per-verse combined annotation lists (persisted + virtual keyword matches).
  // Built once up front so we can pre-rasterize every unique symbol icon
  // in a single async pass before the (sync) PDF doc-building pass.
  const verseAnnotations = new Map<number, Annotation[]>();
  for (const verse of inRange) {
    const verseAnns = annotations.filter((a) => {
      if (a.type === 'symbol') return a.ref.verse === verse.ref.verse;
      return a.startRef.verse <= verse.ref.verse && a.endRef.verse >= verse.ref.verse;
    });
    const virtualAnns = filteredPresets.length > 0
      ? findKeywordMatches(verse.text || '', verse.ref, filteredPresets, translation.id, exclusions)
      : [];
    verseAnnotations.set(verse.ref.verse, [...verseAnns, ...virtualAnns]);
  }
  const iconCache = await buildIconCache([...verseAnnotations.values()], 14);

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
}

export async function buildPassagePdf(input: BuildPassagePdfInput): Promise<Uint8Array> {
  const jsPDF = await loadJsPDF();
  console.log('[passage-pdf] building PDF…');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  await renderPassageIntoDoc(doc, input);
  const bytes = new Uint8Array(doc.output('arraybuffer'));
  console.log('[passage-pdf] PDF ready, bytes=', bytes.length);
  return bytes;
}

/** Filesystem-safe slug for a filename — e.g. "Jeremiah 46:5–12" → "Jeremiah-46-5-12". */
export function passageFilename(input: BuildPassagePdfInput): string {
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
 * Build the PDF and write it to disk (native dialog on desktop/Android, the
 * Documents/exports directory on iOS). Returns the saved path, or
 * `{ cancelled: true }` if the user dismissed the dialog.
 */
export async function savePassagePdf(
  input: BuildPassagePdfInput,
): Promise<{ path: string } | { cancelled: true }> {
  const bytes = await buildPassagePdf(input);
  return savePdfBytes(bytes, passageFilename(input));
}
