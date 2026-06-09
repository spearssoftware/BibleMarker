/**
 * Combined export: a chapter passage followed by the active study's observation
 * report, rendered into a single PDF. Each section keeps its own title block,
 * running header, and footer (footers are stamped per section's page range by
 * the shared PageWriter), with a page break between them.
 */

import type { Study } from '@/types';
import { getBookById } from '@/types';
import { loadJsPDF } from '@/lib/pdf/page-writer';
import { slugify } from '@/lib/pdf/save';
import {
  passageFilename,
  renderPassageIntoDoc,
  type BuildPassagePdfInput,
} from '@/lib/passage-pdf';
import {
  gatherStudyObservationInput,
  renderObservationIntoDoc,
} from '@/lib/observation-pdf';

/** Build one PDF with the passage section first and the study report after. */
export async function buildChapterAndStudyPdf(
  passage: BuildPassagePdfInput,
  study: Study,
): Promise<Uint8Array> {
  // The study's DB gather is independent of the passage render — start it first
  // so its queries overlap the passage's keyword/rasterize pass.
  const obsInputP = gatherStudyObservationInput(study);
  const jsPDF = await loadJsPDF();
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  await renderPassageIntoDoc(doc, passage);
  doc.addPage(); // the study report starts on its own page with its title block
  await renderObservationIntoDoc(doc, await obsInputP);
  return new Uint8Array(doc.output('arraybuffer'));
}

/** e.g. "Ezekiel-1-and-Ezekiel-study.pdf". */
export function chapterAndStudyFilename(passage: BuildPassagePdfInput, study: Study): string {
  const base = passageFilename(passage).replace(/\.pdf$/, '');
  const studySlug = slugify(getBookById(study.book ?? '')?.name ?? study.name);
  return `${base}-and-${studySlug || 'study'}-study.pdf`;
}
