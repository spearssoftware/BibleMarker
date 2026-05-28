/**
 * Passage Capture
 *
 * Snapshots the on-screen rendering of the current chapter — with all the
 * user's annotations, highlights, symbols, chapter title, section headings,
 * and notes exactly as they appear — and writes it out as a self-contained
 * HTML file that opens in the system browser.
 *
 * Why this approach (vs. re-laying out from data):
 * - Symbols come through as their actual rendered Phosphor SVGs, not Unicode
 *   approximations.
 * - Tailwind/CSS-variable styling is captured as inline computed styles, so
 *   the output looks like the app.
 * - Hands the file to the system browser, which has a real Print dialog
 *   (with Save-as-PDF on every desktop OS) and reliable Word/Pages paste.
 *   Tauri's WKWebView has neither.
 *
 * Hard-capped at one chapter for licensing reasons (NASB Lockman /
 * ESV quotation guidelines).
 */

import { getBookById } from '@/types';
import { getModuleCopyright, ESV_COPYRIGHT, type ApiTranslation } from '@/lib/bible-api';

export interface CapturePassageInput {
  translation: ApiTranslation;
  book: string;
  chapter: number;
  /** Inclusive verse range. Omit to capture the entire chapter. */
  verseRange?: { start: number; end: number };
}

/** Translation copyright/attribution block used in the footer. */
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

/** Elements (selectors) that are interactive chrome and shouldn't appear in the export. */
const STRIP_SELECTORS = [
  '.annotation-remove',
  '[data-verse-menu]',
  '[role="menu"]',
  '[role="dialog"]:not([data-passage-root] [role="dialog"])',
  'button[aria-label*="delete" i]',
  'button[aria-label*="remove" i]',
  'button[aria-label*="edit" i]',
  // The in-app translation copyright block — our exported footer carries
  // the authoritative attribution; leaving the live one in produces a
  // duplicate copyright block in the PDF/print output.
  '[data-copyright-notice]',
];

/**
 * Layout-related computed properties that should NOT be carried into the
 * exported document. The on-screen values are sized to the app window, not
 * the printed page — inlining e.g. `width: 1280px` on the chapter root or
 * `height: 24px` on a verse cell (from a `min-h-[1.5rem]` class) causes
 * overflow and stacked verses on the page. Letting the page lay out
 * naturally with our CSS overrides produces a readable result.
 *
 * `display` is intentionally preserved so symbol overlays keep their
 * `inline-flex` etc. and verse spans stay inline.
 */
const SKIP_COMPUTED_PROPS = new Set([
  'width', 'height',
  'min-width', 'min-height',
  'max-width', 'max-height',
  'flex', 'flex-basis', 'flex-grow', 'flex-shrink',
  'grid-template-columns', 'grid-template-rows', 'grid-template-areas',
  'grid-area', 'grid-column', 'grid-row',
  'grid-auto-columns', 'grid-auto-rows', 'grid-auto-flow',
  'position', 'top', 'left', 'right', 'bottom',
  'overflow', 'overflow-x', 'overflow-y',
  'contain', 'content-visibility',
  'transform-origin',
]);

/**
 * Walk a cloned subtree, inlining computed styles from the live counterpart
 * and stripping interactive chrome and class names. `live` is the original
 * on-screen element, `cloned` is the deep-clone we're transforming. Both
 * trees must have the same shape — the clone wasn't modified before this
 * runs except by `cloneNode(true)`.
 */
function inlineStyles(live: Element, cloned: Element): void {
  if (live instanceof HTMLElement || live instanceof SVGElement) {
    const computed = window.getComputedStyle(live);
    const styleProps: string[] = [];
    for (let i = 0; i < computed.length; i++) {
      const prop = computed[i];
      if (SKIP_COMPUTED_PROPS.has(prop)) continue;
      const value = computed.getPropertyValue(prop);
      if (!value) continue;
      styleProps.push(`${prop}:${value}`);
    }
    (cloned as HTMLElement | SVGElement).setAttribute('style', styleProps.join(';'));
  }
  cloned.removeAttribute('class');

  const liveChildren = Array.from(live.children);
  const clonedChildren = Array.from(cloned.children);
  const len = Math.min(liveChildren.length, clonedChildren.length);
  for (let i = 0; i < len; i++) {
    inlineStyles(liveChildren[i], clonedChildren[i]);
  }
}

/** Remove interactive chrome from the cloned subtree before inlining styles. */
function stripChrome(root: Element): void {
  for (const sel of STRIP_SELECTORS) {
    root.querySelectorAll(sel).forEach((el) => el.remove());
  }
  // Drop any element that's display:none on screen — captures things like
  // closed dropdowns whose markup is still in the tree.
  root.querySelectorAll('*').forEach((el) => {
    if (!(el instanceof HTMLElement)) return;
    if (window.getComputedStyle(el).display === 'none') el.remove();
  });
}

/**
 * Build a standalone HTML document from the on-screen chapter rendering.
 * Falls back to a friendly error string if the chapter root isn't mounted
 * (caller should surface this to the user).
 */
