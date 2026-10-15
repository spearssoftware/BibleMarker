import { describe, it, expect } from 'vitest';
import { headingProse, parseEntry } from './osis';

const PV_START = '<div type="x-milestone" subType="x-preverse" sID="pv1"/>';
const PV_END = '<div type="x-milestone" subType="x-preverse" eID="pv1"/>';
const P = (id: string, text: string) => `<div sID="${id}" type="x-p"/> ${text} <div eID="${id}" type="x-p"/>`;

function texts(paragraphs: { text: string }[][]): string[] {
  return paragraphs.map((p) => p.map((r) => r.text).join(''));
}

describe('parseEntry', () => {
  it('splits book intro, label and body, dropping titles and the label', () => {
    const raw =
      `${PV_START}<title type="x-ms">Luke</title> <div sID="i1" type="introduction"/>${P('a', 'Intro text.')}` +
      `<div eID="i1" type="introduction"/> <title type="x-s2">Chapter 1</title> ${P('b', '')}` +
      `<div sID="c" type="x-p"/> ${PV_END}<hi type="bold">Verses 1-4</hi> <div eID="c" type="x-p"/>` +
      `${P('d', 'First   body\nparagraph.')} ${P('e', 'Second.')}`;
    const parsed = parseEntry(raw);
    expect(texts(parsed.bookIntro)).toEqual(['Intro text.']);
    expect(parsed.preLabel).toEqual([]);
    expect(parsed.hasLabel).toBe(true);
    expect(texts(parsed.body)).toEqual(['First body paragraph.', 'Second.']);
  });

  it('collects table outline rows and trims trailing punctuation from titles', () => {
    const raw =
      `${PV_START}<title type="x-s2">Chapter 1</title> <title type="x-IS">Chapter Outline</title>` +
      '<table> <row><cell>The Preface.</cell><cell>(1-4)</cell></row> </table>' +
      '<table> <row><cell>Sickness--</cell><cell>(5)</cell></row> </table>' +
      '<table> <row><cell>Parables;</cell><cell>(24-30; 36-43)</cell></row> </table>' +
      `${PV_END}<hi type="bold">Verses 1-4</hi> ${P('x', 'Body.')}`;
    expect(parseEntry(raw).outline).toEqual([
      { start: 1, title: 'The Preface' },
      { start: 5, title: 'Sickness' },
      { start: 24, title: 'Parables' },
    ]);
  });

  it('harvests plain-text outlines after the preverse and removes them from the text', () => {
    const raw =
      `${PV_START}<title type="x-s2">Chapter 21</title> <div sID="a" type="x-p"/> ${PV_END}Chapter Outline <div eID="a" type="x-p"/>` +
      `${P('b', 'Birth of Isaac.')} ${P('c', '(1-8)')} ${P('d', 'Ishmael mocks Isaac.')} ${P('e', '(9-13)')}` +
      `${PV_START}${P('f', `${PV_END}<hi type="bold">Verses 1-8</hi>`)} ${P('g', 'Body.')}`;
    const parsed = parseEntry(raw);
    expect(parsed.outline).toEqual([
      { start: 1, title: 'Birth of Isaac' },
      { start: 9, title: 'Ishmael mocks Isaac' },
    ]);
    expect(parsed.preLabel).toEqual([]);
    expect(texts(parsed.body)).toEqual(['Body.']);
  });

  it('harvests plain-text outlines inside the preverse and discards the rest of the preverse', () => {
    const raw =
      `${PV_START}<title type="x-s2">Chapter 23</title> <title type="x-IS">Chapter Outline</title>` +
      `${P('a', 'The death of Sarah.')} ${P('b', '(1-13)')} ${P('c', 'Stray.')}` +
      `<div sID="d" type="x-p"/> ${PV_END}<hi type="bold">Verses 1-13</hi> <div eID="d" type="x-p"/> ${P('e', 'Body.')}`;
    const parsed = parseEntry(raw);
    expect(parsed.outline).toEqual([{ start: 1, title: 'The death of Sarah' }]);
    expect(parsed.bookIntro).toEqual([]);
    expect(parsed.preLabel).toEqual([]);
  });

  it('harvests one-paragraph outlines with or without reference markup', () => {
    const withRefs = parseEntry(
      `${PV_START}${P('a', `${PV_END}The taking of Babylon. (<reference osisRef="Isa.21.1-Isa.21.10">Is. 21:1-10</reference>) ` +
        'Of the Edomites. (<reference osisRef="Isa.21.11">Is. 21:11</reference>,<reference osisRef="Isa.21.12">12</reference>)')}` +
        `<hi type="bold">Verses 1-10</hi> ${P('b', 'Body.')}`
    );
    expect(withRefs.outline).toEqual([
      { start: 1, title: 'The taking of Babylon' },
      { start: 11, title: 'Of the Edomites' },
    ]);
    expect(withRefs.preLabel).toEqual([]);

    const plain = parseEntry(`${PV_START}${PV_END}${P('a', 'All is vain. (Eccl. 1:1-3) Nothing new. (Eccl. 1:9-11)')}`);
    expect(plain.outline.map((r) => r.start)).toEqual([1, 9]);
    expect(plain.preLabel).toEqual([]);
  });

  it('keeps prose that merely contains a parenthesised reference', () => {
    const parsed = parseEntry(`${PV_START}${PV_END}${P('a', 'Read this (ch. 5:3) and then go on.')}`);
    expect(parsed.outline).toEqual([]);
    expect(texts(parsed.preLabel)).toEqual(['Read this (ch. 5:3) and then go on.']);
  });

  it('treats an entry without a label as all pre-label prose', () => {
    const parsed = parseEntry(
      `${PV_START}<title type="x-s2">Chapter 36</title> <div sID="a" type="x-p"/> ${PV_END}Esau and his descendants. <div eID="a" type="x-p"/>` +
        P('b', '--The registers.')
    );
    expect(parsed.hasLabel).toBe(false);
    expect(texts(parsed.preLabel)).toEqual(['Esau and his descendants.', '—The registers.']);
  });

  it('keeps adjacent references as separate runs and decodes entities and source artifacts', () => {
    const parsed = parseEntry(
      `${P('a', 'Seen <reference osisRef="Acts.16.10">Ac 16:10</reference>, <reference osisRef="Acts.16.11">11</reference> &amp; ver. #(2) &quot;so&quot;--yes')}`
    );
    expect(parsed.preLabel).toEqual([
      [
        { text: 'Seen ' },
        { text: 'Ac 16:10', osisRef: 'Acts.16.10' },
        { text: ', ' },
        { text: '11', osisRef: 'Acts.16.11' },
        { text: ' & ver. (2) "so"—yes' },
      ],
    ]);
  });

  it('renders a reference to an unknown book as plain text', () => {
    const parsed = parseEntry(P('a', 'See <reference osisRef="Tob.1.1">Tob 1:1</reference> here.'));
    expect(parsed.preLabel).toEqual([[{ text: 'See Tob 1:1 here.' }]]);
  });

  it('renders a chapter-only reference as plain text', () => {
    const parsed = parseEntry(P('a', 'See <reference osisRef="Ps.23">Ps 23</reference> here.'));
    expect(parsed.preLabel).toEqual([[{ text: 'See Ps 23 here.' }]]);
  });

  it('removes the rest of a label the source left outside the bold element', () => {
    const parsed = parseEntry(`${P('a', '<hi type="bold">Verses 24-30</hi>')} ${P('b', ', 36-43 This parable.')}`);
    expect(texts(parsed.body)).toEqual(['This parable.']);
    const single = parseEntry(`<hi type="bold">Verse 7</hi> ,8 Frequently.`);
    expect(texts(single.body)).toEqual(['Frequently.']);
  });
});

describe('headingProse', () => {
  it('returns heading-slot prose, ignoring an unclosed preverse and titles', () => {
    const raw =
      `<chapter n="19" osisID="Lev.19" sID="Lev.19"/> <div eID="z" type="x-p"/> ${PV_START}<title type="x-s2">Chapter 19</title>` +
      `${P('a', 'laws.')} ${P('b', '--There are some precepts, ver. #(2).')}`;
    expect(texts(headingProse(raw))).toEqual(['laws.', '—There are some precepts, ver. (2).']);
  });

  it('returns nothing for a heading slot with only markup', () => {
    expect(headingProse('<chapter n="1" osisID="Luke.1" sID="Luke.1"/> ')).toEqual([]);
  });
});
