import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { PageWriter, DEFAULT_OPTS, type JsPDFDoc } from './page-writer';

/**
 * Regression: a page break inside a multi-line block must not leak the running
 * header's 9pt font onto the body that continues on the new page. Previously
 * `ensureSpace` left the font at the header size, so the first content on a new
 * page (e.g. the top verse) rendered too small inside slots measured at the
 * body size, producing wide word gaps.
 */
describe('PageWriter page-break font state', () => {
  it('restores font size after a header-drawing page break', () => {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' }) as unknown as JsPDFDoc;

    // Record the active font size, color, and y position at every text draw.
    const original = doc.text.bind(doc);
    const draws: { size: number; color: string; y: number }[] = [];
    doc.text = ((...args: Parameters<JsPDFDoc['text']>) => {
      draws.push({ size: doc.getFontSize(), color: doc.getTextColor(), y: args[2] });
      return original(...args);
    }) as JsPDFDoc['text'];

    const writer = new PageWriter(doc);
    writer.setHeader('Running Header'); // only drawn on page 2+

    // A block tall enough to span past the first page and force a break mid-block.
    const bodySize = 11;
    const longText = Array.from({ length: 600 }, (_, i) => `line ${i} of body text`).join(' ');
    writer.writeBlock(longText, { fontSize: bodySize, color: [20, 20, 20] });

    expect(doc.getNumberOfPages()).toBeGreaterThan(2); // multiple page breaks happened

    // The running header draws at 9pt above the top margin on each new page.
    // Body draws (below the margin) must all keep the block size — with the leak
    // the body continuing after a header would render at 9pt instead.
    const headerDraws = draws.filter((d) => d.y < DEFAULT_OPTS.marginTop);
    const bodyDraws = draws.filter((d) => d.y >= DEFAULT_OPTS.marginTop);
    expect(headerDraws.length).toBeGreaterThan(0); // headers were drawn on new pages
    expect(bodyDraws.length).toBeGreaterThan(0);
    expect(bodyDraws.every((d) => d.size === bodySize)).toBe(true);
    // Color survives each break unchanged — body stays its own color, never the
    // header's gray. (Assert consistency, not an exact hex: jsPDF's grayscale
    // encoding round-trips equal channels with a 1/255 offset.)
    const bodyColor = bodyDraws[0].color;
    expect(bodyColor).not.toBe(headerDraws[0].color);
    expect(bodyDraws.every((d) => d.color === bodyColor)).toBe(true);
  });
});