export function captureChapterHtml(input: CapturePassageInput): { html: string; pageTitle: string } {
  const { translation, book, chapter, verseRange } = input;

  const root = document.querySelector(
    `[data-passage-root][data-passage-book="${book}"][data-passage-chapter="${chapter}"]`,
  );
  if (!root) {
    throw new Error(`Chapter ${book} ${chapter} is not currently rendered — open the chapter in the reader and try again.`);
  }
  const primaryId = root.getAttribute('data-passage-primary') ?? translation.id;

  const rangeLabel = formatRangeLabel(book, chapter, verseRange);
  const pageTitle = `${rangeLabel} (${translation.abbreviation})`;

  // Work on a deep clone so the inlining + pruning doesn't touch live state.
  const clone = root.cloneNode(true) as HTMLElement;

  // Translation headers row — just translation names + loading spinners.
  // Not needed in the export.
  clone.querySelectorAll('[data-translation-id]').forEach(() => {
    /* leave verse cells in place; the translation-name header row is a
       different element — handled below by display:none stripping after
       we drop sibling translation columns. */
  });

  // Drop verse cells for non-primary translations so a multi-translation
  // view exports as a single readable column.
  clone.querySelectorAll('[data-translation-id]').forEach((cell) => {
    if (cell.getAttribute('data-translation-id') !== primaryId) cell.remove();
  });

  // Filter verses to the selected range and drop their preceding headings
  // when the heading no longer leads into a kept verse.
  if (verseRange) {
    clone.querySelectorAll('[data-verse]').forEach((row) => {
      const v = parseInt(row.getAttribute('data-verse') ?? '', 10);
      if (Number.isFinite(v) && (v < verseRange.start || v > verseRange.end)) {
        const wrapper = row.parentElement; // wrapper div that holds heading + row + notes
        if (wrapper) wrapper.remove();
        else row.remove();
      }
    });
    // If the kept range doesn't start at verse 1, suppress the chapter title.
    if (verseRange.start > 1) {
      clone.querySelectorAll('[data-chapter-title]').forEach((el) => el.remove());
    }
  }

  // Drop the translation-headers row (it's the first grid row of translation
  // names above the verses) — identified structurally as the only
  // bg-scripture-elevated row that's a sibling to the verse container. We
  // approximate by finding any element whose only children are translation
  // name strings; safer is to look for the header by its grid + bg combo
  // marker. Skipping for now: it just shows the translation name(s), which
  // is duplicated in our header and footer.
  // Instead, drop common heading-row markers by attribute hint:
  const headersRow = clone.querySelector('[data-translation-headers]');
  if (headersRow) headersRow.remove();

  // Strip interactive chrome and hidden elements.
  stripChrome(clone);

  // Walk and inline styles.
  inlineStyles(root, clone);

  // Re-inline the clone's root style (root is the wrapper itself).
  // inlineStyles already handled it above.

  const attribution = getTranslationAttribution(translation);

  const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(pageTitle)}</title>
<style>
  @page { margin: 0.75in; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: Georgia, 'Times New Roman', serif;
    color: #111;
    background: #fff;
    padding: 0.5in;
    max-width: 7.5in;
    margin: 0 auto;
  }
  .passage-header {
    text-align: center;
    font-size: 11pt;
    color: #555;
    margin-bottom: 1em;
    padding-bottom: 0.5em;
    border-bottom: 1px solid #ddd;
  }
  .passage-footer {
    margin-top: 2em;
    padding-top: 1em;
    border-top: 1px solid #ddd;
    font-size: 9pt;
    color: #555;
    text-align: center;
  }
  /* Reset app-specific layout so the captured DOM flows on the printed page
     instead of carrying over screen widths and flex/grid containers. The
     captured root has inlined computed styles like "width: 1280px" and
     "display: flex; flex: 1" which would overflow / shift the page. */
  [data-passage-root] {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    height: auto !important;
    max-height: none !important;
    flex: none !important;
    overflow: visible !important;
    background: transparent !important;
    padding: 0 !important;
    margin: 0 !important;
  }
  [data-passage-root] * {
    max-width: 100% !important;
    min-width: 0 !important;
    overflow: visible !important;
    max-height: none !important;
    backdrop-filter: none !important;
    box-shadow: none !important;
  }
  /* Verse rows are 1–3 column grids on screen; we keep only the primary
     translation cell, so the empty grid columns would push the kept cell
     into a fraction of the page. Force back to single-column block flow. */
  [data-passage-root] [data-verse] {
    display: block !important;
    grid-template-columns: none !important;
  }
  [data-passage-root] [data-translation-id] {
    display: block !important;
    width: 100% !important;
  }
  button { display: none !important; }
  /* Page break hints */
  h1, h2, h3 { page-break-after: avoid; }
  p, aside { page-break-inside: avoid; }
</style>
</head>
<body>
<div class="passage-header">${escapeHtml(rangeLabel)} &middot; ${escapeHtml(translation.name)}</div>
${clone.outerHTML}
<div class="passage-footer">${escapeHtml(attribution)}</div>
</body>
</html>`;

  return { html: doc, pageTitle };
}

/** Filesystem-safe slug for a passage label, e.g. "John 3:5–12" → "John-3-5-12". */
function slugForFilename(label: string): string {
  return label
    .normalize('NFKD')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

/**
 * Write the HTML to a temp file under the app data directory and open it
 * with the system default app (the user's browser, for .html). On web /
 * non-Tauri, opens via a blob URL in a new tab as a best-effort fallback.
 */
export async function openHtmlInBrowser(html: string, basename: string): Promise<void> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (!isTauri) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    if (!win) throw new Error('Browser blocked the new tab — allow popups and try again.');
    // Don't revoke immediately — let the new tab finish loading.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }

  const { appDataDir, join } = await import('@tauri-apps/api/path');
  const { exists, mkdir, writeTextFile } = await import('@tauri-apps/plugin-fs');
  const { openPath } = await import('@tauri-apps/plugin-opener');

  const dir = await appDataDir();
  const exportsDir = await join(dir, 'exports');
  if (!(await exists(exportsDir))) {
    await mkdir(exportsDir, { recursive: true });
  }
  const safe = slugForFilename(basename) || 'passage';
  const filePath = await join(exportsDir, `${safe}.html`);
  await writeTextFile(filePath, html);
  await openPath(filePath);
}
